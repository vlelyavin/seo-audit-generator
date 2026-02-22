/**
 * Sitemap fetching and parsing utilities.
 * Handles sitemap index files, gzipped sitemaps, and extracts <loc> / <lastmod>.
 */

import { XMLParser } from "fast-xml-parser";

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
}

const parser = new XMLParser({ ignoreAttributes: false });

/**
 * Fetch and parse a sitemap (or sitemap index), returning all URLs found.
 * Recursively follows sitemap index files up to one level deep.
 */
export async function fetchSitemapUrls(
  sitemapUrl: string,
  depth = 0
): Promise<SitemapUrl[]> {
  if (depth > 2) return []; // safety cap

  let body: string;
  try {
    const res = await fetch(sitemapUrl, {
      headers: { "User-Agent": "SEO-Audit-Tool-Indexer/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    body = await res.text();
  } catch {
    return [];
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(body);
  } catch {
    return [];
  }

  // Sitemap index: contains <sitemapindex><sitemap><loc>…</loc></sitemap>…
  const sitemapIndex =
    (parsed as Record<string, unknown>)["sitemapindex"] as
      | Record<string, unknown>
      | undefined;
  if (sitemapIndex) {
    const entries = normalizeToArray(sitemapIndex["sitemap"]) as Array<
      Record<string, unknown>
    >;
    const results: SitemapUrl[] = [];
    for (const entry of entries) {
      const loc = String(entry["loc"] ?? "").trim();
      if (!loc) continue;
      const sub = await fetchSitemapUrls(loc, depth + 1);
      results.push(...sub);
    }
    return results;
  }

  // Regular sitemap: contains <urlset><url><loc>…</loc></url>…
  const urlset = (parsed as Record<string, unknown>)["urlset"] as
    | Record<string, unknown>
    | undefined;
  if (urlset) {
    const entries = normalizeToArray(urlset["url"]) as Array<
      Record<string, unknown>
    >;
    const urls: SitemapUrl[] = [];
    for (const entry of entries) {
      const loc = String(entry["loc"] ?? "").trim();
      if (!loc) continue;
      const lastmod = entry["lastmod"]
        ? String(entry["lastmod"]).trim()
        : undefined;
      urls.push({ loc, lastmod });
    }
    return urls;
  }

  return [];
}

/** Normalise a value that might be an array or a single object. */
function normalizeToArray(val: unknown): unknown[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

/** Attempt to find a sitemap URL for a domain from GSC sitemaps. Falls back to /sitemap.xml. */
export function fallbackSitemapUrl(domain: string): string {
  const base = domain.startsWith("sc-domain:")
    ? `https://${domain.replace("sc-domain:", "")}`
    : domain.replace(/\/$/, "");
  return `${base}/sitemap.xml`;
}
