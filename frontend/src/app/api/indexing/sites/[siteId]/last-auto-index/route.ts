import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/indexing/sites/[siteId]/last-auto-index
 * Returns the last DailyReport for this site (most recent auto-index run).
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

  const report = await prisma.dailyReport.findFirst({
    where: { siteId },
    orderBy: { reportDate: "desc" },
  });

  if (!report) {
    return NextResponse.json(null);
  }

  return NextResponse.json({
    reportDate: report.reportDate,
    newPagesFound: report.newPagesFound,
    changedPagesFound: report.changedPagesFound,
    removedPagesFound: report.removedPagesFound,
    submittedGoogle: report.submittedGoogle,
    submittedBing: report.submittedBing,
    submittedGoogleFailed: report.submittedGoogleFailed,
    submittedBingFailed: report.submittedBingFailed,
    pages404: report.pages404,
    totalIndexed: report.totalIndexed,
    totalUrls: report.totalUrls,
    details: report.details,
    createdAt: report.createdAt,
  });
}
