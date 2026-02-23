import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runAutoIndexForSite } from "@/lib/auto-indexer";
import { INDEXED_GSC_STATUSES } from "@/lib/google-auth";

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

  // Write DailyReport for this manual run
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [totalUrls, totalIndexed] = await Promise.all([
      prisma.indexedUrl.count({ where: { siteId: site.id } }),
      prisma.indexedUrl.count({
        where: { siteId: site.id, gscStatus: { in: [...INDEXED_GSC_STATUSES] } },
      }),
    ]);
    await prisma.dailyReport.upsert({
      where: { siteId_reportDate: { siteId: site.id, reportDate: today } },
      create: {
        siteId: site.id,
        userId: session.user.id,
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
    // Non-fatal
  }

  return NextResponse.json(result);
}
