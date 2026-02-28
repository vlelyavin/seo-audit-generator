"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPlanCapabilities } from "@/lib/plan-capabilities";
import type { IndexatorUsage, AuditorUsage } from "@/hooks/use-plan-usage";

const MAX_PAGES: Record<string, number> = {
  free: 20,
  pro: 200,
  agency: 1000,
};

function ProgressBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  return (
    <div className="h-1.5 rounded-full bg-gray-800">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          pct > 95 ? "bg-red-500" : pct > 80 ? "bg-yellow-500" : "bg-copper"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

interface PlanBlockProps {
  planId: string;
  context: "auditor" | "indexator" | "other";
  indexatorUsage: IndexatorUsage | null;
  auditorUsage: AuditorUsage | null;
  onNavigate?: () => void;
}

export function PlanBlock({
  planId,
  context,
  indexatorUsage,
  auditorUsage,
  onNavigate,
}: PlanBlockProps) {
  const tPlans = useTranslations("plans");
  const tNav = useTranslations("nav");
  const isFree = planId === "free";
  const capabilities = getPlanCapabilities(planId);
  const maxPages = MAX_PAGES[planId] ?? 20;

  return (
    <div className="border-t border-gray-800 p-3">
      <div className="rounded-lg bg-gray-950 p-3">
        {/* Plan header */}
        <div className="flex items-center gap-1.5 mb-2">
          <Zap className="h-3.5 w-3.5 text-copper" />
          <span className="text-sm font-semibold text-copper">
            {tPlans(planId as "free" | "pro" | "agency")}
          </span>
        </div>

        {/* Contextual metrics */}
        {context === "auditor" && auditorUsage && (
          <p className="text-xs text-gray-400 mb-3">
            {tNav("auditsToday", { count: auditorUsage.auditsToday })} · {tNav("pagesPerAudit", { count: maxPages })}
          </p>
        )}

        {context === "indexator" && indexatorUsage && (
          <div className="space-y-2.5 mb-3">
            {/* Sites */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-400">{tNav("sites")}</span>
                <span className="text-gray-300">
                  {indexatorUsage.siteCount}/{capabilities.maxSites}
                </span>
              </div>
              <ProgressBar
                used={indexatorUsage.siteCount}
                limit={capabilities.maxSites}
              />
            </div>

            {/* Google submissions */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-400">{tNav("googleQuota")}</span>
                <span className="text-gray-300">
                  {indexatorUsage.googleSubmissions.used}/{indexatorUsage.googleSubmissions.limit} {tNav("today")}
                </span>
              </div>
              <ProgressBar
                used={indexatorUsage.googleSubmissions.used}
                limit={indexatorUsage.googleSubmissions.limit}
              />
            </div>

            {/* Inspections */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-400">{tNav("inspections")}</span>
                <span className="text-gray-300">
                  {indexatorUsage.inspections.used}/{indexatorUsage.inspections.limit} {tNav("today")}
                </span>
              </div>
              <ProgressBar
                used={indexatorUsage.inspections.used}
                limit={indexatorUsage.inspections.limit}
              />
            </div>
          </div>
        )}

        {/* CTA */}
        {isFree ? (
          <Link
            href="/app/plans"
            onClick={onNavigate}
            className="mt-1 block rounded-md bg-gradient-to-r from-copper to-copper-light px-3 py-1.5 text-center text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            {tNav("upgradeToPro")}
          </Link>
        ) : (
          <Link
            href="/app/plans"
            onClick={onNavigate}
            className="mt-1 block text-xs text-gray-400 transition-colors hover:text-white"
          >
            {tNav("managePlan")}
          </Link>
        )}
      </div>
    </div>
  );
}
