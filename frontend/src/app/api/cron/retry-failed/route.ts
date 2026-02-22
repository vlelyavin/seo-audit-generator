import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { submitUrlToGoogle } from "@/lib/indexing-api";
import { submitUrlsToIndexNow } from "@/lib/indexing-api";
import { getDailyQuota, incrementGoogleSubmissions, GOOGLE_DAILY_SUBMISSION_LIMIT } from "@/lib/google-auth";
import { deductCredits } from "@/lib/credits";
import { sendCronErrorAlert } from "@/lib/email";

const MAX_RETRIES = 3;

/**
 * Returns true for errors that are worth retrying (5xx, timeout, rate limit).
 * Returns false for permanent failures (403 permission, 404, auth errors).
 */
function isRetryableError(errorMessage: string | null): boolean {
  if (!errorMessage) return false;
  const msg = errorMessage.toLowerCase();
  // Permanent failures — don't retry
  if (
    msg.includes("403") ||
    msg.includes("404/410 detected") ||
    msg.includes("google account not connected") ||
    msg.includes("no refresh token") ||
    msg.includes("permission") ||
    msg.includes("unauthorized")
  ) {
    return false;
  }
  // Retryable: server errors, network issues, rate limits
  return (
    msg.includes("500") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("timeout") ||
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("network error") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout")
  );
}

/**
 * POST /api/cron/retry-failed
 *
 * Retries failed URL submissions. Run daily at 12:00 PM UTC (6h after main job).
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Logic:
 * - Finds all URLs with indexingStatus = "failed" and retryCount < MAX_RETRIES
 * - Skips permanent failures (403, 404, auth errors)
 * - Retries Google or IndexNow submission depending on original method
 * - Deducts credits only for successful Google retries
 * - Increments retryCount (capped at MAX_RETRIES)
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

  let retriedGoogle = 0;
  let retriedBing = 0;
  let succeededGoogle = 0;
  let succeededBing = 0;
  let permanentlyFailed = 0;
  const errors: string[] = [];

  try {
    // Find all failed URLs that are eligible for retry
    const failedUrls = await prisma.indexedUrl.findMany({
      where: {
        indexingStatus: "failed",
        retryCount: { lt: MAX_RETRIES },
      },
      include: {
        site: {
          select: {
            id: true,
            userId: true,
            domain: true,
            indexnowKey: true,
            autoIndexGoogle: true,
            autoIndexBing: true,
          },
        },
      },
      orderBy: { updatedAt: "asc" },
    });

    // Group by site for IndexNow batch submission
    const indexNowBatches: Record<
      string,
      { site: (typeof failedUrls)[0]["site"]; urls: (typeof failedUrls)[0][] }
    > = {};

    // Process Google retries individually, collect IndexNow retries for batching
    for (const urlRecord of failedUrls) {
      // Skip non-retryable errors
      if (!isRetryableError(urlRecord.errorMessage)) {
        permanentlyFailed++;
        // Cap retryCount so we don't keep checking
        if (urlRecord.retryCount < MAX_RETRIES) {
          await prisma.indexedUrl.update({
            where: { id: urlRecord.id },
            data: { retryCount: MAX_RETRIES },
          });
        }
        continue;
      }

      const site = urlRecord.site;
      const submissionMethod = urlRecord.submissionMethod;

      // ── Retry Google ────────────────────────────────────────────────────
      if (submissionMethod === "google_api" && site.autoIndexGoogle) {
        try {
          // Check quota
          const quota = await getDailyQuota(site.userId);
          const quotaRemaining = GOOGLE_DAILY_SUBMISSION_LIMIT - quota.googleSubmissions;
          if (quotaRemaining <= 0) {
            errors.push(`${site.domain}: Google quota exhausted, skipping retry`);
            continue;
          }

          // Check credits
          const user = await prisma.user.findUnique({
            where: { id: site.userId },
            select: { indexingCredits: true },
          });
          if (!user || user.indexingCredits <= 0) {
            errors.push(`${site.domain}: insufficient credits for retry`);
            await prisma.indexedUrl.update({
              where: { id: urlRecord.id },
              data: { retryCount: { increment: 1 } },
            });
            continue;
          }

          retriedGoogle++;
          const result = await submitUrlToGoogle(site.userId, urlRecord.url);

          if (result.success) {
            // Deduct 1 credit for successful retry
            try {
              await deductCredits(
                site.userId,
                1,
                `Retry: submitted ${urlRecord.url} for ${site.domain}`
              );
            } catch {
              // Log but don't fail
              errors.push(`${site.domain}: credit deduction failed for retry of ${urlRecord.url}`);
            }

            await incrementGoogleSubmissions(site.userId, 1);

            await prisma.indexedUrl.update({
              where: { id: urlRecord.id },
              data: {
                indexingStatus: "submitted",
                submittedAt: new Date(),
                errorMessage: null,
                retryCount: { increment: 1 },
                isNew: false,
                isChanged: false,
              },
            });

            await prisma.indexingLog.create({
              data: {
                userId: site.userId,
                indexedUrlId: urlRecord.id,
                action: "submitted_google",
                details: JSON.stringify({ url: urlRecord.url, source: "retry" }),
              },
            });

            succeededGoogle++;
          } else {
            // Still failed
            await prisma.indexedUrl.update({
              where: { id: urlRecord.id },
              data: {
                retryCount: { increment: 1 },
                errorMessage: result.error ?? "Retry failed",
              },
            });

            await prisma.indexingLog.create({
              data: {
                userId: site.userId,
                indexedUrlId: urlRecord.id,
                action: "failed",
                details: JSON.stringify({ url: urlRecord.url, error: result.error, source: "retry" }),
              },
            });
          }
        } catch (e) {
          errors.push(`${site.domain} (Google retry): ${e instanceof Error ? e.message : "Error"}`);
        }
      }

      // ── Collect IndexNow retries ─────────────────────────────────────────
      else if (submissionMethod === "indexnow" && site.autoIndexBing && site.indexnowKey) {
        const key = site.id;
        if (!indexNowBatches[key]) {
          indexNowBatches[key] = { site, urls: [] };
        }
        indexNowBatches[key].urls.push(urlRecord);
      }
    }

    // ── Batch-submit IndexNow retries ──────────────────────────────────────
    for (const { site, urls } of Object.values(indexNowBatches)) {
      if (!site.indexnowKey) continue;

      const host = site.domain.startsWith("sc-domain:")
        ? site.domain.replace("sc-domain:", "")
        : new URL(site.domain).hostname;

      const urlStrings = urls.map((u) => u.url);
      retriedBing += urlStrings.length;

      try {
        const result = await submitUrlsToIndexNow(host, site.indexnowKey, urlStrings);

        const successCount = result.urlsSubmitted;
        succeededBing += successCount;
        const now = new Date();

        for (let i = 0; i < urls.length; i++) {
          const urlRecord = urls[i];
          const success = i < successCount;

          await prisma.indexedUrl.update({
            where: { id: urlRecord.id },
            data: {
              indexingStatus: success ? "submitted" : "failed",
              submittedAt: success ? now : undefined,
              errorMessage: success ? null : (result.error ?? "IndexNow retry failed"),
              retryCount: { increment: 1 },
              isNew: false,
              isChanged: false,
            },
          });

          await prisma.indexingLog.create({
            data: {
              userId: site.userId,
              indexedUrlId: urlRecord.id,
              action: success ? "submitted_indexnow" : "failed",
              details: JSON.stringify({ url: urlRecord.url, source: "retry" }),
            },
          });
        }
      } catch (e) {
        errors.push(`${site.domain} (IndexNow retry): ${e instanceof Error ? e.message : "Error"}`);
      }
    }

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);

    // Update CronJobLog
    await prisma.cronJobLog.upsert({
      where: { jobName: "retry-failed" },
      create: {
        jobName: "retry-failed",
        lastRunAt: new Date(),
        lastResult: errors.length === 0 ? "success" : "partial",
        lastSummary: JSON.stringify({ retriedGoogle, retriedBing, succeededGoogle, succeededBing, permanentlyFailed, errors, durationSeconds }),
      },
      update: {
        lastRunAt: new Date(),
        lastResult: errors.length === 0 ? "success" : "partial",
        lastSummary: JSON.stringify({ retriedGoogle, retriedBing, succeededGoogle, succeededBing, permanentlyFailed, errors, durationSeconds }),
      },
    });

    const summary = {
      retried_google: retriedGoogle,
      retried_bing: retriedBing,
      succeeded_google: succeededGoogle,
      succeeded_bing: succeededBing,
      permanently_failed: permanentlyFailed,
      errors,
      duration_seconds: durationSeconds,
    };

    console.log("[cron/retry-failed] completed", summary);
    return NextResponse.json(summary);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    console.error("[cron/retry-failed] FATAL", errMsg);
    await sendCronErrorAlert("retry-failed", errMsg).catch(() => {});

    await prisma.cronJobLog
      .upsert({
        where: { jobName: "retry-failed" },
        create: {
          jobName: "retry-failed",
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
