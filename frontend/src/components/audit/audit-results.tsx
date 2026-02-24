"use client";

import { useState, useRef } from "react";
import {
  BarChart3,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Download,
  Search,
  Filter,
  Loader2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { AnalyzerSection } from "./analyzer-section";
import { ExportDialog } from "@/components/ui/export-dialog";
import { cn } from "@/lib/utils";
import { getPlanCapabilities } from "@/lib/plan-capabilities";
import type { AuditResults, SeverityLevel } from "@/types/audit";

interface AuditResultsViewProps {
  results: AuditResults;
  meta: Record<string, unknown>;
  auditId: string;
}

type FilterMode = "all" | "error" | "warning" | "success";

export function AuditResultsView({ results, meta, auditId }: AuditResultsViewProps) {
  const locale = useLocale();
  const t = useTranslations("audit");
  const { data: session } = useSession();
  const [filter, setFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const pagesCrawled = (meta.pages_crawled as number) || 0;
  const passedChecks = (meta.passed_checks as number) || 0;
  const warnings = (meta.warnings as number) || 0;
  const criticalIssues = (meta.critical_issues as number) || 0;
  const planCapabilities = getPlanCapabilities(session?.user?.planId);

  // Sort analyzers: errors first, then warnings, then success, then info
  const severityOrder: Record<SeverityLevel, number> = {
    error: 0,
    warning: 1,
    info: 2,
    success: 3,
  };

  const analyzerEntries = Object.entries(results)
    .filter(([, result]) => {
      if (filter === "all") return true;
      return result.severity === filter;
    })
    .filter(([, result]) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        result.display_name.toLowerCase().includes(q) ||
        result.summary.toLowerCase().includes(q) ||
        result.issues.some(
          (i) =>
            i.message.toLowerCase().includes(q) ||
            (i.details?.toLowerCase().includes(q) ?? false)
        )
      );
    })
    .sort(([, a], [, b]) => severityOrder[a.severity] - severityOrder[b.severity]);

  function scrollTo(name: string) {
    sectionRefs.current[name]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleExport(format: string, lang: string) {
    setExportingFormat(format);
    setExportError(null);

    try {
      const url = `/api/audit/${auditId}/export?format=${format}&lang=${lang}`;

      const response = await fetch(url);
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || t("exportFailed"));
      }

      // Create download link
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;

      // Extract filename from content-disposition header or create default
      const contentDisposition = response.headers.get('content-disposition');
      const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/);
      a.download = filenameMatch ? filenameMatch[1] : `audit.${format}`;

      a.click();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error("Export failed:", error);
      setExportError(
        error instanceof Error ? error.message : t("exportFailed")
      );
    } finally {
      setExportingFormat(null);
    }
  }

  const filterButtons: { key: FilterMode; label: string; icon: React.ReactNode }[] = [
    { key: "all", label: t("filterAll"), icon: <Filter className="h-3.5 w-3.5 shrink-0" /> },
    { key: "error", label: t("filterErrors"), icon: <XCircle className="h-3.5 w-3.5 shrink-0" /> },
    { key: "warning", label: t("filterWarnings"), icon: <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> },
    { key: "success", label: t("filterPassed"), icon: <CheckCircle className="h-3.5 w-3.5 shrink-0" /> },
  ];

  return (
    <div>
      <div className="flex gap-6">
        {/* Left sidebar nav */}
        <aside className="hidden w-56 shrink-0 xl:block">
        <div className="sticky top-0 space-y-1">
          {Object.entries(results).map(([name, result]) => (
            <button
              key={name}
              onClick={() => scrollTo(name)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-[calc(var(--spacing)*1)] text-left text-sm text-gray-300 hover:bg-gray-900"
            >
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  result.severity === "error" && "bg-red-500",
                  result.severity === "warning" && "bg-yellow-500",
                  result.severity === "success" && "bg-green-500",
                  result.severity === "info" && "bg-gray-500"
                )}
              />
              <span className="truncate">{result.display_name}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <div className="min-w-0 flex-1 space-y-6">
        {/* Summary stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={BarChart3} label={t("pagesCrawled")} value={pagesCrawled} color="gray" />
          <StatCard icon={CheckCircle} label={t("passedChecks")} value={passedChecks} color="green" />
          <StatCard icon={AlertTriangle} label={t("warnings")} value={warnings} color="yellow" />
          <StatCard icon={XCircle} label={t("criticalIssues")} value={criticalIssues} color="red" />
        </div>

        {/* Filter bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-4">
          <div className="w-full overflow-x-auto sm:w-auto">
            <div className="inline-flex h-11 items-center gap-1 whitespace-nowrap rounded-lg border border-gray-800 bg-black p-1">
              {filterButtons.map((fb) => (
                <button
                  key={fb.key}
                  onClick={() => setFilter(fb.key)}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                    filter === fb.key
                      ? "border border-gray-700 bg-gray-900 text-white shadow-sm"
                      : "border border-transparent text-gray-400 hover:text-gray-200"
                  )}
                >
                  <span className="shrink-0">{fb.icon}</span>
                  <span className="truncate">{fb.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchIssues")}
                className="h-11 w-full rounded-lg border border-gray-800 bg-black py-1.5 pl-9 pr-3 text-base md:text-sm text-white outline-none placeholder-gray-500 transition-colors focus:border-copper focus:ring-2 focus:ring-copper/20"
              />
            </div>

            {/* Export button */}
            <div className="shrink-0">
              <button
                type="button"
                disabled={exportingFormat !== null}
                onClick={() => setExportDialogOpen(true)}
                className={cn(
                  "flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors",
                  exportingFormat
                    ? "cursor-not-allowed opacity-50 border-gray-700 text-gray-500"
                    : "border-gray-800 bg-black text-gray-300 hover:bg-gray-900"
                )}
              >
                {exportingFormat ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("generating", { format: exportingFormat.toUpperCase() })}
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    {t("export")}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Export dialog */}
          <ExportDialog
            open={exportDialogOpen}
            onClose={() => setExportDialogOpen(false)}
            onExport={handleExport}
            loading={exportingFormat !== null}
            defaultLang={locale}
            formatOptions={planCapabilities.allowedExportFormats}
          />
        </div>

        {/* Export error */}
        {exportError && (
          <div className="flex items-center justify-between rounded-lg border border-red-800 bg-red-900/20 px-4 py-2 text-sm text-red-300">
            <span>{exportError}</span>
            <button
              onClick={() => setExportError(null)}
              className="ml-4 text-red-400 hover:text-red-200"
            >
              &times;
            </button>
          </div>
        )}

        {/* Analyzer sections */}
        {analyzerEntries.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            {t("noMatchingResults")}
          </div>
        ) : (
          analyzerEntries.map(([name, result]) => (
            <div
              key={name}
              ref={(el) => { sectionRefs.current[name] = el; }}
            >
              <AnalyzerSection result={result} />
            </div>
          ))
        )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: "gray" | "green" | "yellow" | "red";
}) {
  const colorClasses = {
    gray: "bg-gray-900 text-white",
    green: "bg-green-900/20 text-green-400",
    yellow: "bg-yellow-900/20 text-yellow-400",
    red: "bg-red-900/20 text-red-400",
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-black p-4">
      <div className="flex items-center gap-3">
        <div className={cn("rounded-lg p-2", colorClasses[color])}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-[11px] leading-tight whitespace-nowrap text-gray-400 sm:text-xs">{label}</p>
        </div>
      </div>
    </div>
  );
}
