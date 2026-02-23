import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getValidAccessToken, INDEXED_GSC_STATUSES } from "@/lib/google-auth";
import { fetchSitemapUrls, fallbackSitemapUrl } from "@/lib/sitemap-parser";

/**
 * POST /api/indexing/sites/[siteId]/sync-urls
 * 1. Pull indexed URLs from GSC Search Analytics (bulk, last 30 days)
 * 2. Pull sitemap URLs, mark ones not in GSC data as not-indexed
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

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(session.user.id);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Token error" },
      { status: 403 }
    );
  }

  // ── 1. Search Analytics: get URLs that appear in search results ──────────
  const indexedUrls = new Set<string>();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString().slice(0, 10);
  const endDate = new Date().toISOString().slice(0, 10);

  let startRow = 0;
  const ROW_LIMIT = 25000;
  let gscError: string | null = null;

  while (true) {
    const searchRes = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site.domain)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ["page"],
          rowLimit: ROW_LIMIT,
          startRow,
        }),
      }
    );

    if (!searchRes.ok) {
      const errText = await searchRes.text().catch(() => "Unknown error");
      gscError = `GSC Search Analytics error (${searchRes.status}): ${errText}`;
      console.error("[sync-urls]", gscError);
      break;
    }

    const searchData = await searchRes.json();
    const rows: Array<{ keys: string[] }> = searchData.rows ?? [];

    for (const row of rows) {
      const url = row.keys[0];
      if (url) indexedUrls.add(url);
    }

    if (rows.length < ROW_LIMIT) break;
    startRow += ROW_LIMIT;
  }

  // Upsert indexed URLs from Search Analytics
  const now = new Date();
  for (const url of indexedUrls) {
    await prisma.indexedUrl.upsert({
      where: { siteId_url: { siteId: site.id, url } },
      create: {
        siteId: site.id,
        url,
        gscStatus: "Submitted and indexed",
        lastSyncedAt: now,
      },
      update: {
        gscStatus: "Submitted and indexed",
        lastSyncedAt: now,
      },
    });
  }

  // ── 2. Sitemap URLs: find not-indexed pages ───────────────────────────────
  const sitemapUrl = site.sitemapUrl ?? fallbackSitemapUrl(site.domain);
  const sitemapEntries = await fetchSitemapUrls(sitemapUrl);

  let newCount = 0;

  for (const { loc, lastmod } of sitemapEntries) {
    const existing = await prisma.indexedUrl.findUnique({
      where: { siteId_url: { siteId: site.id, url: loc } },
    });

    if (!existing) {
      await prisma.indexedUrl.create({
        data: {
          siteId: site.id,
          url: loc,
          gscStatus: "URL is unknown to Google",
          lastmod,
          isNew: true,
          indexingStatus: "none",
          lastSyncedAt: now,
        },
      });
      newCount++;
    } else if (lastmod && lastmod !== existing.lastmod) {
      await prisma.indexedUrl.update({
        where: { id: existing.id },
        data: { lastmod, isChanged: true, lastSyncedAt: now },
      });
    } else {
      await prisma.indexedUrl.update({
        where: { id: existing.id },
        data: { lastSyncedAt: now },
      });
    }
  }

  // Log sync
  await prisma.indexingLog.create({
    data: {
      userId: session.user.id,
      action: "synced",
      details: JSON.stringify({
        siteId: site.id,
        domain: site.domain,
        indexedFromGSC: indexedUrls.size,
        sitemapUrls: sitemapEntries.length,
        newFound: newCount,
      }),
    },
  });

  await prisma.site.update({
    where: { id: site.id },
    data: { lastSyncedAt: now },
  });

  const totalUrls = await prisma.indexedUrl.count({ where: { siteId: site.id } });
  const notIndexed = await prisma.indexedUrl.count({
    where: {
      siteId: site.id,
      gscStatus: { notIn: [...INDEXED_GSC_STATUSES] },
    },
  });

  return NextResponse.json({
    indexedFromGSC: indexedUrls.size,
    sitemapUrls: sitemapEntries.length,
    newFound: newCount,
    totalUrls,
    notIndexed,
    ...(gscError ? { warning: gscError } : {}),
  });
}
