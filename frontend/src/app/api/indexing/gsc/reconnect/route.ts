import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * POST /api/indexing/gsc/reconnect
 * Returns the URL the user should visit to re-authorize with full scopes.
 * Forces consent screen to ensure all required scopes are granted.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.AUTH_GOOGLE_ID ?? "";
  const redirectUri = `${process.env.AUTH_URL ?? "http://localhost:3000"}/api/auth/callback/google`;

  const scopes = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/webmasters",
    "https://www.googleapis.com/auth/indexing",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent",
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return NextResponse.json({ authUrl });
}
