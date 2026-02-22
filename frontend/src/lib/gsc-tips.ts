/**
 * Maps GSC coverage statuses to actionable tips for users.
 * Stored as a config object rather than hardcoded in every handler.
 */

export const GSC_STATUS_TIPS: Record<string, string> = {
  "Crawled - currently not indexed":
    "Google found this page but chose not to index it. Improve content quality, add internal links, or submit via the Indexing API.",
  "Discovered - currently not indexed":
    "Google knows about this page but hasn't crawled it yet. Submit for indexing to speed this up.",
  "URL is unknown to Google":
    "Google has never seen this URL. Submit it now via the Indexing API.",
  "Blocked by robots.txt":
    "Your robots.txt is blocking Google from crawling this page. Update robots.txt to allow access.",
  "Blocked due to noindex":
    "This page has a noindex meta tag or header. Remove it if you want this page indexed.",
  "Soft 404":
    "Google thinks this page is a soft 404 (thin or empty content). Add meaningful content.",
  "Redirect error":
    "This URL has a redirect problem. Fix the redirect chain or update the canonical URL.",
  Redirect:
    "This URL redirects. The redirect target should be the canonical URL.",
  "Server error (5xx)":
    "Google received a server error when crawling this page. Fix the server-side issue.",
  "Not found (404)":
    "This page returns a 404. Either restore the content or remove it from your sitemap.",
  "Submitted and indexed":
    "This URL is indexed by Google. No action needed.",
  Indexed:
    "This URL is indexed by Google. No action needed.",
  "Excluded by 'noindex' tag":
    "This page has a noindex tag. Remove it to allow indexing.",
  "Page with redirect":
    "This is a redirect page. Ensure the redirect destination is the canonical page.",
  "Duplicate, Google chose different canonical than user":
    "Google is indexing a different version of this page. Check your canonical tags.",
  "Duplicate without user-selected canonical":
    "This is a duplicate page without a canonical tag. Add a canonical to your preferred URL.",
};

/** Get a tip for a GSC status, with a sensible default. */
export function getTipForStatus(gscStatus: string | null | undefined): string {
  if (!gscStatus) return "Status unknown. Run an inspection to get details.";
  return (
    GSC_STATUS_TIPS[gscStatus] ??
    `Status: ${gscStatus}. Run a URL inspection for more details.`
  );
}

/** Whether this GSC status means the URL is indexed. */
export function isIndexed(gscStatus: string | null | undefined): boolean {
  if (!gscStatus) return false;
  return (
    gscStatus === "Submitted and indexed" ||
    gscStatus === "Indexed" ||
    gscStatus.toLowerCase().includes("indexed") &&
      !gscStatus.toLowerCase().includes("not indexed")
  );
}
