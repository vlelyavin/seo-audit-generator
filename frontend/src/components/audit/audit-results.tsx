"use client";

import { useState, useRef } from "react";
import {
  BarChart3,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Download,
  ChevronDown,
  Search,
  Filter,
} from "lucide-react";
import { AnalyzerSection } from "./analyzer-section";
import { cn } from "@/lib/utils";
import type { AuditResults, SeverityLevel, AnalyzerResult } from "@/types/audit";
import { SEVERITY_COLORS } from "@/types/audit";

interface AuditResultsViewProps {
  results: AuditResults;
  meta: Record<string, unknown>;
  auditId: string;
}

type FilterMode = "all" | "error" | "warning" | "success";

export function AuditResultsView({ results, meta, auditId }: AuditResultsViewProps) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const pagesCrawled = (meta.pages_crawled as number) || 0;
  const passedChecks = (meta.passed_checks as number) || 0;
  const warnings = (meta.warnings as number) || 0;
  const criticalIssues = (meta.critical_issues as number) || 0;

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

  async function handleExport(format: string) {
    setExportOpen(false);
    const url = `/api/audit/${auditId}/export?format=${format}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    a.click();
  }

  const filterButtons: { key: FilterMode; label: string; icon: React.ReactNode }[] = [
    { key: "all", label: "All", icon: <Filter className="h-3.5 w-3.5" /> },
    { key: "error", label: "Errors", icon: <XCircle className="h-3.5 w-3.5" /> },
    { key: "warning", label: "Warnings", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
    { key: "success", label: "Passed", icon: <CheckCircle className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="flex gap-6">
      {/* Left sidebar nav */}
      <aside className="hidden w-56 shrink-0 xl:block">
        <div className="sticky top-20 space-y-1">
          <p className="mb-2 px-2 text-xs font-medium uppercase text-gray-400 dark:text-gray-500">
            Sections
          </p>
          {Object.entries(results).map(([name, result]) => (
            <button
              key={name}
              onClick={() => scrollTo(name)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  result.severity === "error" && "bg-red-500",
                  result.severity === "warning" && "bg-yellow-500",
                  result.severity === "success" && "bg-green-500",
                  result.severity === "info" && "bg-gray-500 dark:bg-gray-400"
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
          <StatCard icon={BarChart3} label="Pages Crawled" value={pagesCrawled} color="gray" />
          <StatCard icon={CheckCircle} label="Passed" value={passedChecks} color="green" />
          <StatCard icon={AlertTriangle} label="Warnings" value={warnings} color="yellow" />
          <StatCard icon={XCircle} label="Critical" value={criticalIssues} color="red" />
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
            {filterButtons.map((fb) => (
              <button
                key={fb.key}
                onClick={() => setFilter(fb.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  filter === fb.key
                    ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                )}
              >
                {fb.icon}
                {fb.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search issues..."
              className="w-full rounded-lg border py-1.5 pl-8 pr-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-white dark:focus:ring-white/20"
            />
          </div>

          {/* Export dropdown */}
          <div className="relative ml-auto">
            <button
              onClick={() => setExportOpen(!exportOpen)}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <Download className="h-4 w-4" />
              Export
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-lg border bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                {["html", "pdf", "docx"].map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => handleExport(fmt)}
                    className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    {fmt.toUpperCase()} Report
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Analyzer sections */}
        {analyzerEntries.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
            No results match your filter.
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
    gray: "bg-gray-100 text-gray-900 dark:bg-[#1a1a1a] dark:text-white",
    green: "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400",
    yellow: "bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400",
    red: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400",
  };

  return (
    <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-3">
        <div className={cn("rounded-lg p-2", colorClasses[color])}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        </div>
      </div>
    </div>
  );
}
