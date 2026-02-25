import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/token-encryption";

/**
 * GET /api/indexing/gsc/callback
 * Dedicated OAuth callback for the GSC reconnect flow.
 * Exchanges the authorization code for tokens and updates the Account record
 * with expanded scopes (webmasters + indexing).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("gsc_oauth_state")?.value;
  const locale = cookieStore.get("NEXT_LOCALE")?.value ?? "en";

  const baseUrl = process.env.AUTH_URL ?? "http://localhost:3000";
  const dashboardUrl = new URL(`/${locale}/dashboard/indexing`, baseUrl);

  // Handle errors from Google
  if (error) {
    return NextResponse.redirect(dashboardUrl);
  }

  // Verify CSRF state
  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(dashboardUrl);
  }

  // Verify user is logged in
  const session = await auth();
  if (!session?.user) {
    const loginUrl = new URL(`/${locale}/login`, baseUrl);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    return NextResponse.redirect(dashboardUrl);
  }

  // Exchange authorization code for tokens
  const callbackUrl = `${process.env.AUTH_URL ?? "http://localhost:3000"}/api/indexing/gsc/callback`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID ?? "",
      client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
      code,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl,
    }).toString(),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(dashboardUrl);
  }

  const tokens = await tokenRes.json();
  const expiresAt = Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 3600);

  // Update existing Google account record with new tokens and scopes
  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "google" },
  });

  if (account) {
    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: encryptToken(tokens.access_token),
        expires_at: expiresAt,
        scope: tokens.scope ?? account.scope,
        ...(tokens.refresh_token
          ? { refresh_token: encryptToken(tokens.refresh_token) }
          : {}),
        ...(tokens.id_token ? { id_token: tokens.id_token } : {}),
      },
    });
  }

  // Mark user as GSC connected
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      gscConnected: true,
      gscConnectedAt: new Date(),
    },
  });

  // Redirect back to indexing page, clearing the state cookie
  const response = NextResponse.redirect(dashboardUrl);
  response.cookies.delete("gsc_oauth_state");
  return response;
}
