"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useSession } from "next-auth/react";
import { Globe, Play, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { ANALYZER_NAMES, ANALYZER_LABELS } from "@/types/audit";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

const REAL_ANALYZER_NAMES = ANALYZER_NAMES.filter((n) => n !== "speed_screenshots");

export default function NewAuditPage() {
  const t = useTranslations("audit");
  const tBreadcrumbs = useTranslations("breadcrumbs");
  const locale = useLocale();
  const router = useRouter();
  const { data: session } = useSession();

  const searchParams = useSearchParams();
  const [url, setUrl] = useState("");
  const [selectedAnalyzers, setSelectedAnalyzers] = useState<string[]>([...REAL_ANALYZER_NAMES]);
  const [showAnalyzers, setShowAnalyzers] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPagesCrawled, setShowPagesCrawled] = useState(false);

  // Custom page limit state
  const [maxPages, setMaxPages] = useState<number>(10); // Default to Free plan limit
  const [planLimit, setPlanLimit] = useState<number>(10); // User's plan max limit

  // Pre-fill URL from query param (coming from landing page hero)
  useEffect(() => {
    const prefillUrl = searchParams.get("url");
    if (prefillUrl) {
      setUrl(prefillUrl);
    }
  }, [searchParams]);

  // Fetch user's plan on mount
  useEffect(() => {
    async function fetchUserPlan() {
      try {
        const res = await fetch("/api/user/plan");
        if (res.ok) {
          const data = await res.json();
          const limit = data.plan.maxPages || 10;
          setPlanLimit(limit);
          setMaxPages(limit); // Set default to plan max
        }
      } catch (err) {
        console.error("Failed to fetch user plan:", err);
      }
    }
    fetchUserPlan();
  }, []);

  function toggleAnalyzer(name: string) {
    setSelectedAnalyzers((prev) =>
      prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]
    );
  }

  const realSelected = useMemo(
    () => selectedAnalyzers.filter((a) => a !== "speed_screenshots"),
    [selectedAnalyzers]
  );
  const includeScreenshots = selectedAnalyzers.includes("speed_screenshots");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/audit/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          language: "en",
          progressLanguage: locale,
          analyzers: realSelected.length === REAL_ANALYZER_NAMES.length ? null : realSelected,
          maxPages,
          includeScreenshots,
          showPagesCrawled,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("failedToStart"));
        return;
      }

      // Navigate to progress page
      router.push(`/dashboard/auditor/${data.id}?fastApiId=${data.fastApiId}`);
    } catch {
      setError(t("connectionError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-[50rem]">
      <Breadcrumbs items={[
        { label: tBreadcrumbs("dashboard"), href: "/dashboard" },
        { label: tBreadcrumbs("newAudit") },
      ]} />
      <h1 className="mb-6 text-2xl font-bold text-white">
        {t("newAudit")}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-xl border border-gray-800 bg-black p-6">
          {error && (
            <div className="mb-4 rounded-lg bg-red-900/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* URL input */}
          <div className="mb-5">
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              {t("enterUrl")}
            </label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                placeholder={t("urlPlaceholder")}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 py-2.5 pl-10 pr-3 text-base md:text-sm text-white outline-none placeholder-gray-500 transition-colors focus:border-copper focus:ring-2 focus:ring-copper/20"
              />
            </div>
          </div>

          {/* Max Pages Input */}
          <div className="mb-5">
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              {t("maxPages")}
              <span className="ml-1 text-xs text-gray-500">
                (1-{planLimit})
              </span>
            </label>
            <input
              type="number"
              min="1"
              max={planLimit}
              value={maxPages}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                if (value >= 1 && value <= planLimit) {
                  setMaxPages(value);
                }
              }}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-base md:text-sm text-white outline-none transition-colors focus:border-copper focus:ring-2 focus:ring-copper/20"
            />
            <p className="mt-1 text-xs text-gray-500">
              {t("maxPagesHint", { limit: planLimit })}
            </p>
          </div>

          {/* Analyzers */}
          <div>
            <button
              type="button"
              onClick={() => setShowAnalyzers(!showAnalyzers)}
              className="flex w-full items-center justify-between rounded-lg border border-gray-700 px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-900 transition-colors"
            >
              <span>
                {t("analyzers")} ({realSelected.length}/{REAL_ANALYZER_NAMES.length})
              </span>
              {showAnalyzers ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>

            {showAnalyzers && (
              <div className="mt-2 rounded-lg border border-gray-700 p-3">
                <div className="mb-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedAnalyzers((prev) => {
                        const extras = prev.filter((a) => !REAL_ANALYZER_NAMES.includes(a as typeof REAL_ANALYZER_NAMES[number]));
                        return [...REAL_ANALYZER_NAMES, ...extras];
                      })
                    }
                    className="text-xs text-gray-300 underline hover:text-white"
                  >
                    {t("selectAll")}
                  </button>
                  <span className="text-gray-600">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedAnalyzers([])}
                    className="text-xs text-gray-300 underline hover:text-white"
                  >
                    {t("deselectAll")}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {REAL_ANALYZER_NAMES.map((name) => (
                    <label
                      key={name}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={selectedAnalyzers.includes(name)}
                        onChange={() => toggleAnalyzer(name)}
                      />
                      <span className="text-gray-300">
                        {ANALYZER_LABELS[name]}
                      </span>
                    </label>
                  ))}
                </div>

                {/* PageSpeed Screenshots option */}
                <div className="mt-3 border-t border-gray-700 pt-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={includeScreenshots}
                      onChange={() => toggleAnalyzer("speed_screenshots")}
                    />
                    <span className="text-gray-300">
                      {ANALYZER_LABELS["speed_screenshots"]}
                    </span>
                    <span className="text-xs text-gray-500">
                      {t("screenshotsHint")}
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Show pages crawled option */}
          <div className="mt-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={showPagesCrawled}
                onChange={() => setShowPagesCrawled((prev) => !prev)}
              />
              <span className="text-gray-300">
                {t("showPagesCrawled")}
              </span>
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !url || realSelected.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-copper to-copper-light px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {loading ? t("startingAudit") : t("startAudit")}
        </button>
      </form>
    </div>
  );
}
