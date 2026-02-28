"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  Plus,
  FileSearch,
  Trash2,
  ExternalLink,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  BarChart3,
  Globe,
  FileWarning,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import type { AuditSummary } from "@/types/audit";

export default function AuditorListPage() {
  const t = useTranslations("dashboard");
  const tBreadcrumbs = useTranslations("breadcrumbs");
  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAudits = useCallback(async () => {
    try {
      const res = await fetch("/api/audit/list?take=50");
      if (res.ok) {
        setAudits(await res.json());
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAudits();
  }, [fetchAudits]);

  const handleDelete = async (id: string) => {
    if (!confirm(t("confirmDeleteMessage"))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/audit/${id}`, { method: "DELETE" });
      if (res.ok) {
        setAudits((prev) => prev.filter((a) => a.id !== id));
      }
    } catch {
      /* ignore */
    } finally {
      setDeletingId(null);
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-400" />;
      case "failed":
        return <XCircle className="h-6 w-6 shrink-0 text-red-400" />;
      case "pending":
        return <Clock className="h-6 w-6 shrink-0 text-gray-400" />;
      default:
        return <Loader2 className="h-6 w-6 shrink-0 animate-spin text-copper" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "completed":
        return "Completed";
      case "failed":
        return "Failed";
      case "pending":
        return "Pending";
      case "crawling":
        return "Crawling";
      case "analyzing":
        return "Analyzing";
      case "screenshots":
        return "Screenshots";
      case "generating_report":
        return "Generating report";
      default:
        return status;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const shortenUrl = (url: string) => {
    try {
      const u = new URL(url);
      return u.hostname + (u.pathname !== "/" ? u.pathname : "");
    } catch {
      return url;
    }
  };

  const stats = useMemo(() => {
    const completed = audits.filter((a) => a.status === "completed");
    return {
      totalAudits: audits.length,
      totalPages: completed.reduce((sum, a) => sum + a.pagesCrawled, 0),
      totalErrors: completed.reduce((sum, a) => sum + a.criticalIssues, 0),
      totalWarnings: completed.reduce((sum, a) => sum + a.warnings, 0),
    };
  }, [audits]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <Breadcrumbs
            items={[
              { label: tBreadcrumbs("dashboard"), href: "/app" },
              { label: "Auditor" },
            ]}
          />
          <h1 className="text-2xl font-bold text-white">{t("recentAudits")}</h1>
        </div>
        <Link
          href="/app/auditor/new"
          className="hidden md:flex items-center gap-2 rounded-md bg-gradient-to-r from-copper to-copper-light px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          {t("startAudit")}
        </Link>
      </div>

      {/* General stats */}
      {audits.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
            <div className="flex items-center gap-2 text-gray-400 mb-1">
              <BarChart3 className="h-4 w-4" />
              <span className="text-xs">Total Audits</span>
            </div>
            <p className="text-xl font-bold text-white">{stats.totalAudits}</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
            <div className="flex items-center gap-2 text-gray-400 mb-1">
              <Globe className="h-4 w-4" />
              <span className="text-xs">Pages Crawled</span>
            </div>
            <p className="text-xl font-bold text-white">{stats.totalPages}</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
            <div className="flex items-center gap-2 text-red-400 mb-1">
              <AlertCircle className="h-4 w-4" />
              <span className="text-xs">Errors</span>
            </div>
            <p className="text-xl font-bold text-white">{stats.totalErrors}</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
            <div className="flex items-center gap-2 text-yellow-400 mb-1">
              <FileWarning className="h-4 w-4" />
              <span className="text-xs">Warnings</span>
            </div>
            <p className="text-xl font-bold text-white">{stats.totalWarnings}</p>
          </div>
        </div>
      )}

      {audits.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-12 text-center">
          <FileSearch className="mx-auto mb-4 h-12 w-12 text-gray-600" />
          <p className="text-sm text-gray-400">{t("noAudits")}</p>
          <Link
            href="/app/auditor/new"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-copper to-copper-light px-6 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            {t("startAudit")}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {audits.map((audit) => (
            <div
              key={audit.id}
              className="group rounded-xl border border-gray-800 bg-gray-950 p-3 md:p-4 transition-colors hover:border-gray-700"
            >
              <div className="flex items-center justify-between gap-4">
                <Link
                  href={`/app/auditor/${audit.id}`}
                  className="min-w-0 flex-1"
                >
                  <div className="flex items-center gap-2 md:gap-3">
                    {statusIcon(audit.status)}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {shortenUrl(audit.url)}
                      </p>
                      <div className="mt-1 flex items-center gap-x-3 text-xs text-gray-500 whitespace-nowrap">
                        <span>{formatDate(audit.startedAt)}</span>
                        {audit.status === "completed" && (
                          <>
                            <span>·</span>
                            <span>{audit.pagesCrawled} pages total</span>
                          </>
                        )}
                      </div>
                      {audit.status === "completed" && (audit.criticalIssues > 0 || audit.warnings > 0) && (
                        <div className="mt-1 flex items-center gap-x-3">
                          {audit.criticalIssues > 0 && (
                            <span className="flex items-center gap-1 text-xs font-medium text-red-400">
                              <AlertCircle className="h-3 w-3" />
                              {audit.criticalIssues} {t("criticalLabel")}
                            </span>
                          )}
                          {audit.warnings > 0 && (
                            <span className="flex items-center gap-1 text-xs font-medium text-yellow-400">
                              <AlertTriangle className="h-3 w-3" />
                              {audit.warnings} {t("warningsLabel")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>

                <div className="flex shrink-0 items-center gap-0">
                  {audit.status === "completed" && (
                    <Link
                      href={`/app/auditor/${audit.id}`}
                      className="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-900 hover:text-white"
                      title="View results"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  )}
                  <button
                    onClick={() => handleDelete(audit.id)}
                    disabled={deletingId === audit.id}
                    className={cn(
                      "rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-900 hover:text-red-400",
                      deletingId === audit.id && "opacity-50"
                    )}
                    title={t("deleteAudit")}
                  >
                    {deletingId === audit.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating "Start new audit" button — mobile only */}
      <Link
        href="/app/auditor/new"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-copper to-copper-light px-5 py-2 text-sm font-semibold text-white shadow-lg transition-opacity hover:opacity-90 md:hidden"
      >
        <Plus className="h-4 w-4" />
        {t("startAudit")}
      </Link>
    </div>
  );
}
