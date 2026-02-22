import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/indexing/sites/[siteId]/verify-key
 * Verifies that the IndexNow key file is accessible at the expected URL.
 * Returns { verified: boolean, keyUrl: string }
 */
export async function GET(
  _req: Request,
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

  if (!site.indexnowKey) {
    return NextResponse.json({ error: "No IndexNow key configured" }, { status: 400 });
  }

  const baseDomain = site.domain.startsWith("sc-domain:")
    ? `https://${site.domain.replace("sc-domain:", "")}`
    : site.domain.replace(/\/$/, "");

  const keyUrl = `${baseDomain}/${site.indexnowKey}.txt`;

  try {
    const res = await fetch(keyUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "IndexNow-Verify/1.0" },
    });

    if (!res.ok) {
      return NextResponse.json({ verified: false, keyUrl, status: res.status });
    }

    const text = await res.text();
    const verified = text.trim() === site.indexnowKey;
    return NextResponse.json({ verified, keyUrl, status: res.status });
  } catch (e) {
    return NextResponse.json({
      verified: false,
      keyUrl,
      error: e instanceof Error ? e.message : "Network error",
    });
  }
}
