import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requestRemovalFromGoogle } from "@/lib/indexing-api";
import { reserveGoogleQuota, releaseGoogleQuota } from "@/lib/google-auth";

/**
 * POST /api/indexing/sites/[siteId]/request-removal
 * Sends a URL_DELETED notification to the Google Indexing API for a single URL.
 * Counts against daily Google quota to prevent rate-limit abuse.
 * Body: { urlId: string }
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

  const body = await req.json().catch(() => ({}));
  const { urlId } = body as { urlId?: string };

  if (!urlId) {
    return NextResponse.json({ error: "urlId is required" }, { status: 400 });
  }

  const indexedUrl = await prisma.indexedUrl.findUnique({
    where: { id: urlId },
  });

  if (!indexedUrl || indexedUrl.siteId !== siteId) {
    return NextResponse.json({ error: "URL not found" }, { status: 404 });
  }

  // Reserve 1 quota slot (removal uses Google Indexing API, same rate limits)
  const reserved = await reserveGoogleQuota(session.user.id, 1);
  if (reserved <= 0) {
    return NextResponse.json(
      { error: "Google daily quota exhausted" },
      { status: 429 }
    );
  }

  // Send URL_DELETED notification to Google Indexing API
  const result = await requestRemovalFromGoogle(session.user.id, indexedUrl.url);

  if (!result.success) {
    // Release the reserved quota on failure
    await releaseGoogleQuota(session.user.id, 1);
    return NextResponse.json(
      { error: result.error ?? "Google API error", httpStatus: result.httpStatus },
      { status: 502 }
    );
  }

  // Update URL status in DB
  await prisma.indexedUrl.update({
    where: { id: urlId },
    data: {
      indexingStatus: "removal_requested",
      submittedAt: new Date(),
    },
  });

  // Write activity log entry
  await prisma.indexingLog.create({
    data: {
      siteId,
      userId: session.user.id,
      indexedUrlId: urlId,
      action: "removal_requested",
      details: JSON.stringify({ url: indexedUrl.url }),
    },
  });

  return NextResponse.json({ success: true, url: indexedUrl.url });
}
