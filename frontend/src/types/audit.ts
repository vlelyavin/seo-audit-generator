/** Mirrors Python AuditStatus enum */
export type AuditStatus =
  | "pending"
  | "crawling"
  | "analyzing"
  | "screenshots"
  | "generating_report"
  | "completed"
  | "failed";

/** Mirrors Python SeverityLevel enum */
export type SeverityLevel = "success" | "warning" | "error" | "info";

/** Mirrors Python AuditIssue */
export interface AuditIssue {
  category: string;
  severity: SeverityLevel;
  message: string;
  details?: string | null;
  affected_urls: string[];
  recommendation?: string | null;
  count: number;
}

/** Mirrors Python AnalyzerResult */
export interface AnalyzerResult {
  name: string;
  display_name: string;
  icon: string;
  severity: SeverityLevel;
  summary: string;
  description: string;
  theory: string;
  issues: AuditIssue[];
  data: Record<string, unknown>;
  screenshots: string[];
  tables: TableData[];
}

/** Table data returned by analyzers */
export interface TableData {
  title?: string;
  headers: string[];
  rows: (string | number | boolean | null)[][] | Record<string, string | number | boolean | null>[];
}

/** Mirrors Python ProgressEvent */
export interface ProgressEvent {
  status: AuditStatus;
  progress: number;
  message: string;
  current_url?: string | null;
  pages_crawled: number;
  stage?: string | null;
  analyzer_name?: string | null;
}

/** Mirrors Python SpeedMetrics */
export interface SpeedMetrics {
  score: number;
  fcp?: number | null;
  lcp?: number | null;
  cls?: number | null;
  tbt?: number | null;
  speed_index?: number | null;
  screenshot?: string | null;
}

/** Summary of an audit (for dashboard list) */
export interface AuditSummary {
  id: string;
  fastApiId: string;
  url: string;
  status: string;
  language: string;
  pagesCrawled: number;
  totalIssues: number;
  criticalIssues: number;
  warnings: number;
  passedChecks: number;
  errorMessage?: string | null;
  startedAt: string;
  completedAt?: string | null;
}

/** Full audit results stored in DB */
export interface AuditResults {
  [analyzerName: string]: AnalyzerResult;
}

/** API response when starting an audit */
export interface StartAuditResponse {
  audit_id: string;
  status: string;
}

/** API response for audit status check */
export interface AuditStatusResponse {
  id: string;
  url: string;
  status: AuditStatus;
  pages_crawled: number;
  total_issues: number;
  report_path?: string | null;
}

/** All analyzer names */
export const ANALYZER_NAMES = [
  "cms",
  "meta_tags",
  "headings",
  "page_404",
  "speed",
  "images",
  "content",
  "links",
  "favicon",
  "external_links",
  "robots",
  "structure",
  "content_sections",
  "schema",
  "social_tags",
  "security",
  "mobile",
  "url_quality",
  "hreflang",
  "duplicates",
  "redirects",
] as const;

export type AnalyzerName = (typeof ANALYZER_NAMES)[number];

/** Human-readable analyzer labels (English) */
export const ANALYZER_LABELS: Record<AnalyzerName, string> = {
  cms: "CMS / Platform",
  meta_tags: "Meta Tags",
  headings: "Headings H1-H6",
  page_404: "404 Page",
  speed: "Page Speed",
  images: "Images",
  content: "Content",
  links: "Broken Links",
  favicon: "Favicon",
  external_links: "External Links",
  robots: "Indexing",
  structure: "Site Structure",
  content_sections: "Content Sections",
  schema: "Structured Data",
  social_tags: "Social Meta Tags",
  security: "HTTPS & Security",
  mobile: "Mobile",
  url_quality: "URL Quality",
  hreflang: "Hreflang",
  duplicates: "Duplicates",
  redirects: "Redirects",
};

/** Severity badge colors */
export const SEVERITY_COLORS: Record<SeverityLevel, { bg: string; text: string; border: string }> = {
  error: {
    bg: "bg-red-50 dark:bg-red-900/20",
    text: "text-red-600 dark:text-red-400",
    border: "border-red-200 dark:border-red-800",
  },
  warning: {
    bg: "bg-yellow-50 dark:bg-yellow-900/20",
    text: "text-yellow-600 dark:text-yellow-400",
    border: "border-yellow-200 dark:border-yellow-800",
  },
  success: {
    bg: "bg-green-50 dark:bg-green-900/20",
    text: "text-green-600 dark:text-green-400",
    border: "border-green-200 dark:border-green-800",
  },
  info: {
    bg: "bg-gray-100 dark:bg-gray-900",
    text: "text-gray-900 dark:text-white",
    border: "border-gray-200 dark:border-gray-700",
  },
};
