"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useAuditProgress } from "@/hooks/use-audit-progress";
import { AuditProgressView } from "@/components/audit/audit-progress";
import { AuditResultsView } from "@/components/audit/audit-results";
import type { AuditResults } from "@/types/audit";

export default function AuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const searchParams = useSearchParams();
  const locale = useLocale();

  const [auditId, setAuditId] = useState<string>("");
  const [fastApiId, setFastApiId] = useState<string | null>(null);
  const [results, setResults] = useState<AuditResults | null>(null);
  const [auditMeta, setAuditMeta] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then(({ id }) => {
      setAuditId(id);
      setFastApiId(searchParams.get("fastApiId"));
    });
  }, [params, searchParams]);

  const { progress, done } = useAuditProgress(fastApiId);

  // When audit completes, fetch results
  useEffect(() => {
    if (!done || !auditId) return;
    if (progress?.status === "failed") {
      setLoading(false);
      return;
    }

    async function fetchResults() {
      try {
        const res = await fetch(`/api/audit/${auditId}/results?lang=${locale}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results);
          setAuditMeta(data);
        }
      } catch {
        // ignore
      }
      setLoading(false);
    }

    fetchResults();
  }, [done, auditId, locale, progress?.status]);

  // Also try to load cached results on mount (for revisiting completed audits)
  useEffect(() => {
    if (!auditId || fastApiId) return; // don't fetch if we're tracking live progress

    async function loadCached() {
      try {
        const res = await fetch(`/api/audit/${auditId}/results?lang=${locale}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results);
          setAuditMeta(data);
        }
      } catch {
        // ignore
      }
      setLoading(false);
    }

    loadCached();
  }, [auditId, locale, fastApiId]);

  // Still in progress
  if (fastApiId && !done) {
    return <AuditProgressView progress={progress} />;
  }

  // Failed
  if (progress?.status === "failed") {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <div className="mb-4 text-5xl">&#10060;</div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          Audit Failed
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {progress.message}
        </p>
      </div>
    );
  }

  // Results loaded
  if (results && auditMeta) {
    return (
      <AuditResultsView
        results={results}
        meta={auditMeta}
        auditId={auditId}
      />
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white dark:border-white border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="py-12 text-center text-gray-500 dark:text-gray-400">
      No results available.
    </div>
  );
}
