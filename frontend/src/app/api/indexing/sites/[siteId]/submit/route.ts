import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getDailyQuota,
  GOOGLE_DAILY_SUBMISSION_LIMIT,
  reserveGoogleQuota,
  releaseGoogleQuota,
} from "@/lib/google-auth";
import {
  submitUrlsBatchToGoogle,
  submitUrlsToIndexNow,
} from "@/lib/indexing-api";
import { checkUrls } from "@/lib/url-checker";
import {
  deductCredits,
  refundCredits,
  CREDIT_LOW_THRESHOLD,
} from "@/lib/credits";

/**
 * POST /api/indexing/sites/[siteId]/submit
 * Manual URL submission to Google and/or Bing (IndexNow).
 * Body: { url_ids?: string[], all_not_indexed?: boolean, engines: ("google"|"bing")[] }
 *
 * Google submissions cost 1 credit per URL. IndexNow is free.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;
  const site = await prisma.site.findUnique({ where: { id: siteId } });

  if (!site || site.userId !== session.user.id) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const engines: string[] = Array.isArray(body.engines)
    ? body.engines
    : ["google"];
  const allNotIndexed: boolean = body.all_not_indexed === true;

  let urlRecords: Awaited<ReturnType<typeof prisma.indexedUrl.findMany>>;

  if (allNotIndexed) {
    urlRecords = await prisma.indexedUrl.findMany({
      where: {
        siteId: site.id,
        indexingStatus: { in: ["none", "failed", "pending"] },
      },
    });
  } else {
    const urlIds: string[] = Array.isArray(body.url_ids) ? body.url_ids : [];
    if (urlIds.length === 0) {
      return NextResponse.json({ error: "No URLs specified" }, { status: 400 });
    }
    urlRecords = await prisma.indexedUrl.findMany({
      where: { id: { in: urlIds }, siteId: site.id },
    });
  }

  if (urlRecords.length === 0) {
    return NextResponse.json({
      submitted_google: 0,
      submitted_bing: 0,
      skipped_404: 0,
      skipped_quota_full: 0,
      credits_remaining: await getUserCredits(session.user.id),
    });
  }

  // ── Credit pre-check (Google only costs credits) ──────────────────────────
  const wantsGoogle = engines.includes("google");
  if (wantsGoogle) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { indexingCredits: true },
    });
    const available = user?.indexingCredits ?? 0;
    const required = urlRecords.length;

    if (available === 0) {
      return NextResponse.json(
        {
          error: "not_enough_credits",
          required,
          available,
          buy_url: "/dashboard/plans#credits",
        },
        { status: 402 }
      );
    }

    if (available < required) {
      return NextResponse.json(
        {
          error: "not_enough_credits",
          required,
          available,
          buy_url: "/dashboard/plans#credits",
        },
        { status: 402 }
      );
    }
  }

  // URL liveness detection (404, network errors, etc.)
  const urlStrings = urlRecords.map((r) => r.url);
  const checkResults = await checkUrls(urlStrings);

  const aliveUrls: string[] = [];
  let skipped404 = 0;

  for (const check of checkResults) {
    const record = urlRecords.find((r) => r.url === check.url);
    if (!record) continue;

    if (!check.isAlive) {
      skipped404++;
      await prisma.indexedUrl.update({
        where: { id: record.id },
        data: {
          httpStatus: check.httpStatus,
          indexingStatus: "failed",
          errorMessage: check.is404
            ? "404/410 detected before submission"
            : `URL unreachable: ${check.error ?? "unknown error"}`,
        },
      });
    } else {
      if (check.httpStatus) {
        await prisma.indexedUrl.update({
          where: { id: record.id },
          data: { httpStatus: check.httpStatus },
        });
      }
      aliveUrls.push(check.url);
    }
  }

  let submittedGoogle = 0;
  let submittedBing = 0;
  let skippedQuotaFull = 0;
  const now = new Date();
  const googleSubmittedUrls = new Set<string>();

  // ── Google submission ─────────────────────────────────────────────────────
  if (wantsGoogle && aliveUrls.length > 0) {
    // Atomically reserve quota (prevents concurrent requests from exceeding limit)
    const reserved = await reserveGoogleQuota(session.user.id, aliveUrls.length);

    if (reserved <= 0) {
      skippedQuotaFull = aliveUrls.length;
    } else {
      const toSubmit = aliveUrls.slice(0, reserved);
      skippedQuotaFull = aliveUrls.length - reserved;

      // Deduct credits upfront (before API call)
      const creditsToDeduct = toSubmit.length;
      await deductCredits(
        session.user.id,
        creditsToDeduct,
        `Submitted ${creditsToDeduct} URL${creditsToDeduct === 1 ? "" : "s"} to Google`
      );

      const { submitted, rateLimited, failed } =
        await submitUrlsBatchToGoogle(session.user.id, toSubmit);

      submittedGoogle = submitted.length;
      skippedQuotaFull += rateLimited.length;

      // Refund for failed URLs
      if (failed.length > 0) {
        await refundCredits(
          session.user.id,
          failed.length,
          `Refund: ${failed.length} URL${failed.length === 1 ? "" : "s"} failed to submit to Google`
        );
      }

      // Also refund for rate-limited URLs
      if (rateLimited.length > 0) {
        await refundCredits(
          session.user.id,
          rateLimited.length,
          `Refund: ${rateLimited.length} URL${rateLimited.length === 1 ? "" : "s"} skipped (quota full)`
        );
      }

      // Release unused quota for failed + rate-limited URLs
      const quotaRelease = failed.length + rateLimited.length;
      if (quotaRelease > 0) {
        await releaseGoogleQuota(session.user.id, quotaRelease);
      }

      if (submitted.length > 0) {
        for (const s of submitted) {
          googleSubmittedUrls.add(s.url);
          const record = urlRecords.find((r) => r.url === s.url);
          if (record) {
            await prisma.indexedUrl.update({
              where: { id: record.id },
              data: {
                indexingStatus: "submitted",
                submissionMethod: "google_api",
                submittedAt: now,
                isNew: false,
                isChanged: false,
              },
            });
            await prisma.indexingLog.create({
              data: {
                userId: session.user.id,
                indexedUrlId: record.id,
                action: "submitted_google",
                details: JSON.stringify({ url: s.url }),
              },
            });
          }
        }
      }

      for (const f of failed) {
        const record = urlRecords.find((r) => r.url === f.url);
        if (record) {
          await prisma.indexedUrl.update({
            where: { id: record.id },
            data: { indexingStatus: "failed", errorMessage: f.error },
          });
          await prisma.indexingLog.create({
            data: {
              userId: session.user.id,
              indexedUrlId: record.id,
              action: "failed",
              details: JSON.stringify({ url: f.url, error: f.error }),
            },
          });
        }
      }
    }
  }

  // ── Bing / IndexNow submission (free, no credits) ─────────────────────────
  if (engines.includes("bing") && site.indexnowKey && aliveUrls.length > 0) {
    const host = site.domain.startsWith("sc-domain:")
      ? site.domain.replace("sc-domain:", "")
      : (() => {
          try {
            return new URL(site.domain).hostname;
          } catch {
            return site.domain;
          }
        })();

    const indexnowResult = await submitUrlsToIndexNow(
      host,
      site.indexnowKey,
      aliveUrls
    );
    submittedBing = indexnowResult.urlsSubmitted;

    if (submittedBing > 0) {
      for (const url of aliveUrls.slice(0, submittedBing)) {
        const record = urlRecords.find((r) => r.url === url);
        if (record) {
          // Preserve Google submission method if already submitted in this cycle
          const method = googleSubmittedUrls.has(url)
            ? "google_api,indexnow"
            : "indexnow";
          await prisma.indexedUrl.update({
            where: { id: record.id },
            data: {
              indexingStatus: "submitted",
              submissionMethod: method,
              submittedAt: now,
              isNew: false,
              isChanged: false,
            },
          });
          await prisma.indexingLog.create({
            data: {
              userId: session.user.id,
              indexedUrlId: record.id,
              action: "submitted_indexnow",
              details: JSON.stringify({ url }),
            },
          });
        }
      }
    }
  }

  // ── Post-submission: check low credit threshold ────────────────────────────
  const updatedUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { indexingCredits: true, creditLowWarningSent: true },
  });
  const creditsRemaining = updatedUser?.indexingCredits ?? 0;

  if (
    creditsRemaining < CREDIT_LOW_THRESHOLD &&
    creditsRemaining >= 0 &&
    updatedUser &&
    !updatedUser.creditLowWarningSent
  ) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { creditLowWarningSent: true },
    });
    // Task 2.4 will send the email notification
  }

  const updatedQuota = await getDailyQuota(session.user.id);

  return NextResponse.json({
    submitted_google: submittedGoogle,
    submitted_bing: submittedBing,
    skipped_404: skipped404,
    skipped_quota_full: skippedQuotaFull,
    google_quota_remaining:
      GOOGLE_DAILY_SUBMISSION_LIMIT - updatedQuota.googleSubmissions,
    credits_remaining: creditsRemaining,
  });
}

async function getUserCredits(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { indexingCredits: true },
  });
  return user?.indexingCredits ?? 0;
}
