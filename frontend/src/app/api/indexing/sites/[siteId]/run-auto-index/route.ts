import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runAutoIndexForSite } from "@/lib/auto-indexer";

/**
 * POST /api/indexing/sites/[siteId]/run-auto-index
 * Manually trigger the daily auto-index job for a specific site.
 */
export async function POST(
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

  const result = await runAutoIndexForSite(site);

  return NextResponse.json(result);
}
