import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INDEXED_GSC_STATUSES, getValidAccessToken, getGoogleAccount, hasRequiredScopes } from "@/lib/google-auth";
import { generateIndexNowKey } from "@/lib/indexing-api";
import { fallbackSitemapUrl } from "@/lib/sitemap-parser";

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
        where: { siteId: site.id, gscStatus: { in: [...INDEXED_GSC_STATUSES] } },
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

/**
 * POST /api/indexing/sites
 * Add a single GSC site. Enforces the plan's maxSites limit.
 * Body: { domain: string }
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { domain } = body as { domain?: string };
  if (!domain) {
    return NextResponse.json({ error: "domain is required" }, { status: 400 });
  }

  // Check plan site limit
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { plan: true },
  });
  if (!user?.plan) {
    return NextResponse.json({ error: "No plan found" }, { status: 400 });
  }

  const currentSiteCount = await prisma.site.count({
    where: { userId: session.user.id },
  });
  if (currentSiteCount >= user.plan.maxSites) {
    return NextResponse.json(
      { error: "Site limit reached. Upgrade your plan to add more sites." },
      { status: 403 }
    );
  }

  // Check if site already exists for this user
  const existing = await prisma.site.findUnique({
    where: { userId_domain: { userId: session.user.id, domain } },
  });
  if (existing) {
    return NextResponse.json({ error: "Site already added" }, { status: 409 });
  }

  // Try to detect sitemap from GSC
  let sitemapUrl: string | null = null;
  try {
    const account = await getGoogleAccount(session.user.id);
    if (account && hasRequiredScopes(account.scope)) {
      const accessToken = await getValidAccessToken(session.user.id);
      const encodedSite = encodeURIComponent(domain);
      const smRes = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/sitemaps`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (smRes.ok) {
        const smData = await smRes.json();
        const sitemaps = smData.sitemap ?? [];
        if (sitemaps.length > 0) {
          sitemapUrl = sitemaps[0].path as string;
        }
      }
    }
  } catch {
    // Non-fatal — use fallback
  }

  const site = await prisma.site.create({
    data: {
      userId: session.user.id,
      domain,
      sitemapUrl: sitemapUrl ?? fallbackSitemapUrl(domain),
      indexnowKey: generateIndexNowKey(),
    },
  });

  return NextResponse.json({ site }, { status: 201 });
}
