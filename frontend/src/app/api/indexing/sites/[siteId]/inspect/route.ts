import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getValidAccessToken,
  getDailyQuota,
  incrementInspections,
  GOOGLE_DAILY_INSPECTION_LIMIT,
} from "@/lib/google-auth";
import { getTipForStatus } from "@/lib/gsc-tips";

/**
 * POST /api/indexing/sites/[siteId]/inspect
 * Inspect specific URLs via the URL Inspection API.
 * Body: { urls: string[] }
 * Enforces the 2,000/day inspection limit per user.
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

  const body = await req.json();
  const urls: string[] = Array.isArray(body.urls) ? body.urls : [];

  if (urls.length === 0) {
    return NextResponse.json({ error: "No URLs provided" }, { status: 400 });
  }

  // Check daily inspection quota
  const quota = await getDailyQuota(session.user.id);
  const remaining = GOOGLE_DAILY_INSPECTION_LIMIT - quota.inspectionsUsed;

  if (remaining <= 0) {
    return NextResponse.json(
      {
        error: `Daily inspection limit (${GOOGLE_DAILY_INSPECTION_LIMIT}) reached. Try again tomorrow.`,
        inspectionsRemaining: 0,
      },
      { status: 429 }
    );
  }

  const toInspect = urls.slice(0, remaining);

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(session.user.id);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Token error" },
      { status: 403 }
    );
  }

  const results = [];

  for (const url of toInspect) {
    let inspectionResult: Record<string, unknown> | null = null;
    let error: string | null = null;

    try {
      const res = await fetch(
        "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inspectionUrl: url,
            siteUrl: site.domain,
          }),
          signal: AbortSignal.timeout(30_000),
        }
      );

      if (res.ok) {
        inspectionResult = await res.json();
      } else {
        const errText = await res.text();
        error = errText;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Network error";
    }

    const indexStatusResult =
      (inspectionResult as Record<string, unknown>)?.inspectionResult as Record<string, unknown> | undefined;
    const coverageState =
      ((indexStatusResult?.indexStatusResult as Record<string, unknown>)
        ?.coverageState as string) ?? null;
    const verdict =
      ((indexStatusResult?.indexStatusResult as Record<string, unknown>)
        ?.verdict as string) ?? null;

    const tip = getTipForStatus(coverageState);

    // Update DB
    const existing = await prisma.indexedUrl.findUnique({
      where: { siteId_url: { siteId: site.id, url } },
    });

    if (existing) {
      await prisma.indexedUrl.update({
        where: { id: existing.id },
        data: {
          gscStatus: coverageState ?? existing.gscStatus,
          lastSyncedAt: new Date(),
          ...(error ? { errorMessage: error } : {}),
        },
      });
    }

    // Log inspection
    await prisma.indexingLog.create({
      data: {
        userId: session.user.id,
        indexedUrlId: existing?.id ?? null,
        action: "inspected",
        details: JSON.stringify({
          url,
          coverageState,
          verdict,
          error,
          raw: inspectionResult,
        }),
      },
    });

    results.push({
      url,
      coverageState,
      verdict,
      tip,
      rawResult: inspectionResult,
      error,
    });
  }

  await incrementInspections(session.user.id, toInspect.length);

  return NextResponse.json({
    results,
    inspectionsUsed: toInspect.length,
    inspectionsRemaining: remaining - toInspect.length,
  });
}
