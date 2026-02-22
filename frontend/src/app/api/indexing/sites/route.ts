import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/indexing/sites
 * List the user's sites with URL counts grouped by status.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sites = await prisma.site.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { indexedUrls: true } },
    },
  });

  // Compute per-status counts for each site
  const sitesWithCounts = await Promise.all(
    sites.map(async (site) => {
      const statusCounts = await prisma.indexedUrl.groupBy({
        by: ["indexingStatus"],
        where: { siteId: site.id },
        _count: { id: true },
      });

      const counts: Record<string, number> = {};
      for (const row of statusCounts) {
        counts[row.indexingStatus] = row._count.id;
      }

      // GSC status breakdown (indexed vs not indexed)
      const indexed = await prisma.indexedUrl.count({
        where: { siteId: site.id, gscStatus: { contains: "indexed" } },
      });

      return {
        ...site,
        totalUrls: site._count.indexedUrls,
        submissionCounts: counts,
        indexedCount: indexed,
      };
    })
  );

  return NextResponse.json({ sites: sitesWithCounts });
}
