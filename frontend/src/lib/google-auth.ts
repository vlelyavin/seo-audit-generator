/**
 * Google OAuth token helpers for the indexing feature.
 * Tokens are stored in the NextAuth `Account` table.
 */

import { prisma } from "./prisma";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters";
const INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null; // Unix seconds
  scope: string | null;
}

/** Retrieve Google account tokens for a given user. Returns null if not found. */
export async function getGoogleAccount(userId: string) {
  return prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
}

/**
 * Returns a valid access token for the user, refreshing it if expired.
 * Throws if no Google account is linked or the token cannot be refreshed.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const account = await getGoogleAccount(userId);
  if (!account || !account.access_token) {
    throw new Error("Google account not connected");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const bufferSeconds = 60; // refresh 60s before expiry

  const isExpired =
    account.expires_at !== null &&
    account.expires_at < nowSeconds + bufferSeconds;

  if (!isExpired) {
    return account.access_token;
  }

  // Need to refresh
  if (!account.refresh_token) {
    throw new Error("No refresh token available — user must re-authorize");
  }

  const refreshed = await refreshAccessToken(
    account.refresh_token,
    account.id
  );
  return refreshed;
}

async function refreshAccessToken(
  refreshToken: string,
  accountId: string
): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.AUTH_GOOGLE_ID ?? "",
    client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to refresh Google token: ${text}`);
  }

  const data = await res.json();

  const newExpiresAt = Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600);

  await prisma.account.update({
    where: { id: accountId },
    data: {
      access_token: data.access_token,
      expires_at: newExpiresAt,
      ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
    },
  });

  return data.access_token as string;
}

/** Check whether the user's Google account has the required GSC + Indexing scopes. */
export function hasRequiredScopes(scope: string | null): boolean {
  if (!scope) return false;
  return scope.includes(GSC_SCOPE) && scope.includes(INDEXING_SCOPE);
}

/** Return today's date string in YYYY-MM-DD (UTC). */
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Get or create today's quota record, returning current counts. */
export async function getDailyQuota(userId: string) {
  const date = todayUTC();
  const quota = await prisma.userDailyQuota.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date },
    update: {},
  });
  return quota;
}

/** Increment Google submission count for today. */
export async function incrementGoogleSubmissions(
  userId: string,
  count: number
) {
  const date = todayUTC();
  await prisma.userDailyQuota.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, googleSubmissions: count },
    update: { googleSubmissions: { increment: count } },
  });
}

/** Increment URL inspection count for today. */
export async function incrementInspections(userId: string, count: number) {
  const date = todayUTC();
  await prisma.userDailyQuota.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, inspectionsUsed: count },
    update: { inspectionsUsed: { increment: count } },
  });
}

export const GOOGLE_DAILY_SUBMISSION_LIMIT = 200;
export const GOOGLE_DAILY_INSPECTION_LIMIT = 2000;
