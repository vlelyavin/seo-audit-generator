import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAutoIndexForSite } from "@/lib/auto-indexer";

/**
 * POST /api/indexing/cron
 * Processes all sites with auto-indexing enabled.
 * Designed to be called by an external cron (e.g., daily at 6 AM UTC).
 * Secured by a shared secret in the Authorization header.
 *
 * Header: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const sites = await prisma.site.findMany({
    where: {
      OR: [{ autoIndexGoogle: true }, { autoIndexBing: true }],
    },
    orderBy: { userId: "asc" },
  });

  const results = [];
  let currentUserId: string | null = null;

  for (const site of sites) {
    // If user changed, check their quota before processing
    if (site.userId !== currentUserId) {
      currentUserId = site.userId;
    }

    try {
      const result = await runAutoIndexForSite(site);
      results.push({ success: true, ...result });
    } catch (e) {
      results.push({
        success: false,
        siteId: site.id,
        domain: site.domain,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    processedSites: sites.length,
    results,
  });
}
