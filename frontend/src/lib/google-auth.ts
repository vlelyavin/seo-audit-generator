/**
 * Google OAuth token helpers for the indexing feature.
 * Tokens are stored encrypted (AES-256-GCM) in the NextAuth `Account` table.
 */

import { prisma } from "./prisma";
import { encryptToken, decryptToken } from "./token-encryption";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters";
const INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null; // Unix seconds
  scope: string | null;
}

/** Retrieve Google account tokens for a given user (decrypts tokens). Returns null if not found. */
export async function getGoogleAccount(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account) return null;

  // Decrypt tokens transparently (handles both encrypted and legacy plaintext)
  if (account.access_token) {
    account.access_token = decryptToken(account.access_token);
  }
  if (account.refresh_token) {
    account.refresh_token = decryptToken(account.refresh_token);
  }
  return account;
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
      access_token: encryptToken(data.access_token),
      expires_at: newExpiresAt,
      ...(data.refresh_token
        ? { refresh_token: encryptToken(data.refresh_token) }
        : {}),
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

/**
 * Atomically reserve Google quota: checks remaining quota and increments in a
 * single transaction. Returns the number of URLs actually reserved (0 if quota
 * is exhausted). Prevents concurrent submissions from both passing the quota
 * check and exceeding the daily limit.
 */
export async function reserveGoogleQuota(
  userId: string,
  requested: number
): Promise<number> {
  const date = todayUTC();
  return prisma.$transaction(async (tx) => {
    const quota = await tx.userDailyQuota.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date },
      update: {},
    });

    const remaining = GOOGLE_DAILY_SUBMISSION_LIMIT - quota.googleSubmissions;
    if (remaining <= 0) return 0;

    const toReserve = Math.min(requested, remaining);

    await tx.userDailyQuota.update({
      where: { id: quota.id },
      data: { googleSubmissions: { increment: toReserve } },
    });

    return toReserve;
  });
}

/**
 * Release previously reserved quota that was not actually used (e.g., rate
 * limited or failed submissions). Decrements the counter atomically.
 */
export async function releaseGoogleQuota(
  userId: string,
  count: number
): Promise<void> {
  if (count <= 0) return;
  const date = todayUTC();
  await prisma.userDailyQuota.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date },
    update: { googleSubmissions: { decrement: count } },
  });
}

/** Stale lock threshold: 10 minutes in milliseconds */
const LOCK_STALE_MS = 10 * 60 * 1000;

/**
 * Try to acquire a sync lock on a site. Returns true if acquired, false if
 * another operation is in progress.
 */
export async function acquireSyncLock(siteId: string): Promise<boolean> {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - LOCK_STALE_MS);

  // Atomically set syncLockedAt only if it's null or stale
  const result = await prisma.site.updateMany({
    where: {
      id: siteId,
      OR: [
        { syncLockedAt: null },
        { syncLockedAt: { lt: staleThreshold } },
      ],
    },
    data: { syncLockedAt: now },
  });

  return result.count > 0;
}

/** Release the sync lock on a site. */
export async function releaseSyncLock(siteId: string): Promise<void> {
  await prisma.site.update({
    where: { id: siteId },
    data: { syncLockedAt: null },
  });
}

/**
 * Try to acquire an auto-index lock on a site. Returns true if acquired.
 */
export async function acquireAutoIndexLock(siteId: string): Promise<boolean> {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - LOCK_STALE_MS);

  const result = await prisma.site.updateMany({
    where: {
      id: siteId,
      OR: [
        { autoIndexLockedAt: null },
        { autoIndexLockedAt: { lt: staleThreshold } },
      ],
    },
    data: { autoIndexLockedAt: now },
  });

  return result.count > 0;
}

/** Release the auto-index lock on a site. */
export async function releaseAutoIndexLock(siteId: string): Promise<void> {
  await prisma.site.update({
    where: { id: siteId },
    data: { autoIndexLockedAt: null },
  });
}

/** GSC statuses that count as "indexed". Use this everywhere instead of contains:"indexed". */
export const INDEXED_GSC_STATUSES = [
  "Submitted and indexed",
  "Indexed",
  "Indexed, not submitted in sitemap",
] as const;
