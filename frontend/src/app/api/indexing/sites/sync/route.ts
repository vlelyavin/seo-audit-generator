import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getValidAccessToken,
  getGoogleAccount,
  hasRequiredScopes,
} from "@/lib/google-auth";

/**
 * POST /api/indexing/sites/sync
 * Fetch available GSC sites. Returns the list without auto-adding them.
 * Excludes sites the user has already added.
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

  // Only show sites with sufficient permissions
  const allowedPermissions = ["siteOwner", "siteFullUser", "siteRestrictedUser"];
  const eligible = gscSites.filter((s) =>
    allowedPermissions.includes(s.permissionLevel)
  );

  // Get user's already-added sites
  const existingSites = await prisma.site.findMany({
    where: { userId: session.user.id },
    select: { domain: true },
  });
  const existingDomains = new Set(existingSites.map((s) => s.domain));

  // Filter out already-added sites
  const available = eligible.filter((s) => !existingDomains.has(s.siteUrl));

  // Mark user as gscConnected
  await prisma.user.update({
    where: { id: session.user.id },
    data: { gscConnected: true, gscConnectedAt: new Date() },
  });

  return NextResponse.json({
    available,
    existingCount: existingSites.length,
  });
}
