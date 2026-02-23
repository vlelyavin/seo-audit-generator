import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDailyQuota, INDEXED_GSC_STATUSES } from "@/lib/google-auth";

/**
 * GET /api/indexing/sites/[siteId]/stats
 * Returns total URLs, indexed, not indexed, submitted, failed, 404s, and today's quota.
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

  const [total, submittedGoogle, submittedBing, failed, is404s, pending] =
    await Promise.all([
      prisma.indexedUrl.count({ where: { siteId } }),
      prisma.indexedUrl.count({
        where: { siteId, indexingStatus: "submitted", submissionMethod: { contains: "google_api" } },
      }),
      prisma.indexedUrl.count({
        where: { siteId, indexingStatus: "submitted", submissionMethod: { contains: "indexnow" } },
      }),
      prisma.indexedUrl.count({
        where: { siteId, indexingStatus: "failed" },
      }),
      prisma.indexedUrl.count({
        where: { siteId, httpStatus: { in: [404, 410] } },
      }),
      prisma.indexedUrl.count({
        where: { siteId, indexingStatus: "pending" },
      }),
    ]);

  // Count GSC-confirmed indexed URLs
  const indexed = await prisma.indexedUrl.count({
    where: {
      siteId,
      gscStatus: { in: [...INDEXED_GSC_STATUSES] },
    },
  });

  const notIndexed = total - indexed;
  const quota = await getDailyQuota(session.user.id);

  return NextResponse.json({
    total,
    indexed,
    notIndexed,
    pending,
    submittedGoogle,
    submittedBing,
    failed,
    is404s,
    todayGoogleSubmissions: quota.googleSubmissions,
    todayInspections: quota.inspectionsUsed,
  });
}
