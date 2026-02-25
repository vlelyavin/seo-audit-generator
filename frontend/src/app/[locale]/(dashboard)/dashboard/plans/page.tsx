"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { Check, Loader2, Zap, Rocket, Building2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import type { Plan } from "@/types/plan";

export default function PlansPage() {
  const t = useTranslations("plans");
  const tBreadcrumbs = useTranslations("breadcrumbs");
  const locale = useLocale();
  const { data: session, update } = useSession();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
    setMessage(null);

    try {
      const res = await fetch("/api/user/plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: t("planUpdated") });
        // Refresh session to update planId in JWT
        await update();
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || t("updateFailed") });
      }
    } catch {
      setMessage({ type: "error", text: t("updateFailed") });
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
          { label: tBreadcrumbs("dashboard"), href: `/${locale}/dashboard` },
          { label: tBreadcrumbs("plans") },
        ]} />
        <h1 className="text-2xl font-bold text-white">
          {t("title")}
        </h1>
      </div>

      {message && (
        <div
          className={cn(
            "rounded-lg px-4 py-2 text-sm",
            message.type === "error"
              ? "bg-red-900/20 text-red-300"
              : "bg-green-900/20 text-green-300"
          )}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = session?.user?.planId === plan.id;
          const isAgency = plan.id === "agency";
          const isPro = plan.id === "pro";
          const isSwitching = switching === plan.id;
          const featureItems = [
            {
              text:
                isPro || isAgency
                  ? t("unlimitedAudits")
                  : t("auditsPerMonth", { count: plan.auditsPerMonth }),
              highlight: false,
            },
            { text: t("maxPages", { count: plan.maxPages }), highlight: false },
            {
              text: isAgency
                ? t("fullExports")
                : isPro
                ? t("pdfAndHtmlExports")
                : t("pdfOnly"),
              highlight: isAgency,
            },
            {
              text: plan.id === "free" ? t("watermarkIncluded") : t("noWatermark"),
              highlight: isAgency,
            },
            ...(isAgency ? [{ text: t("whiteLabel"), highlight: true }] : []),
          ];

          return (
            <div
              key={plan.id}
              className={cn(
                "relative flex h-full flex-col rounded-xl border p-6",
                isCurrent
                  ? "border-copper/50 bg-gray-950"
                  : isAgency
                  ? "border-copper/30 bg-gray-950"
                  : "border-gray-800 bg-black"
              )}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-gradient-to-r from-copper to-copper-light px-3 py-1 text-xs font-medium text-white">
                    {t("current")}
                  </span>
                </div>
              )}

              <div className="mb-4">
                {(() => {
                  const icons: Record<string, React.ComponentType<{ className?: string }>> = {
                    free: Zap,
                    pro: Rocket,
                    agency: Building2,
                  };
                  const PlanIcon = icons[plan.id];
                  return PlanIcon ? (
                    <PlanIcon className={cn("mb-2 h-6 w-6", isAgency ? "text-copper" : "text-gray-400")} />
                  ) : null;
                })()}
                <h3 className="text-lg font-semibold text-white">
                  {t(plan.id)}
                </h3>
                <div className="mt-2 flex items-baseline">
                  <span className="text-4xl font-bold text-white">
                    ${plan.price}
                  </span>
                  <span className="ml-1 text-sm text-gray-500">
                    {t("perMonth")}
                  </span>
                </div>
              </div>

              <ul className="mb-6 flex-1 space-y-3">
                {featureItems.map((item) => (
                  <FeatureItem
                    key={item.text}
                    icon={Check}
                    text={item.text}
                    highlight={item.highlight}
                  />
                ))}
              </ul>

              <button
                onClick={() => handleSelectPlan(plan.id)}
                disabled={isCurrent || isSwitching}
                className={cn(
                  "mt-auto flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-opacity",
                  isCurrent
                    ? "cursor-not-allowed bg-gray-900 text-gray-500"
                    : isAgency
                    ? "bg-gradient-to-r from-copper to-copper-light text-white hover:opacity-90"
                    : "border border-gray-700 text-white hover:bg-gray-900"
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

      <div className="rounded-lg border border-gray-800 bg-black p-4">
        <p className="text-sm text-gray-400">
          {t("noBilling")}
        </p>
      </div>
    </div>
  );
}

function FeatureItem({
  icon: Icon,
  text,
  highlight = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  highlight?: boolean;
}) {
  return (
    <li className="flex items-start gap-2">
      <Icon
        className="mt-0.5 h-5 w-5 shrink-0 text-copper"
      />
      <span
        className={cn(
          "text-sm",
          highlight
            ? "font-medium text-white"
            : "text-gray-300"
        )}
      >
        {text}
      </span>
    </li>
  );
}
