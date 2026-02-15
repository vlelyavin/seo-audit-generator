"use client";

import { Loader2, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ProgressEvent } from "@/types/audit";

interface AuditProgressViewProps {
  progress: ProgressEvent | null;
}

export function AuditProgressView({ progress }: AuditProgressViewProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("audit");
  const pct = progress?.progress || 0;
  const stage = progress?.stage || "crawling";
  const pagesCrawled = progress?.pages_crawled || 0;

  function getProgressMessage(): string {
    if (!progress) return t("progressConnecting");
    switch (progress.stage) {
      case "crawling":
        return progress.pages_crawled
          ? t("progressCrawling", { count: progress.pages_crawled })
          : t("progressCrawlingStart");
      case "analyzing":
        return progress.analyzer_name
          ? t("progressAnalyzingName", { name: progress.analyzer_name })
          : t("progressAnalyzing");
      case "generating_report":
        return t("progressGeneratingReport");
      default:
        return t("progressConnecting");
    }
  }

  const stages = [
    { key: "crawling", label: t("stageCrawling") },
    { key: "analyzing", label: t("stageAnalyzing") },
    { key: "report", label: t("stageGeneratingReport") },
  ];

  return (
    <div className="mx-auto max-w-xl py-6 sm:py-16">
      <button
        onClick={() => router.push(`/${locale}/dashboard`)}
        className="mb-4 flex items-center gap-2 text-sm text-gray-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("backToDashboard")}
      </button>
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-8">
        <div className="mb-6 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-white" />
        </div>

        <h2 className="mb-2 text-center text-lg font-semibold text-white">
          {t("auditInProgress")}
        </h2>

        <p className="mb-6 text-center text-sm text-gray-400">
          {getProgressMessage()}
        </p>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="mb-1.5 flex items-center justify-between text-xs text-gray-400">
            <span>{Math.round(pct)}%</span>
            {pagesCrawled > 0 && <span>{t("pages", { count: pagesCrawled })}</span>}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
            <div
              className="h-full rounded-full bg-white transition-all duration-500"
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
              <div key={s.key} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                    isPast
                      ? "bg-green-900/30 text-green-400"
                      : isActive
                        ? "bg-gray-800 text-white"
                        : "bg-gray-800 text-gray-400"
                  }`}
                >
                  {isPast ? "\u2713" : i + 1}
                </div>
                <span
                  className={`whitespace-nowrap text-xs ${
                    isActive
                      ? "font-medium text-white"
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
          <div className="mt-4 overflow-hidden text-ellipsis whitespace-nowrap rounded-lg bg-gray-800 px-3 py-2 text-xs text-gray-400">
            {progress.current_url}
          </div>
        )}
      </div>
    </div>
  );
}
