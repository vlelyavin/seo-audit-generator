"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { useAuditProgress } from "@/hooks/use-audit-progress";
import { AuditProgressView } from "@/components/audit/audit-progress";
import { AuditResultsView } from "@/components/audit/audit-results";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import type { AuditResults } from "@/types/audit";

export default function AuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = useLocale();
  const prevLocaleRef = useRef(locale);

  const [auditId, setAuditId] = useState<string>("");
  const [fastApiId, setFastApiId] = useState<string | null>(null);
  const [results, setResults] = useState<AuditResults | null>(null);
  const [auditMeta, setAuditMeta] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [auditUrl, setAuditUrl] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ id }) => {
      setAuditId(id);
      setFastApiId(searchParams.get("fastApiId"));
    });
  }, [params, searchParams]);

  const { progress, connected, done, error, isStalled } = useAuditProgress(fastApiId, auditId);
  const tAudit = useTranslations("audit");
  const tBreadcrumbs = useTranslations("breadcrumbs");

  // Check if audit is in progress when opening without fastApiId
  useEffect(() => {
    if (!auditId || fastApiId) return;

    let isMounted = true;

    async function checkAuditStatus() {
      try {
        const res = await fetch(`/api/audit/${auditId}`);
        if (!res.ok || !isMounted) return;

        const audit = await res.json();
        console.log('[Audit] Status check:', { status: audit.status, fastApiId: audit.fastApiId, startedAt: audit.startedAt });
        if (audit.url) setAuditUrl(audit.url);

        // Determine if audit is in progress
        const isInProgress = ['crawling', 'analyzing', 'generating_report', 'screenshots'].includes(audit.status);

        // Check if audit is stale (started >15 min ago, still shows in-progress)
        const auditAge = Date.now() - new Date(audit.startedAt).getTime();
        const STALE_THRESHOLD = 15 * 60 * 1000; // 15 minutes

        // If audit shows in-progress but started >15 min ago, verify with FastAPI
        if (isInProgress && auditAge > STALE_THRESHOLD && audit.fastApiId) {
          console.log('[Audit] Audit appears stale, verifying status...');
          try {
            // This will trigger progress endpoint to update DB if needed
            const progressRes = await fetch(`/api/audit/${auditId}/progress`);
            if (progressRes.ok) {
              const fastapiStatus = await progressRes.json();

              // If FastAPI shows terminal state, reload to get updated DB status
              if (fastapiStatus.status === "completed" || fastapiStatus.status === "failed") {
                console.log('[Audit] Status updated to', fastapiStatus.status);
                window.location.reload();
                return;
              }
            }
          } catch (error) {
            console.error('[Audit] Failed to verify stale audit:', error);
            // Continue with normal flow - don't block user
          }
        }

        if (audit.fastApiId && isInProgress) {
          // Audit is in progress - add fastApiId to URL
          console.log('[Audit] Redirecting to progress view');
          router.push(`/${locale}/dashboard/audit/${auditId}?fastApiId=${audit.fastApiId}`);
        } else if (audit.status === 'completed') {
          // Audit completed - load cached results (handled by loadCached effect)
          setLoading(true);
        } else if (audit.status === 'failed') {
          setPageError(audit.errorMessage || tAudit("failed"));
          setLoading(false);
        } else if (!audit.fastApiId) {
          // No fastApiId means audit was never started or cleaned up
          setPageError(tAudit("failed"));
          setLoading(false);
        }
      } catch (err) {
        console.error('[Audit] Status check failed:', err);
        setPageError(tAudit("error"));
        setLoading(false);
      }
    }

    checkAuditStatus();

    return () => {
      isMounted = false;
    };
  }, [auditId, fastApiId, locale, router, tAudit]);

  // Handle locale changes during active audit
  useEffect(() => {
    if (prevLocaleRef.current !== locale && fastApiId && !done) {
      // Language changed during active audit - show brief loading state
      setLoading(true);
      const timer = setTimeout(() => setLoading(false), 300);
      return () => clearTimeout(timer);
    }
    prevLocaleRef.current = locale;
  }, [locale, fastApiId, done]);

  // When audit completes, fetch results
  useEffect(() => {
    if (!done || !auditId) return;
    if (progress?.status === "failed") {
      setLoading(false);
      return;
    }

    setLoading(true);
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    async function fetchResults() {
      try {
        const res = await fetch(`/api/audit/${auditId}/results?lang=${locale}`);

        if (res.status === 202) {
          // Audit still finalizing in FastAPI — retry after delay
          if (!cancelled) {
            retryTimer = setTimeout(fetchResults, 1500);
          }
          return;
        }

        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setResults(data.results);
            setAuditMeta(data);
            if (data.url) setAuditUrl(data.url);
          }
        }
      } catch (err) {
        console.error('[Audit] Failed to fetch results:', err);
      }
      if (!cancelled) {
        setLoading(false);
      }
    }

    fetchResults();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [done, auditId, locale, progress?.status]);

  // Also try to load cached results on mount (for revisiting completed audits)
  useEffect(() => {
    if (!auditId) return;

    // Skip loading cached results if tracking live progress via fastApiId
    if (fastApiId) {
      setLoading(false); // Still set loading to false to prevent infinite loader
      return;
    }

    async function loadCached() {
      try {
        const res = await fetch(`/api/audit/${auditId}/results?lang=${locale}`);

        // If 202 status, audit still in progress - don't load
        if (res.status === 202) {
          setLoading(false);
          return;
        }

        if (res.ok) {
          const data = await res.json();
          setResults(data.results);
          setAuditMeta(data);
          if (data.url) setAuditUrl(data.url);
        }
      } catch (err) {
        console.error('[Audit] Failed to load cached results:', err);
      }
      setLoading(false);
    }

    loadCached();
  }, [auditId, locale, fastApiId]);

  const displayUrl = auditUrl
    ? auditUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "")
    : "";
  const breadcrumbLabel = displayUrl
    ? `${tBreadcrumbs("audit")} ${displayUrl}`
    : tBreadcrumbs("audit");

  const breadcrumbItems = [
    { label: tBreadcrumbs("dashboard"), href: `/${locale}/dashboard` },
    { label: breadcrumbLabel },
  ];

  // Still in progress - show progress if we have fastApiId and audit is not done yet
  if (fastApiId && !done) {
    return (
      <div>
        <Breadcrumbs items={breadcrumbItems} />
        <h1 className="mb-6 text-2xl font-bold text-white">{breadcrumbLabel}</h1>
        {error && (
          <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-yellow-500">{error}</p>
          </div>
        )}
        {isStalled && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-500">
              {tAudit("connectionLost")}
              <button
                onClick={() => window.location.reload()}
                className="ml-2 underline hover:text-red-600"
              >
                {tAudit("refreshToReconnect")}
              </button>
            </p>
          </div>
        )}
        <AuditProgressView progress={progress} />
      </div>
    );
  }

  // Failed
  if (progress?.status === "failed") {
    return (
      <div className="mx-auto max-w-[50rem] py-12 text-center">
        <div className="mb-4 text-5xl">&#10060;</div>
        <h1 className="text-xl font-bold text-white">
          {tAudit("failed")}
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          {progress.message}
        </p>
      </div>
    );
  }

  // Results loaded
  if (results && auditMeta) {
    return (
      <div>
        <Breadcrumbs items={breadcrumbItems} />
        <h1 className="mb-6 text-2xl font-bold text-white">{breadcrumbLabel}</h1>
        <AuditResultsView
          results={results}
          meta={auditMeta}
          auditId={auditId}
        />
      </div>
    );
  }

  // Page error
  if (pageError) {
    return (
      <div className="mx-auto max-w-[50rem] py-12 text-center">
        <div className="mb-4 text-5xl">&#10060;</div>
        <h1 className="text-xl font-bold text-white">
          {tAudit("error")}
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          {pageError}
        </p>
        <Link
          href={`/${locale}/dashboard`}
          className="mt-4 inline-block text-gray-400 hover:text-white transition-colors"
        >
          {tAudit("backToDashboard")}
        </Link>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent" />
        <p className="text-sm text-gray-400">{tAudit("loadingAudit")}</p>
      </div>
    );
  }

  return (
    <div className="py-12 text-center text-gray-400">
      {tAudit("noResults")}
    </div>
  );
}
