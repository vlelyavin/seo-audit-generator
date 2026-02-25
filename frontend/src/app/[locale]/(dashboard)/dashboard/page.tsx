"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import {
  Plus,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ExternalLink,
  Clock,
  Trash2,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { AuditSummary } from "@/types/audit";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ElapsedTime } from "@/components/ui/elapsed-time";

const IN_PROGRESS_STATUSES = ["pending", "crawling", "analyzing", "screenshots", "generating_report"];

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tAudit = useTranslations("audit");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { data: session } = useSession();
  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteAuditId, setDeleteAuditId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/audit/list");
        if (res.ok) {
          setAudits(await res.json());
        }
      } catch {
        /* ignore */
      }
      setLoading(false);
    }
    load();
  }, []);

  // Poll in-progress audits for status updates
  const auditsRef = useRef(audits);
  auditsRef.current = audits;

  const hasInProgress = audits.some((a) => IN_PROGRESS_STATUSES.includes(a.status));

  useEffect(() => {
    if (!hasInProgress) return;

    const interval = setInterval(async () => {
      const current = auditsRef.current;
      const inProgress = current.filter((a) => IN_PROGRESS_STATUSES.includes(a.status));
      if (inProgress.length === 0) return;

      const results = await Promise.allSettled(
        inProgress.map(async (audit) => {
          const res = await fetch(`/api/audit/${audit.id}/progress`);
          if (!res.ok) return null;
          const data = await res.json();
          return { id: audit.id, data };
        })
      );

      let anyTerminal = false;

      setAudits((prev) =>
        prev.map((audit) => {
          const result = results.find(
            (r) => r.status === "fulfilled" && r.value?.id === audit.id
          );
          if (!result || result.status !== "fulfilled" || !result.value?.data) return audit;

          const { data } = result.value;
          const wasInProgress = IN_PROGRESS_STATUSES.includes(audit.status);
          const isNowTerminal = data.status === "completed" || data.status === "failed";
          if (wasInProgress && isNowTerminal) anyTerminal = true;

          return {
            ...audit,
            status: data.status,
            pagesCrawled: data.pages_crawled ?? audit.pagesCrawled,
            errorMessage: data.status === "failed" ? (data.message || audit.errorMessage) : audit.errorMessage,
            completedAt: isNowTerminal ? (audit.completedAt || new Date().toISOString()) : audit.completedAt,
          };
        })
      );

      // Re-fetch full list data when an audit just completed (to get accurate stats)
      if (anyTerminal) {
        try {
          const res = await fetch("/api/audit/list");
          if (res.ok) setAudits(await res.json());
        } catch { /* ignore */ }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [hasInProgress]);

  async function handleDelete() {
    if (!deleteAuditId) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/audit/${deleteAuditId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        // Optimistic UI update
        setAudits((prev) => prev.filter((a) => a.id !== deleteAuditId));
        setDeleteAuditId(null);
      }
    } catch {
      /* ignore */
    } finally {
      setIsDeleting(false);
    }
  }

  // Aggregate stats from completed audits
  const completedAudits = audits.filter((a) => a.status === "completed");
  const totalPages = completedAudits.reduce((s, a) => s + a.pagesCrawled, 0);
  const totalPassed = completedAudits.reduce((s, a) => s + a.passedChecks, 0);
  const totalWarnings = completedAudits.reduce((s, a) => s + a.warnings, 0);
  const totalCritical = completedAudits.reduce((s, a) => s + a.criticalIssues, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {t("title")}
          </h1>
          {session?.user && (
            <p className="mt-1 text-sm text-gray-400">
              {t("welcome")}, {session.user.name || session.user.email}
            </p>
          )}
        </div>
        <Link
          href={`/${locale}/dashboard/audit/new`}
          className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-md bg-gradient-to-r from-copper to-copper-light px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          {t("startAudit")}
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={BarChart3} label={tAudit("pagesCrawled")} value={totalPages} color="gray" />
        <StatCard icon={CheckCircle} label={tAudit("passedChecks")} value={totalPassed} color="green" />
        <StatCard icon={AlertTriangle} label={tAudit("warnings")} value={totalWarnings} color="yellow" />
        <StatCard icon={XCircle} label={tAudit("criticalIssues")} value={totalCritical} color="red" />
      </div>

      {/* Recent audits */}
      <div className="rounded-xl border border-gray-800 bg-black">
        <div className="border-b border-gray-800 p-4">
          <h2 className="text-lg font-semibold text-white">
            {t("recentAudits")}
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
          </div>
        ) : audits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="mb-3 h-10 w-10 text-gray-600" />
            <p className="text-sm text-gray-400">
              {t("noAudits")}
            </p>
            <Link
              href={`/${locale}/dashboard/audit/new`}
              className="mt-4 rounded-md bg-gradient-to-r from-copper to-copper-light px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              {t("startAudit")}
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {audits.map((audit) => (
              <div
                key={audit.id}
                className="group relative flex items-center gap-2 px-3 py-2 sm:gap-4 sm:px-4 sm:py-3 hover:bg-gray-900/50 transition-colors"
              >
                <Link
                  href={`/${locale}/dashboard/audit/${audit.id}`}
                  className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4"
                >
                  <StatusDot status={audit.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-white sm:text-sm">
                      {audit.url}
                    </p>
                    <div className="mt-0.5 text-[11px] text-gray-400 sm:text-xs">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          {formatDate(audit.startedAt, locale)}
                        </span>
                        {audit.status === "completed" && (
                          <span>
                            {audit.pagesCrawled} {t("page", { count: audit.pagesCrawled })}
                          </span>
                        )}
                        {audit.status === "completed" && (
                          <div className="hidden items-center gap-3 sm:flex">
                            {audit.criticalIssues > 0 && (
                              <span className="text-red-500">
                                {audit.criticalIssues} {t("criticalLabel")}
                              </span>
                            )}
                            {audit.warnings > 0 && (
                              <span className="text-yellow-500">
                                {audit.warnings} {t("warningsLabel")}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {audit.status === "completed" && (
                        <div className="mt-1 flex flex-wrap items-center gap-3 sm:hidden">
                          {audit.criticalIssues > 0 && (
                            <span className="text-red-500">
                              {audit.criticalIssues} {t("criticalLabel")}
                            </span>
                          )}
                          {audit.warnings > 0 && (
                            <span className="text-yellow-500">
                              {audit.warnings} {t("warningsLabel")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {audit.status === "failed" && audit.errorMessage && (
                      <div className="mt-1">
                        <span className="text-xs text-red-400">
                          {audit.errorMessage}
                        </span>
                      </div>
                    )}
                  </div>
                  <ElapsedTime
                    startedAt={audit.startedAt}
                    stoppedAt={
                      audit.status === "completed" || audit.status === "failed"
                        ? audit.completedAt || null
                        : null
                    }
                  />
                  <ExternalLink className="h-3 w-3 shrink-0 text-gray-400 sm:h-4 sm:w-4" />
                </Link>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteAuditId(audit.id);
                  }}
                  className="shrink-0 rounded-md p-2 text-gray-400 opacity-100 sm:opacity-0 transition-opacity hover:bg-red-900/20 hover:text-red-400 sm:group-hover:opacity-100"
                  title={t("deleteAudit")}
                >
                  <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteAuditId !== null}
        onClose={() => setDeleteAuditId(null)}
        onConfirm={handleDelete}
        title={t("deleteAudit")}
        message={t("confirmDeleteMessage")}
        confirmText={isDeleting ? t("deleting") : tCommon("delete")}
        cancelText={tCommon("cancel")}
        loading={isDeleting}
      />
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn("h-2.5 w-2.5 shrink-0 rounded-full", {
        "bg-green-500": status === "completed",
        "bg-red-500": status === "failed",
        "bg-yellow-500 animate-pulse": status === "crawling" || status === "analyzing",
        "bg-gray-400": status === "pending" || status === "generating_report",
      })}
    />
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
    gray: "bg-gray-900 text-white",
    green: "bg-green-900/35 text-green-400",
    yellow: "bg-yellow-900/35 text-yellow-400",
    red: "bg-red-900/35 text-red-400",
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-black p-4">
      <div className="flex items-center gap-3">
        <div className={cn("rounded-lg p-2", colorClasses[color])}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-white">
            {value}
          </p>
          <p className="text-[11px] leading-tight whitespace-nowrap text-gray-400 sm:text-xs">{label}</p>
        </div>
      </div>
    </div>
  );
}
