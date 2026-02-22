import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getValidAccessToken, todayUTC, incrementInspections, GOOGLE_DAILY_INSPECTION_LIMIT } from "@/lib/google-auth";
import { sendCronErrorAlert, sendTokenExpiredEmail } from "@/lib/email";

/**
 * POST /api/cron/weekly-resync
 *
 * Weekly job — re-checks which submitted URLs are now indexed via the
 * Google Search Console URL Inspection API.
 * Schedule: Sunday 3:00 AM UTC
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Per site:
 * 1. Find all URLs in "submitted" state
 * 2. Batch inspect via URL Inspection API (respect 2000/day quota per user)
 * 3. Update gscStatus and lastSyncedAt for each URL
 * 4. Log status changes
 */
export async function POST(req: Request) {
  const startTime = Date.now();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let sitesProcessed = 0;
  let urlsChecked = 0;
  let urlsUpdated = 0;
  const errors: string[] = [];

  try {
    // Load sites with auto-indexing enabled
    const sites = await prisma.site.findMany({
      where: {
        OR: [{ autoIndexGoogle: true }, { autoIndexBing: true }],
      },
      select: {
        id: true,
        userId: true,
        domain: true,
        user: {
          select: { email: true, emailReports: true },
        },
      },
      orderBy: { userId: "asc" },
    });

    // Track per-user inspection quota usage for this run
    const userInspectionUsed: Record<string, number> = {};

    for (const site of sites) {
      try {
        // Get submitted URLs to re-check
        const submittedUrls = await prisma.indexedUrl.findMany({
          where: {
            siteId: site.id,
            indexingStatus: "submitted",
          },
          select: { id: true, url: true, gscStatus: true },
          orderBy: { submittedAt: "asc" },
        });

        if (submittedUrls.length === 0) {
          sitesProcessed++;
          continue;
        }

        // Respect the 2000/day inspection quota per user
        const today = todayUTC();
        const quota = await prisma.userDailyQuota.findUnique({
          where: { userId_date: { userId: site.userId, date: today } },
        });
        const alreadyUsed = (quota?.inspectionsUsed ?? 0) + (userInspectionUsed[site.userId] ?? 0);
        const quotaRemaining = GOOGLE_DAILY_INSPECTION_LIMIT - alreadyUsed;

        if (quotaRemaining <= 0) {
          errors.push(`${site.domain}: inspection quota exhausted for user`);
          sitesProcessed++;
          continue;
        }

        // Get valid access token
        let accessToken: string;
        try {
          accessToken = await getValidAccessToken(site.userId);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Token error";
          errors.push(`${site.domain}: ${msg}`);
          // Send token expired email if needed
          if (site.user.emailReports) {
            await sendTokenExpiredEmail(site.user.email, site.domain).catch(() => {});
          }
          sitesProcessed++;
          continue;
        }

        const siteUrl = site.domain.startsWith("sc-domain:")
          ? `sc-domain:${site.domain.replace("sc-domain:", "")}`
          : site.domain;

        // Inspect URLs up to quota
        const toCheck = submittedUrls.slice(0, quotaRemaining);
        let inspectedCount = 0;

        for (const urlRecord of toCheck) {
          try {
            const inspectRes = await fetch(
              "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  inspectionUrl: urlRecord.url,
                  siteUrl,
                  languageCode: "en-US",
                }),
                signal: AbortSignal.timeout(15_000),
              }
            );

            inspectedCount++;
            urlsChecked++;

            if (!inspectRes.ok) {
              if (inspectRes.status === 429) {
                errors.push(`${site.domain}: rate limited during URL inspection`);
                break;
              }
              continue;
            }

            const data = await inspectRes.json();
            const newGscStatus: string | undefined =
              data?.inspectionResult?.indexStatusResult?.coverageState;

            if (!newGscStatus) continue;

            // Only update if status changed
            if (newGscStatus !== urlRecord.gscStatus) {
              await prisma.indexedUrl.update({
                where: { id: urlRecord.id },
                data: {
                  gscStatus: newGscStatus,
                  lastSyncedAt: new Date(),
                },
              });

              await prisma.indexingLog.create({
                data: {
                  userId: site.userId,
                  indexedUrlId: urlRecord.id,
                  action: "status_updated",
                  details: JSON.stringify({
                    url: urlRecord.url,
                    from: urlRecord.gscStatus ?? "unknown",
                    to: newGscStatus,
                    source: "weekly_resync",
                  }),
                },
              });

              urlsUpdated++;
            } else {
              // Still update lastSyncedAt
              await prisma.indexedUrl.update({
                where: { id: urlRecord.id },
                data: { lastSyncedAt: new Date() },
              });
            }

            // Small delay to avoid hammering the API
            await new Promise((r) => setTimeout(r, 200));
          } catch {
            // Individual URL inspection failure — continue with next
          }
        }

        // Track inspection usage
        if (inspectedCount > 0) {
          userInspectionUsed[site.userId] =
            (userInspectionUsed[site.userId] ?? 0) + inspectedCount;
          await incrementInspections(site.userId, inspectedCount);
        }

        sitesProcessed++;
      } catch (e) {
        const errMsg = `${site.domain}: ${e instanceof Error ? e.message : "Unknown error"}`;
        errors.push(errMsg);
        console.error("[cron/weekly-resync]", errMsg);
      }
    }

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);

    // Update CronJobLog
    await prisma.cronJobLog.upsert({
      where: { jobName: "weekly-resync" },
      create: {
        jobName: "weekly-resync",
        lastRunAt: new Date(),
        lastResult: errors.length === 0 ? "success" : "partial",
        lastSummary: JSON.stringify({ sitesProcessed, urlsChecked, urlsUpdated, errors, durationSeconds }),
      },
      update: {
        lastRunAt: new Date(),
        lastResult: errors.length === 0 ? "success" : "partial",
        lastSummary: JSON.stringify({ sitesProcessed, urlsChecked, urlsUpdated, errors, durationSeconds }),
      },
    });

    const summary = { sites_processed: sitesProcessed, urls_checked: urlsChecked, urls_updated: urlsUpdated, errors, duration_seconds: durationSeconds };
    console.log("[cron/weekly-resync] completed", summary);
    return NextResponse.json(summary);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    console.error("[cron/weekly-resync] FATAL", errMsg);
    await sendCronErrorAlert("weekly-resync", errMsg).catch(() => {});

    await prisma.cronJobLog
      .upsert({
        where: { jobName: "weekly-resync" },
        create: {
          jobName: "weekly-resync",
          lastRunAt: new Date(),
          lastResult: "fail",
          lastSummary: JSON.stringify({ error: errMsg }),
        },
        update: {
          lastRunAt: new Date(),
          lastResult: "fail",
          lastSummary: JSON.stringify({ error: errMsg }),
        },
      })
      .catch(() => {});

    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
