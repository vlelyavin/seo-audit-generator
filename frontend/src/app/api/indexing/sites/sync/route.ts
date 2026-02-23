import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getValidAccessToken,
  getGoogleAccount,
  hasRequiredScopes,
} from "@/lib/google-auth";
import { generateIndexNowKey } from "@/lib/indexing-api";
import { fallbackSitemapUrl } from "@/lib/sitemap-parser";

/**
 * POST /api/indexing/sites/sync
 * Pull the user's verified sites from Google Search Console, upsert into DB.
 * Only imports sites where user has siteOwner or siteFullUser permission.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await getGoogleAccount(session.user.id);
  if (!account || !hasRequiredScopes(account.scope)) {
    return NextResponse.json(
      {
        error:
          "Google Search Console access not authorized. Please reconnect your Google account.",
      },
      { status: 403 }
    );
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

  // Fetch site list from GSC
  const gscRes = await fetch(
    "https://www.googleapis.com/webmasters/v3/sites",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!gscRes.ok) {
    const err = await gscRes.text();
    return NextResponse.json(
      { error: `GSC API error: ${err}` },
      { status: 502 }
    );
  }

  const gscData = await gscRes.json();
  const gscSites: Array<{ siteUrl: string; permissionLevel: string }> =
    gscData.siteEntry ?? [];

  // Only import sites with sufficient permissions
  const allowedPermissions = ["siteOwner", "siteFullUser", "siteRestrictedUser"];
  const eligible = gscSites.filter((s) =>
    allowedPermissions.includes(s.permissionLevel)
  );

  const upsertedSites = [];

  for (const gscSite of eligible) {
    const domain = gscSite.siteUrl;

    // Try to detect sitemap URL from GSC sitemaps API
    let sitemapUrl: string | null = null;
    try {
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
    } catch {
      // Non-fatal
    }

    const site = await prisma.site.upsert({
      where: { userId_domain: { userId: session.user.id, domain } },
      create: {
        userId: session.user.id,
        domain,
        gscPermissionLevel: gscSite.permissionLevel,
        sitemapUrl: sitemapUrl ?? fallbackSitemapUrl(domain),
        indexnowKey: generateIndexNowKey(),
      },
      update: {
        gscPermissionLevel: gscSite.permissionLevel,
        ...(sitemapUrl ? { sitemapUrl } : {}),
      },
    });

    upsertedSites.push(site);
  }

  // Remove sites the user no longer has access to.
  // Safety: skip cleanup if GSC returned zero eligible sites — could be a temporary
  // API glitch or permission change. Don't wipe all data on empty response.
  if (eligible.length > 0) {
    const activeDomains = eligible.map((s) => s.siteUrl);
    await prisma.site.deleteMany({
      where: {
        userId: session.user.id,
        domain: { notIn: activeDomains },
      },
    });
  }

  // Mark user as gscConnected
  await prisma.user.update({
    where: { id: session.user.id },
    data: { gscConnected: true, gscConnectedAt: new Date() },
  });

  return NextResponse.json({ sites: upsertedSites, synced: upsertedSites.length });
}
