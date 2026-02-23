/**
 * Auto-indexing daily job logic.
 * Called by both the cron endpoint and the manual trigger endpoint.
 */

import { prisma } from "./prisma";
import { fetchSitemapUrls, fallbackSitemapUrl } from "./sitemap-parser";
import { checkUrls } from "./url-checker";
import {
  getDailyQuota,
  incrementGoogleSubmissions,
  GOOGLE_DAILY_SUBMISSION_LIMIT,
} from "./google-auth";
import {
  submitUrlsBatchToGoogle,
  submitUrlsToIndexNow,
} from "./indexing-api";
import { deductCredits, CREDIT_LOW_THRESHOLD } from "./credits";

export interface AutoIndexResult {
  siteId: string;
  domain: string;
  newUrls: number;
  changedUrls: number;
  removedUrls: number;
  skipped404: number;
  submittedGoogle: number;
  submittedBing: number;
  failedGoogle: number;
  failedBing: number;
  googleQuotaExhausted: boolean;
  insufficientCredits: boolean;
  creditsUsed: number;
  creditsRemaining: number;
  tokenError: string | null;
  errors: string[];
}

/**
 * Run the full auto-index job for a single site.
 */
export async function runAutoIndexForSite(
  site: {
    id: string;
    userId: string;
    domain: string;
    sitemapUrl: string | null;
    autoIndexGoogle: boolean;
    autoIndexBing: boolean;
    indexnowKey: string | null;
  }
): Promise<AutoIndexResult> {
  const result: AutoIndexResult = {
    siteId: site.id,
    domain: site.domain,
    newUrls: 0,
    changedUrls: 0,
    removedUrls: 0,
    skipped404: 0,
    submittedGoogle: 0,
    submittedBing: 0,
    failedGoogle: 0,
    failedBing: 0,
    googleQuotaExhausted: false,
    insufficientCredits: false,
    creditsUsed: 0,
    creditsRemaining: 0,
    tokenError: null,
    errors: [],
  };

  // 1. Fetch sitemap URLs
  const sitemapUrl = site.sitemapUrl ?? fallbackSitemapUrl(site.domain);
  const sitemapUrls = await fetchSitemapUrls(sitemapUrl);

  if (sitemapUrls.length === 0) {
    result.errors.push("No URLs found in sitemap");
    return result;
  }

  const sitemapLocSet = new Set(sitemapUrls.map((u) => u.loc));

  // 2. Detect removed pages (in DB but no longer in sitemap)
  const existingUrls = await prisma.indexedUrl.findMany({
    where: { siteId: site.id },
    select: { id: true, url: true, indexingStatus: true, lastmod: true },
  });

  const existingUrlMap = new Map(existingUrls.map((u) => [u.url, u]));

  for (const existing of existingUrls) {
    if (!sitemapLocSet.has(existing.url)) {
      result.removedUrls++;
      // Mark as removed — keep record but clear pending flags
      await prisma.indexedUrl.update({
        where: { id: existing.id },
        data: { isChanged: false, isNew: false },
      });
      await prisma.indexingLog.create({
        data: {
          siteId: site.id,
          userId: site.userId,
          indexedUrlId: existing.id,
          action: "url_removed",
          details: JSON.stringify({ url: existing.url }),
        },
      });
    }
  }

  // 3. Upsert IndexedUrl records, detect new / changed
  const newOrChangedUrls: string[] = [];

  for (const { loc, lastmod } of sitemapUrls) {
    const existing = existingUrlMap.get(loc);

    if (!existing) {
      const newRecord = await prisma.indexedUrl.create({
        data: {
          siteId: site.id,
          url: loc,
          lastmod,
          isNew: true,
          indexingStatus: "pending",
        },
      });
      result.newUrls++;
      newOrChangedUrls.push(loc);
      await prisma.indexingLog.create({
        data: {
          siteId: site.id,
          userId: site.userId,
          indexedUrlId: newRecord.id,
          action: "url_discovered",
          details: JSON.stringify({ url: loc }),
        },
      });
    } else if (lastmod && lastmod !== existing.lastmod) {
      await prisma.indexedUrl.update({
        where: { id: existing.id },
        data: { lastmod, isChanged: true, indexingStatus: "pending" },
      });
      result.changedUrls++;
      newOrChangedUrls.push(loc);
    }
  }

  await prisma.site.update({
    where: { id: site.id },
    data: { lastSyncedAt: new Date() },
  });

  if (newOrChangedUrls.length === 0) {
    // Still read current credit balance for reporting
    const user = await prisma.user.findUnique({
      where: { id: site.userId },
      select: { indexingCredits: true },
    });
    result.creditsRemaining = user?.indexingCredits ?? 0;
    return result;
  }

  // 4. 404 detection on new/changed URLs
  const checkResults = await checkUrls(newOrChangedUrls);
  const aliveUrls: string[] = [];

  for (const check of checkResults) {
    const dbEntry = await prisma.indexedUrl.findUnique({
      where: { siteId_url: { siteId: site.id, url: check.url } },
    });
    if (!dbEntry) continue;

    if (check.is404) {
      result.skipped404++;
      await prisma.indexedUrl.update({
        where: { id: dbEntry.id },
        data: { httpStatus: check.httpStatus, indexingStatus: "failed", errorMessage: "404/410 detected" },
      });
      await prisma.indexingLog.create({
        data: {
          siteId: site.id,
          userId: site.userId,
          indexedUrlId: dbEntry.id,
          action: "url_404",
          details: JSON.stringify({ url: check.url, httpStatus: check.httpStatus }),
        },
      });
    } else {
      if (check.httpStatus) {
        await prisma.indexedUrl.update({
          where: { id: dbEntry.id },
          data: { httpStatus: check.httpStatus },
        });
      }
      aliveUrls.push(check.url);
    }
  }

  // 5. Google Indexing API
  if (site.autoIndexGoogle && aliveUrls.length > 0) {
    try {
      const quota = await getDailyQuota(site.userId);
      const quotaRemaining = GOOGLE_DAILY_SUBMISSION_LIMIT - quota.googleSubmissions;

      if (quotaRemaining <= 0) {
        result.googleQuotaExhausted = true;
      } else {
        // Check user credit balance
        const user = await prisma.user.findUnique({
          where: { id: site.userId },
          select: { indexingCredits: true },
        });
        const creditBalance = user?.indexingCredits ?? 0;

        if (creditBalance <= 0) {
          result.insufficientCredits = true;
          result.creditsRemaining = 0;
        } else {
          // Only submit as many URLs as we have credits and quota for
          const maxSubmit = Math.min(aliveUrls.length, quotaRemaining, creditBalance);
          const toSubmit = aliveUrls.slice(0, maxSubmit);

          if (maxSubmit < aliveUrls.length) {
            result.insufficientCredits = creditBalance < aliveUrls.length;
          }

          const { submitted, rateLimited, failed } = await submitUrlsBatchToGoogle(
            site.userId,
            toSubmit
          );

          result.submittedGoogle = submitted.length;
          result.failedGoogle = failed.length;
          result.googleQuotaExhausted = rateLimited.length > 0;

          if (submitted.length > 0) {
            // Deduct credits for successful submissions
            try {
              const remaining = await deductCredits(
                site.userId,
                submitted.length,
                `Auto-index: submitted ${submitted.length} URL(s) for ${site.domain}`
              );
              result.creditsUsed = submitted.length;
              result.creditsRemaining = remaining;

              // Check low-credit threshold
              if (remaining < CREDIT_LOW_THRESHOLD) {
                const userData = await prisma.user.findUnique({
                  where: { id: site.userId },
                  select: { creditLowWarningSent: true },
                });
                if (!userData?.creditLowWarningSent) {
                  await prisma.user.update({
                    where: { id: site.userId },
                    data: { creditLowWarningSent: true },
                  });
                }
              }
            } catch {
              // Credit deduction failed — refund not needed, just log
              result.errors.push("Credit deduction failed after successful Google submissions");
            }

            await incrementGoogleSubmissions(site.userId, submitted.length);
            const now = new Date();
            for (const s of submitted) {
              const record = await prisma.indexedUrl.findUnique({
                where: { siteId_url: { siteId: site.id, url: s.url } },
              });
              if (record) {
                await prisma.indexedUrl.update({
                  where: { id: record.id },
                  data: {
                    indexingStatus: "submitted",
                    submissionMethod: "google_api",
                    submittedAt: now,
                    isNew: false,
                    isChanged: false,
                    retryCount: 0,
                  },
                });
                await prisma.indexingLog.create({
                  data: {
                    siteId: site.id,
                    userId: site.userId,
                    indexedUrlId: record.id,
                    action: "submitted_google",
                    details: JSON.stringify({ url: s.url }),
                  },
                });
              }
            }
          } else {
            // No successful submissions — read current balance
            const updatedUser = await prisma.user.findUnique({
              where: { id: site.userId },
              select: { indexingCredits: true },
            });
            result.creditsRemaining = updatedUser?.indexingCredits ?? 0;
          }

          for (const f of failed) {
            const record = await prisma.indexedUrl.findUnique({
              where: { siteId_url: { siteId: site.id, url: f.url } },
            });
            if (record) {
              await prisma.indexedUrl.update({
                where: { id: record.id },
                data: { indexingStatus: "failed", errorMessage: f.error },
              });
              await prisma.indexingLog.create({
                data: {
                  siteId: site.id,
                  userId: site.userId,
                  indexedUrlId: record.id,
                  action: "failed",
                  details: JSON.stringify({ url: f.url, error: f.error }),
                },
              });
            }
          }
        }
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Google indexing error";
      result.errors.push(errMsg);
      // Detect token expiry errors specifically
      if (
        errMsg.includes("No refresh token") ||
        errMsg.includes("Google account not connected") ||
        errMsg.includes("Failed to refresh Google token")
      ) {
        result.tokenError = errMsg;
      }
    }
  }

  // 6. IndexNow (Bing/Yandex/DuckDuckGo)
  if (site.autoIndexBing && aliveUrls.length > 0 && site.indexnowKey) {
    const host = site.domain.startsWith("sc-domain:")
      ? site.domain.replace("sc-domain:", "")
      : new URL(site.domain).hostname;

    const indexnowResult = await submitUrlsToIndexNow(
      host,
      site.indexnowKey,
      aliveUrls
    );
    result.submittedBing = indexnowResult.urlsSubmitted;
    if (!indexnowResult.success) {
      result.failedBing = aliveUrls.length - indexnowResult.urlsSubmitted;
    }

    if (indexnowResult.urlsSubmitted > 0) {
      const now = new Date();
      for (const url of aliveUrls.slice(0, indexnowResult.urlsSubmitted)) {
        const record = await prisma.indexedUrl.findUnique({
          where: { siteId_url: { siteId: site.id, url } },
        });
        if (record) {
          await prisma.indexedUrl.update({
            where: { id: record.id },
            data: {
              indexingStatus: "submitted",
              submissionMethod: "indexnow",
              submittedAt: now,
              isNew: false,
              isChanged: false,
            },
          });
          await prisma.indexingLog.create({
            data: {
              siteId: site.id,
              userId: site.userId,
              indexedUrlId: record.id,
              action: "submitted_indexnow",
              details: JSON.stringify({ url }),
            },
          });
        }
      }
    }
  }

  // Ensure creditsRemaining is populated if not already set
  if (result.creditsRemaining === 0 && result.creditsUsed === 0) {
    const user = await prisma.user.findUnique({
      where: { id: site.userId },
      select: { indexingCredits: true },
    });
    result.creditsRemaining = user?.indexingCredits ?? 0;
  }

  // Write / accumulate DailyReport for this run
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [totalUrls, totalIndexed] = await Promise.all([
      prisma.indexedUrl.count({ where: { siteId: site.id } }),
      prisma.indexedUrl.count({
        where: { siteId: site.id, gscStatus: { contains: "indexed" } },
      }),
    ]);
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
      },
      update: {
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
  } catch {
    // Non-fatal — don't let report write failure break the indexing result
  }

  return result;
}
