"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Info,
  BookOpen,
} from "lucide-react";
import { useTranslations } from "next-intl";
import DOMPurify from "isomorphic-dompurify";
import { IssueCard } from "./issue-card";
import { AnalyzerTable } from "./analyzer-table";
import { cn } from "@/lib/utils";
import type { AnalyzerResult, SeverityLevel } from "@/types/audit";
import { SEVERITY_COLORS } from "@/types/audit";

interface AnalyzerSectionProps {
  result: AnalyzerResult;
}

const severityIcons: Record<SeverityLevel, React.ComponentType<{ className?: string }>> = {
  error: XCircle,
  warning: AlertTriangle,
  success: CheckCircle,
  info: Info,
};

export function AnalyzerSection({ result }: AnalyzerSectionProps) {
  const [expanded, setExpanded] = useState(
    result.severity === "error" || result.severity === "warning"
  );
  const [showTheory, setShowTheory] = useState(false);
  const t = useTranslations("audit");

  const SevIcon = severityIcons[result.severity];
  const colors = SEVERITY_COLORS[result.severity];
  const issueCount = result.issues.reduce((sum, i) => sum + i.count, 0);

  return (
    <div className={cn("rounded-xl border", colors.border, "overflow-hidden")}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
          colors.bg,
          "hover:opacity-90"
        )}
      >
        <SevIcon className={cn("h-5 w-5 shrink-0", colors.text)} />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {result.display_name}
          </h3>
          {result.summary && (
            <p className="mt-0.5 truncate text-xs text-gray-600 dark:text-gray-400">
              {result.summary}
            </p>
          )}
        </div>
        {issueCount > 0 && (
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", colors.bg, colors.text)}>
            {issueCount}
          </span>
        )}
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="border-t border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          {/* Description */}
          {result.description && (
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
              {result.description}
            </p>
          )}

          {/* Theory toggle */}
          {result.theory && (
            <div className="mb-4">
              <button
                onClick={() => setShowTheory(!showTheory)}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-900 underline dark:text-white"
              >
                <BookOpen className="h-3.5 w-3.5" />
                {showTheory ? t("hideTheory") : t("showTheory")}
              </button>
              {showTheory && (
                <div
                  className="mt-2 whitespace-pre-line rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(result.theory) }}
                />
              )}
            </div>
          )}

          {/* Issues */}
          {result.issues.length > 0 && (
            <div className="space-y-2">
              {result.issues.map((issue, idx) => (
                <IssueCard key={idx} issue={issue} />
              ))}
            </div>
          )}

          {/* No issues */}
          {result.issues.length === 0 && result.severity === "success" && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/10 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              {t("noIssuesFound")}
            </div>
          )}

          {/* Tables */}
          {result.tables.length > 0 && (
            <div className="mt-4 space-y-4">
              {result.tables.map((table, idx) => (
                <AnalyzerTable key={idx} table={table} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
