"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Check, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const PLANS = [
  { id: "free", price: 0, auditsPerMonth: 3, maxPages: 20 },
  { id: "pro", price: 9, auditsPerMonth: -1, maxPages: 200 },
  { id: "agency", price: 29, auditsPerMonth: -1, maxPages: 1000 },
] as const;

export function PricingSection() {
  const t = useTranslations("marketing.landing.pricing");
  const pt = useTranslations("plans");
  const locale = useLocale();
  const { data: session } = useSession();

  return (
    <section id="pricing" className="border-t border-gray-800 bg-black py-24">
      <div className="mx-auto max-w-6xl px-4 lg:px-6">
        <p className="mb-4 text-center text-sm font-medium italic text-copper">
          {t("sectionLabel")}
        </p>
        <h2 className="text-center text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
          {t("title")}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-lg text-gray-400">
          {t("subtitle")}
        </p>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const isAgency = plan.id === "agency";
            const isPro = plan.id === "pro";

            const features = [
              isPro || isAgency
                ? pt("unlimitedAudits")
                : pt("auditsPerMonth", { count: plan.auditsPerMonth }),
              pt("maxPages", { count: plan.maxPages }),
              isAgency
                ? pt("fullExports")
                : isPro
                  ? pt("pdfAndHtmlExports")
                  : pt("pdfOnly"),
              plan.id === "free"
                ? pt("watermarkIncluded")
                : pt("noWatermark"),
              ...(isAgency ? [pt("whiteLabel")] : []),
            ];

            const ctaHref = session?.user
              ? `/${locale}/dashboard/plans`
              : `/${locale}/login`;

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-xl border bg-gray-950 p-8",
                  isAgency ? "border-copper/50" : "border-gray-800"
                )}
              >
                {isAgency && (
                  <div className="absolute -top-3 right-4">
                    <Zap className="h-6 w-6 text-copper" />
                  </div>
                )}

                <h3 className="text-lg font-semibold text-white">
                  {pt(plan.id)}
                </h3>
                <div className="mt-4 flex items-baseline">
                  <span className="text-5xl font-bold text-white">
                    ${plan.price}
                  </span>
                  <span className="ml-2 text-gray-500">{pt("perMonth")}</span>
                </div>

                <ul className="mt-8 flex-1 space-y-4">
                  {features.map((feat) => (
                    <li key={feat} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-copper" />
                      <span className="text-sm text-gray-300">{feat}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={ctaHref}
                  className={cn(
                    "mt-8 block rounded-md px-4 py-3.5 text-center text-sm font-semibold transition-opacity",
                    isAgency
                      ? "bg-gradient-to-r from-copper to-copper-light text-white hover:opacity-90"
                      : "border border-gray-700 text-white hover:bg-gray-900"
                  )}
                >
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
