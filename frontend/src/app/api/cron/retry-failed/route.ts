import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { submitUrlToGoogle } from "@/lib/indexing-api";
import { submitUrlsToIndexNow } from "@/lib/indexing-api";
import { reserveGoogleQuota, releaseGoogleQuota } from "@/lib/google-auth";
import { deductCredits, refundCredits } from "@/lib/credits";
import { sendCronErrorAlert } from "@/lib/email";
import { verifyCronAuth } from "@/lib/cron-auth";

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
  const authError = verifyCronAuth(req);
  if (authError) return authError;

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
          // Atomically reserve 1 quota slot
          const reserved = await reserveGoogleQuota(site.userId, 1);
          if (reserved <= 0) {
            errors.push(`${site.domain}: Google quota exhausted, skipping retry`);
            continue;
          }

          // Deduct 1 credit upfront (deduct-before-submit)
          let creditDeducted = false;
          try {
            await deductCredits(
              site.userId,
              1,
              `Retry: pre-deduct for ${urlRecord.url} on ${site.domain}`
            );
            creditDeducted = true;
          } catch {
            // Insufficient credits — release the reserved quota
            await releaseGoogleQuota(site.userId, 1);
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
            // Submission failed — refund the credit and release quota
            if (creditDeducted) {
              try {
                await refundCredits(
                  site.userId,
                  1,
                  `Retry refund: ${urlRecord.url} failed for ${site.domain}`
                );
              } catch {
                errors.push(`${site.domain}: credit refund failed for retry of ${urlRecord.url}`);
              }
            }
            await releaseGoogleQuota(site.userId, 1);

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

      let host: string;
      try {
        host = site.domain.startsWith("sc-domain:")
          ? site.domain.replace("sc-domain:", "")
          : new URL(site.domain).hostname;
      } catch {
        errors.push(`${site.domain}: invalid domain URL, skipping IndexNow retry`);
        continue;
      }

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
