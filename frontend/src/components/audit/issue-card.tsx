"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AuditIssue } from "@/types/audit";
import { SEVERITY_COLORS } from "@/types/audit";

interface IssueCardProps {
  issue: AuditIssue;
}

export function IssueCard({ issue }: IssueCardProps) {
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations("audit");
  const colors = SEVERITY_COLORS[issue.severity];
  const hasDetails = issue.details || issue.affected_urls.length > 0 || issue.recommendation;

  return (
    <div className={cn("rounded-lg border", colors.border)}>
      <button
        onClick={() => hasDetails && setExpanded(!expanded)}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
          hasDetails && "cursor-pointer hover:bg-gray-900/50"
        )}
      >
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", {
          "bg-red-500": issue.severity === "error",
          "bg-yellow-500": issue.severity === "warning",
          "bg-green-500": issue.severity === "success",
          "bg-gray-500": issue.severity === "info",
        })} />
        <span className="flex-1 text-gray-200">
          {issue.message}
        </span>
        {issue.count > 1 && (
          <span className="shrink-0 rounded-full border border-gray-700 bg-gray-900 px-1.5 py-0.5 text-xs text-gray-400">
            {issue.count}
          </span>
        )}
        {hasDetails && (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          )
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-700 px-3 py-2">
          {issue.details && (
            <p className="mb-2 text-xs text-gray-400">
              {issue.details}
            </p>
          )}

          {issue.recommendation && (
            <div className="mb-2 rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-200">
              <span className="font-medium">{t("recommendation")} </span>
              {issue.recommendation}
            </div>
          )}

          {issue.affected_urls.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-400">
                {t("affectedUrls", { count: issue.affected_urls.length })}
              </p>
              <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                {issue.affected_urls.map((url, i) => (
                  <li key={i} className="flex items-center gap-1 text-xs">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-gray-300 underline hover:text-copper"
                    >
                      {url}
                    </a>
                    <ExternalLink className="h-3 w-3 shrink-0 text-gray-400" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
