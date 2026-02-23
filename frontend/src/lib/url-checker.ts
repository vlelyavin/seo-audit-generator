/**
 * 404 / redirect detection for URLs before submission.
 * Sends HEAD requests with a 10s timeout.
 */

export type UrlCheckResult = {
  url: string;
  httpStatus: number | null;
  isAlive: boolean; // true if 2xx or 3xx without bad redirect
  is404: boolean;
  isRedirect: boolean;
  redirectTarget?: string;
  error?: string;
};

export async function checkUrl(url: string): Promise<UrlCheckResult> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "SEO-Audit-Tool-Indexer/1.0" },
    });

    const status = res.status;
    const isRedirect = status >= 300 && status < 400;
    const is404 = status === 404 || status === 410;
    // Consider URL alive only for 2xx responses and redirects (3xx)
    const isAlive = status < 400;

    return {
      url,
      httpStatus: status,
      isAlive,
      is404,
      isRedirect,
      redirectTarget: isRedirect
        ? (res.headers.get("location") ?? undefined)
        : undefined,
    };
  } catch (err) {
    return {
      url,
      httpStatus: null,
      isAlive: false,
      is404: false,
      isRedirect: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function checkUrls(urls: string[]): Promise<UrlCheckResult[]> {
  // Run in parallel with a concurrency limit of 10
  const limit = 10;
  const results: UrlCheckResult[] = [];
  for (let i = 0; i < urls.length; i += limit) {
    const batch = urls.slice(i, i + limit);
    const batchResults = await Promise.all(batch.map(checkUrl));
    results.push(...batchResults);
  }
  return results;
}
