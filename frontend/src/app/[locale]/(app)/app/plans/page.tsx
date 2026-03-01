"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, X, Loader2, Zap, Rocket, Building2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { toast } from "sonner";
import type { Plan } from "@/types/plan";

export default function PlansPage() {
  const t = useTranslations("plans");
  const ut = useTranslations("marketing.unifiedPricing");
  const tBreadcrumbs = useTranslations("breadcrumbs");
  const { data: session, update } = useSession();
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    async function loadPlans() {
      try {
        const res = await fetch("/api/plans");
        if (res.ok) {
          setPlans(await res.json());
        }
      } catch {
        /* ignore */
      }
      setLoading(false);
    }
    loadPlans();
  }, []);

  async function handleSelectPlan(planId: string) {
    setSwitching(planId);

    try {
      const res = await fetch("/api/user/plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });

      if (res.ok) {
        await update();
        router.refresh();
        toast.success(t("planUpdated"));
      } else {
        const data = await res.json();
        toast.error(data.error || t("updateFailed"));
      }
    } catch {
      toast.error(t("updateFailed"));
    }
    setSwitching(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[
          { label: tBreadcrumbs("dashboard"), href: "/app" },
          { label: tBreadcrumbs("plans") },
        ]} />
        <h1 className="text-2xl font-bold text-white">
          {t("title")}
        </h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = session?.user?.planId === plan.id;
          const isAgency = plan.id === "agency";
          const isPro = plan.id === "pro";
          const isSwitching = switching === plan.id;

          const icons: Record<string, React.ComponentType<{ className?: string }>> = {
            free: Zap,
            pro: Rocket,
            agency: Building2,
          };
          const PlanIcon = icons[plan.id];

          const auditorFeatures: { text: string; present: boolean }[] = [
            {
              text: isPro || isAgency
                ? t("unlimitedAudits")
                : t("auditsPerMonth", { count: plan.auditsPerMonth }),
              present: true,
            },
            { text: t("maxPages", { count: plan.maxPages }), present: true },
            {
              text: isAgency
                ? t("allExports")
                : isPro
                  ? t("pdfDocxExports")
                  : t("pdfOnly"),
              present: true,
            },
            {
              text: plan.id === "free" ? t("watermarkIncluded") : t("noWatermark"),
              present: plan.id !== "free",
            },
            {
              text: isAgency ? t("brandedReports") : t("noBrandedReports"),
              present: isAgency,
            },
          ];

          const indexatorFeatures: { text: string; present: boolean }[] = [
            { text: t("maxSites", { count: plan.maxSites }), present: true },
            {
              text: plan.autoIndexing ? t("autoIndexing") : t("autoIndexingDisabled"),
              present: plan.autoIndexing,
            },
            {
              text: plan.reportFrequency !== "none"
                ? t("reportFrequency", { frequency: t(plan.reportFrequency) })
                : t("noEmailReports"),
              present: plan.reportFrequency !== "none",
            },
          ];

          return (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-xl border bg-gray-950 p-8",
                isCurrent ? "border-copper/50" : "border-gray-800"
              )}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-gradient-to-r from-copper to-copper-light px-3 py-1 text-xs font-medium text-white">
                    {t("current")}
                  </span>
                </div>
              )}

              {PlanIcon && (
                <PlanIcon className="h-6 w-6 text-copper" />
              )}

              <h3 className="mt-2 text-lg font-semibold text-white">
                {t(plan.id)}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {ut(`planAudience.${plan.id}`)}
              </p>

              <div className="mt-4 flex items-baseline">
                <span className="text-5xl font-bold text-white">
                  ${plan.price}
                </span>
                <span className="ml-2 text-gray-500">{t("perMonth")}</span>
              </div>

              {/* Auditor features */}
              <div className="mt-8">
                <p className="mb-3 text-sm font-semibold tracking-wider text-copper">
                  {ut("auditorLabel")}
                </p>
                <ul className="space-y-3">
                  {auditorFeatures.map((feat) => (
                    <li key={feat.text} className="flex items-start gap-3">
                      {feat.present ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      ) : (
                        <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      )}
                      <span className={cn("text-sm", feat.present ? "text-gray-300" : "text-gray-500")}>{feat.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Indexator features */}
              <div className="mt-8 flex-1">
                <p className="mb-3 text-sm font-semibold tracking-wider text-copper">
                  {ut("indexatorLabel")}
                </p>
                <ul className="space-y-3">
                  {indexatorFeatures.map((feat) => (
                    <li key={feat.text} className="flex items-start gap-3">
                      {feat.present ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      ) : (
                        <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      )}
                      <span className={cn("text-sm", feat.present ? "text-gray-300" : "text-gray-500")}>{feat.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => handleSelectPlan(plan.id)}
                disabled={isCurrent || isSwitching}
                className={cn(
                  "mt-8 flex w-full items-center justify-center gap-2 rounded-md px-4 py-3.5 text-sm font-semibold transition-opacity",
                  isCurrent
                    ? "cursor-not-allowed bg-gray-900 text-gray-500"
                    : "border border-gray-700 text-white transition-colors hover:border-copper hover:bg-gray-900"
                )}
              >
                {isSwitching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("switching")}
                  </>
                ) : isCurrent ? (
                  <>
                    <Check className="h-4 w-4" />
                    {t("currentPlan")}
                  </>
                ) : plan.price >
                  (plans.find((p) => p.id === session?.user?.planId)?.price ||
                    0) ? (
                  <>
                    <ArrowRight className="h-4 w-4" />
                    {t("upgrade")}
                  </>
                ) : (
                  <>
                    <ArrowRight className="h-4 w-4" />
                    {t("select")}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
        <p className="text-sm text-gray-400">
          {t("noBilling")}
        </p>
      </div>
    </div>
  );
}
