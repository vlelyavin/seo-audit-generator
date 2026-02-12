"use client";

import { Loader2 } from "lucide-react";
import type { ProgressEvent } from "@/types/audit";

interface AuditProgressViewProps {
  progress: ProgressEvent | null;
}

export function AuditProgressView({ progress }: AuditProgressViewProps) {
  const pct = progress?.progress || 0;
  const message = progress?.message || "Connecting...";
  const stage = progress?.stage || "crawling";
  const pagesCrawled = progress?.pages_crawled || 0;

  const stages = [
    { key: "crawling", label: "Crawling" },
    { key: "analyzing", label: "Analyzing" },
    { key: "report", label: "Generating Report" },
  ];

  return (
    <div className="mx-auto max-w-xl py-16">
      <div className="rounded-xl border bg-white p-8 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-6 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-gray-900 dark:text-white" />
        </div>

        <h2 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-white">
          Audit in Progress
        </h2>

        <p className="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {message}
        </p>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{Math.round(pct)}%</span>
            {pagesCrawled > 0 && <span>{pagesCrawled} pages</span>}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-gray-900 dark:bg-white transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Stage indicators */}
        <div className="flex items-center justify-between">
          {stages.map((s, i) => {
            const isActive = s.key === stage;
            const isPast = stages.findIndex((x) => x.key === stage) > i;
            return (
              <div key={s.key} className="flex w-24 flex-col items-center gap-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                    isPast
                      ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                      : isActive
                        ? "bg-gray-100 text-gray-900 dark:bg-[#1a1a1a] dark:text-white"
                        : "bg-gray-100 text-gray-400 dark:bg-gray-800"
                  }`}
                >
                  {isPast ? "\u2713" : i + 1}
                </div>
                <span
                  className={`whitespace-nowrap text-xs ${
                    isActive
                      ? "font-medium text-gray-900 dark:text-white"
                      : "text-gray-400"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Current URL */}
        {progress?.current_url && (
          <div className="mt-4 overflow-hidden text-ellipsis whitespace-nowrap rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            {progress.current_url}
          </div>
        )}
      </div>
    </div>
  );
}
