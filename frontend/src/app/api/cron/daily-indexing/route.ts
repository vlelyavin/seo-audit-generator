import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAutoIndexForSite } from "@/lib/auto-indexer";
import { todayUTC, INDEXED_GSC_STATUSES, acquireAutoIndexLock, releaseAutoIndexLock } from "@/lib/google-auth";
import {
  sendDailyReportEmail,
  sendLowCreditsEmail,
  send404AlertEmail,
  sendTokenExpiredEmail,
  sendCronErrorAlert,
} from "@/lib/email";
import { CREDIT_LOW_THRESHOLD } from "@/lib/credits";
import { verifyCronAuth } from "@/lib/cron-auth";

/**
 * POST /api/cron/daily-indexing
 *
 * Daily auto-indexing job. Designed to be called by system cron at 6:00 AM UTC.
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Processes every site with auto-indexing enabled:
 * 1. Fetches & diffs sitemap URLs
 * 2. 404-checks new/changed URLs
 * 3. Submits to Google Indexing API (if enabled, credits available, quota available)
 * 4. Submits to IndexNow / Bing (if enabled — free, no quota)
 * 5. Saves a DailyReport record per site
 * 6. Sends email alerts (daily report, low credits, 404s, token expired)
 */
export async function POST(req: Request) {
  const startTime = Date.now();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const today = todayUTC();
  let sitesProcessed = 0;
  let sitesSkipped = 0;
  let totalNewPages = 0;
  let totalSubmittedGoogle = 0;
  let totalSubmittedBing = 0;
  let total404s = 0;
  const errors: string[] = [];

  try {
    // ── Load sites with auto-indexing + user email preference ─────────────
    const sites = await prisma.site.findMany({
      where: {
        OR: [{ autoIndexGoogle: true }, { autoIndexBing: true }],
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            emailReports: true,
            indexingCredits: true,
            creditLowWarningSent: true,
          },
        },
      },
      orderBy: { userId: "asc" },
    });

    // ── Process sites sequentially ────────────────────────────────────────
    for (const site of sites) {
      // Collect 404 URLs separately for the alert email (task spec: separate
      // 404 email if count >= 5; otherwise include in daily report)
      const urls404ForEmail: string[] = [];

      try {
        // Acquire lock — skip site if manual run is in progress
        const locked = await acquireAutoIndexLock(site.id);
        if (!locked) {
          sitesSkipped++;
          errors.push(`${site.domain}: auto-index already in progress, skipped`);
          continue;
        }

        let result;
        try {
          result = await runAutoIndexForSite(site);
        } finally {
          await releaseAutoIndexLock(site.id);
        }

        // Tally aggregate stats
        sitesProcessed++;
        totalNewPages += result.newUrls;
        totalSubmittedGoogle += result.submittedGoogle;
        totalSubmittedBing += result.submittedBing;
        total404s += result.skipped404;

        if (result.errors.length > 0) {
          errors.push(`${site.domain}: ${result.errors.join("; ")}`);
        }

        // ── Collect 404 URLs that were just detected ──────────────────────
        if (result.skipped404 > 0) {
          const failed404s = await prisma.indexedUrl.findMany({
            where: {
              siteId: site.id,
              indexingStatus: "failed",
              errorMessage: "404/410 detected",
              updatedAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }, // updated in last 2h
            },
            select: { url: true },
          });
          urls404ForEmail.push(...failed404s.map((u) => u.url));
        }

        // ── Compute total stats for DailyReport ───────────────────────────
        const [totalIndexed, totalUrls] = await Promise.all([
          prisma.indexedUrl.count({
            where: { siteId: site.id, gscStatus: { in: [...INDEXED_GSC_STATUSES] } },
          }),
          prisma.indexedUrl.count({ where: { siteId: site.id } }),
        ]);

        // ── Upsert DailyReport ────────────────────────────────────────────
        await prisma.dailyReport.upsert({
          where: { siteId_reportDate: { siteId: site.id, reportDate: today } },
          create: {
            siteId: site.id,
            userId: site.userId,
            reportDate: today,
            newPagesFound: result.newUrls,
            changedPagesFound: result.changedUrls,
            removedPagesFound: result.removedUrls,
            submittedGoogle: result.submittedGoogle,
            submittedGoogleFailed: result.failedGoogle,
            submittedBing: result.submittedBing,
            submittedBingFailed: result.failedBing,
            pages404: result.skipped404,
            totalIndexed,
            totalUrls,
            creditsUsed: result.creditsUsed,
            creditsRemaining: result.creditsRemaining,
            details: JSON.stringify({
              errors: result.errors,
              googleQuotaExhausted: result.googleQuotaExhausted,
              insufficientCredits: result.insufficientCredits,
              tokenError: result.tokenError,
            }),
          },
          update: {
            // If run multiple times in a day, accumulate
            newPagesFound: { increment: result.newUrls },
            changedPagesFound: { increment: result.changedUrls },
            removedPagesFound: { increment: result.removedUrls },
            submittedGoogle: { increment: result.submittedGoogle },
            submittedGoogleFailed: { increment: result.failedGoogle },
            submittedBing: { increment: result.submittedBing },
            submittedBingFailed: { increment: result.failedBing },
            pages404: { increment: result.skipped404 },
            totalIndexed,
            totalUrls,
            creditsUsed: { increment: result.creditsUsed },
            creditsRemaining: result.creditsRemaining,
          },
        });

        // ── Email alerts ──────────────────────────────────────────────────
        const user = site.user;
        const hasActivity =
          result.newUrls > 0 ||
          result.submittedGoogle > 0 ||
          result.submittedBing > 0 ||
          result.failedGoogle > 0 ||
          result.skipped404 > 0;

        // A) Daily report (only when there's something to report)
        if (user.emailReports && hasActivity) {
          await sendDailyReportEmail(user.email, site.domain, today, {
            newPagesFound: result.newUrls,
            submittedGoogle: result.submittedGoogle,
            submittedGoogleFailed: result.failedGoogle,
            submittedBing: result.submittedBing,
            submittedBingFailed: result.failedBing,
            pages404: result.skipped404,
            totalIndexed,
            totalUrls,
            creditsRemaining: result.creditsRemaining,
          }, site.id);
        }

        // B) Low credits alert (only once per low-credit event)
        if (
          user.emailReports &&
          result.creditsRemaining < CREDIT_LOW_THRESHOLD &&
          result.creditsUsed > 0 &&
          !user.creditLowWarningSent
        ) {
          await sendLowCreditsEmail(user.email, result.creditsRemaining);
        }

        // C) 404 alert — separate email if 5+ new 404s, otherwise included in daily report
        if (user.emailReports && urls404ForEmail.length >= 5) {
          await send404AlertEmail(user.email, site.domain, urls404ForEmail);
        }

        // D) Token expired alert
        if (result.tokenError) {
          await sendTokenExpiredEmail(user.email, site.domain);
        }
      } catch (e) {
        sitesSkipped++;
        const errMsg = `${site.domain}: ${e instanceof Error ? e.message : "Unknown error"}`;
        errors.push(errMsg);
        console.error("[cron/daily-indexing]", errMsg);
      }
    }

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);

    // ── Update CronJobLog ─────────────────────────────────────────────────
    await prisma.cronJobLog.upsert({
      where: { jobName: "daily-indexing" },
      create: {
        jobName: "daily-indexing",
        lastRunAt: new Date(),
        lastResult: errors.length === 0 ? "success" : "partial",
        lastSummary: JSON.stringify({
          sitesProcessed,
          sitesSkipped,
          totalNewPages,
          totalSubmittedGoogle,
          totalSubmittedBing,
          total404s,
          errors,
          durationSeconds,
        }),
      },
      update: {
        lastRunAt: new Date(),
        lastResult: errors.length === 0 ? "success" : "partial",
        lastSummary: JSON.stringify({
          sitesProcessed,
          sitesSkipped,
          totalNewPages,
          totalSubmittedGoogle,
          totalSubmittedBing,
          total404s,
          errors,
          durationSeconds,
        }),
      },
    });

    const summary = {
      sites_processed: sitesProcessed,
      sites_skipped: sitesSkipped,
      total_new_pages: totalNewPages,
      total_submitted_google: totalSubmittedGoogle,
      total_submitted_bing: totalSubmittedBing,
      total_404s: total404s,
      errors,
      duration_seconds: durationSeconds,
    };

    console.log("[cron/daily-indexing] completed", summary);
    return NextResponse.json(summary);
  } catch (e) {
    // Job crashed entirely — alert admin
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    console.error("[cron/daily-indexing] FATAL", errMsg);
    await sendCronErrorAlert("daily-indexing", errMsg).catch(() => {});

    // Still update the log
    await prisma.cronJobLog
      .upsert({
        where: { jobName: "daily-indexing" },
        create: {
          jobName: "daily-indexing",
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
