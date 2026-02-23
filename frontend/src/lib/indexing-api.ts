/**
 * Wrappers for the Google Indexing API and IndexNow API.
 */

import { getValidAccessToken } from "./google-auth";

// ── Google Indexing API ───────────────────────────────────────────────────────

export type GoogleSubmitResult = {
  url: string;
  success: boolean;
  httpStatus?: number;
  error?: string;
};

/**
 * Submit a single URL to Google via the Indexing API using the user's token.
 */
export async function submitUrlToGoogle(
  userId: string,
  url: string
): Promise<GoogleSubmitResult> {
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(userId);
  } catch (e) {
    return {
      url,
      success: false,
      error: e instanceof Error ? e.message : "Token error",
    };
  }

  try {
    const res = await fetch(
      "https://indexing.googleapis.com/v3/urlNotifications:publish",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, type: "URL_UPDATED" }),
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (res.ok) {
      return { url, success: true, httpStatus: res.status };
    }

    const errBody = await res.text();
    return {
      url,
      success: false,
      httpStatus: res.status,
      error: errBody,
    };
  } catch (e) {
    return {
      url,
      success: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

/**
 * Submit multiple URLs to Google Indexing API with retry (up to 3x) on 5xx.
 * Stops on 429 and returns the remaining URLs as pending.
 */
export async function submitUrlsBatchToGoogle(
  userId: string,
  urls: string[]
): Promise<{
  submitted: GoogleSubmitResult[];
  rateLimited: string[];
  failed: GoogleSubmitResult[];
}> {
  const submitted: GoogleSubmitResult[] = [];
  const rateLimited: string[] = [];
  const failed: GoogleSubmitResult[] = [];

  let hitRateLimit = false;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];

    // If we already hit a 429, add all remaining URLs to rateLimited
    if (hitRateLimit) {
      rateLimited.push(url);
      continue;
    }

    let result: GoogleSubmitResult | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      result = await submitUrlToGoogle(userId, url);
      if (result.success) break;
      if (result.httpStatus === 429) {
        rateLimited.push(url);
        // Also add all remaining URLs (they will all fail too)
        for (let j = i + 1; j < urls.length; j++) {
          rateLimited.push(urls[j]);
        }
        hitRateLimit = true;
        result = null;
        break;
      }
      if (result.httpStatus && result.httpStatus < 500) break; // client error, don't retry
      if (attempt < 3) await delay(attempt * 1000); // exponential backoff
    }

    if (hitRateLimit) break;
    if (result === null) continue; // already in rateLimited
    if (result.success) {
      submitted.push(result);
    } else {
      failed.push(result);
    }
  }

  return { submitted, rateLimited, failed };
}

/**
 * Notify Google that a URL has been deleted / should be removed from search.
 * Uses the Indexing API URL_DELETED notification type.
 */
export async function requestRemovalFromGoogle(
  userId: string,
  url: string
): Promise<GoogleSubmitResult> {
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(userId);
  } catch (e) {
    return {
      url,
      success: false,
      error: e instanceof Error ? e.message : "Token error",
    };
  }

  try {
    const res = await fetch(
      "https://indexing.googleapis.com/v3/urlNotifications:publish",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, type: "URL_DELETED" }),
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (res.ok) return { url, success: true, httpStatus: res.status };
    const errBody = await res.text();
    return { url, success: false, httpStatus: res.status, error: errBody };
  } catch (e) {
    return {
      url,
      success: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

// ── IndexNow (Bing / Yandex / DuckDuckGo) ────────────────────────────────────

export type IndexNowResult = {
  success: boolean;
  httpStatus?: number;
  error?: string;
  urlsSubmitted: number;
};

/**
 * Submit URLs to IndexNow (batched — up to 10,000 per request).
 * Uses the per-site key stored in the Site record.
 */
export async function submitUrlsToIndexNow(
  host: string,
  indexnowKey: string,
  urls: string[]
): Promise<IndexNowResult> {
  if (urls.length === 0) return { success: true, urlsSubmitted: 0 };

  const BATCH = 10_000;
  let totalSubmitted = 0;

  for (let i = 0; i < urls.length; i += BATCH) {
    const batch = urls.slice(i, i + BATCH);
    try {
      const res = await fetch("https://api.indexnow.org/indexnow", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ host, key: indexnowKey, urlList: batch }),
        signal: AbortSignal.timeout(30_000),
      });

      if (res.status === 200 || res.status === 202) {
        totalSubmitted += batch.length;
      } else if (res.status === 429) {
        return {
          success: false,
          httpStatus: res.status,
          error: "Rate limited by IndexNow",
          urlsSubmitted: totalSubmitted,
        };
      } else {
        const body = await res.text();
        return {
          success: false,
          httpStatus: res.status,
          error: body,
          urlsSubmitted: totalSubmitted,
        };
      }
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Network error",
        urlsSubmitted: totalSubmitted,
      };
    }
  }

  return { success: true, urlsSubmitted: totalSubmitted };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

/** Generate a random 32-character hex key (for IndexNow per-site keys). */
export function generateIndexNowKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
