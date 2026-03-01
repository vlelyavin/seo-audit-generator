"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useSession } from "next-auth/react";
import { Rocket, ChevronDown, ChevronUp, Loader2, Globe } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { ANALYZER_NAMES, ANALYZER_LABELS } from "@/types/audit";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { toast } from "sonner";

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
  const [showPagesCrawled, setShowPagesCrawled] = useState(false);
  const [includeCompanyLogo, setIncludeCompanyLogo] = useState(false);

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

  function normalizeUrl(raw: string): string {
    const trimmed = raw.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/audit/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: normalizeUrl(url),
          language: "en",
          progressLanguage: locale,
          analyzers: realSelected.length === REAL_ANALYZER_NAMES.length ? null : realSelected,
          maxPages,
          includeScreenshots,
          showPagesCrawled,
          includeCompanyLogo,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || t("failedToStart"));
        return;
      }

      // Navigate to progress page
      router.push(`/app/auditor/${data.id}?fastApiId=${data.fastApiId}`);
    } catch {
      toast.error(t("connectionError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Breadcrumbs items={[
        { label: tBreadcrumbs("dashboard"), href: "/app" },
        { label: tBreadcrumbs("newAudit") },
      ]} />
      <h1 className="mb-4 md:mb-6 text-2xl font-bold text-white">
        {t("newAudit")}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-6">
          {/* URL + Max Pages — same line on desktop, stacked on mobile */}
          <div className="mb-5 flex flex-col md:flex-row gap-4">
            <div className="w-full md:w-[70%]">
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                {t("enterUrl")}
              </label>
              <div className="relative">
                <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  placeholder="https://example.com"
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 py-2.5 pl-9 pr-3 text-base md:text-sm text-white outline-none placeholder-gray-500 transition-colors focus:border-copper focus:ring-2 focus:ring-copper/20"
                />
              </div>
            </div>

            <div className="w-full md:w-[30%]">
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
            </div>
          </div>

          {/* Analyzers */}
          <div className="rounded-lg border border-gray-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAnalyzers(!showAnalyzers)}
              className="flex w-full items-center justify-between bg-gray-900 px-3 py-2.5 text-sm text-gray-300 transition-colors"
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
              <div className="border-t border-gray-700 bg-gray-900 p-3">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
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
              </div>
            )}
          </div>

          {/* Toggles */}
          <div className="mt-4 space-y-3">
            {/* 1. PageSpeed Screenshots */}
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

            {/* 2. Show scanned pages count */}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={showPagesCrawled}
                onChange={() => setShowPagesCrawled((prev) => !prev)}
              />
              <span className="text-gray-300">
                {t("showPagesCrawled")}
              </span>
            </label>

            {/* 3. Include company logo */}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={includeCompanyLogo}
                onChange={() => setIncludeCompanyLogo((prev) => !prev)}
              />
              <span className="text-gray-300">
                {t.rich("includeCompanyLogo", {
                  hint: (chunks) => (
                    <span className="text-xs text-gray-500">{chunks}</span>
                  ),
                  link: (chunks) => (
                    <Link
                      href="/app/settings?tab=branding"
                      className="text-gray-500 hover:text-copper transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
            </label>
          </div>

          <div className="mt-5">
            <button
              type="submit"
              disabled={loading || !url || realSelected.length === 0}
              className="flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-copper to-copper-light py-3 px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {loading ? t("startingAudit") : t("startAudit")}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
