"use client";

import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { Link } from "@/i18n/navigation";
import { Check, X, Zap, Rocket, Building2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const PLANS = [
  { id: "free", price: 0, auditsPerMonth: 3, maxPages: 20, maxSites: 1, autoIndexing: false, reportFrequency: "none" },
  { id: "pro", price: 15, auditsPerMonth: -1, maxPages: 200, maxSites: 5, autoIndexing: true, reportFrequency: "weekly" },
  { id: "agency", price: 35, auditsPerMonth: -1, maxPages: 1000, maxSites: 10, autoIndexing: true, reportFrequency: "daily" },
] as const;

const PLAN_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  free: Zap,
  pro: Rocket,
  agency: Building2,
};

export function PricingSection({ showIntro = true }: { showIntro?: boolean }) {
  const t = useTranslations("marketing.unifiedPricing");
  const pt = useTranslations("plans");
  const { data: session } = useSession();

  const ctaHref = session?.user ? "/dashboard/plans" : "/login";

  return (
    <section id="pricing" className="bg-black py-24">
      <div className="mx-auto max-w-6xl px-4 lg:px-6">
        {showIntro && (
          <>
            <p className="mb-6 text-center text-sm font-medium text-copper">
              {t("sectionLabel")}
            </p>
            <h2 className="text-center font-bold text-white" style={{ fontSize: "clamp(2rem, 4vw, 4rem)" }}>
              {t("title")}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-gray-400">
              {t("subtitle")}
            </p>
          </>
        )}

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const isPro = plan.id === "pro";
            const isAgency = plan.id === "agency";

            const auditorFeatures: { text: string; present: boolean }[] = [
              {
                text: isPro || isAgency
                  ? pt("unlimitedAudits")
                  : pt("auditsPerMonth", { count: plan.auditsPerMonth }),
                present: true,
              },
              { text: pt("maxPages", { count: plan.maxPages }), present: true },
              {
                text: isAgency
                  ? pt("allExports")
                  : isPro
                    ? pt("pdfDocxExports")
                    : pt("pdfOnly"),
                present: true,
              },
              { text: pt("noWatermark"), present: plan.id !== "free" },
              { text: pt("whiteLabel"), present: isAgency },
            ];

            const indexatorFeatures: { text: string; present: boolean }[] = [
              { text: pt("maxSites", { count: plan.maxSites }), present: true },
              { text: pt("autoIndexing"), present: plan.autoIndexing },
              {
                text: plan.reportFrequency !== "none"
                  ? pt("reportFrequency", { frequency: pt(plan.reportFrequency) })
                  : pt("reportFrequency", { frequency: "—" }),
                present: plan.reportFrequency !== "none",
              },
            ];

            const PlanIcon = PLAN_ICONS[plan.id];

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-xl border bg-gray-950 p-8",
                  isPro ? "border-copper/50" : "border-gray-800"
                )}
              >
                {isPro && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="flex items-center gap-1 rounded-full bg-copper px-3 py-1 text-xs font-semibold text-white">
                      <Zap className="h-3 w-3" />
                      {t("mostPopular")}
                    </span>
                  </div>
                )}

                {PlanIcon && (
                  <PlanIcon className="h-6 w-6 text-copper" />
                )}

                <h3 className="mt-2 text-lg font-semibold text-white">
                  {pt(plan.id)}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {t(`planAudience.${plan.id}`)}
                </p>

                <div className="mt-4 flex items-baseline">
                  <span className="text-5xl font-bold text-white">
                    ${plan.price}
                  </span>
                  <span className="ml-2 text-gray-500">{pt("perMonth")}</span>
                </div>

                {/* Auditor features */}
                <div className="mt-8">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-copper">
                    {t("auditorLabel")}
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
                <div className="mt-6 border-t border-gray-800 pt-6">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-copper">
                    {t("indexatorLabel")}
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

                <Link
                  href={ctaHref}
                  className={cn(
                    "mt-8 flex items-center justify-center gap-2 rounded-md px-4 py-3.5 text-center text-sm font-semibold transition-opacity",
                    isPro
                      ? "bg-gradient-to-r from-copper to-copper-light text-white hover:opacity-90"
                      : "border border-gray-700 text-white hover:bg-black"
                  )}
                >
                  <ArrowRight className="h-4 w-4" />
                  {plan.price === 0 ? t("ctaFree") : t("ctaPaid")}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
