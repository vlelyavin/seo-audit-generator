"use client";

import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { Link } from "@/i18n/navigation";
import { Zap, Rocket, Building2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function IndexingPricingSection() {
  const t = useTranslations("marketing.indexingLanding.pricing");
  const { data: session } = useSession();

  const ctaHref = session?.user
    ? "/dashboard/indexator"
    : "/login";

  const packs = [
    {
      id: "starter",
      name: t("starterName"),
      price: t("starterPrice"),
      credits: t("starterCredits"),
      rate: t("starterRate"),
      cta: t("starterCta"),
      badge: null,
      highlight: false,
    },
    {
      id: "growth",
      name: t("growthName"),
      price: t("growthPrice"),
      credits: t("growthCredits"),
      rate: t("growthRate"),
      cta: t("growthCta"),
      badge: t("growthBadge"),
      highlight: true,
    },
    {
      id: "scale",
      name: t("scaleName"),
      price: t("scalePrice"),
      credits: t("scaleCredits"),
      rate: t("scaleRate"),
      cta: t("scaleCta"),
      badge: t("scaleBadge"),
      highlight: false,
    },
  ];

  return (
    <section id="indexing-pricing" className="bg-black py-24">
      <div className="mx-auto max-w-6xl px-4 lg:px-6">
        <h2 className="text-center text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
          {t("title")}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-lg text-gray-400">
          {t("sectionDesc")}
        </p>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {packs.map((pack) => (
            <div
              key={pack.id}
              className={cn(
                "relative flex flex-col rounded-xl border bg-gray-950 p-8",
                pack.highlight ? "border-copper/50" : "border-gray-800"
              )}
            >
              {pack.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="flex items-center gap-1 rounded-full bg-copper px-3 py-1 text-xs font-semibold text-white">
                    {pack.highlight && <Zap className="h-3 w-3" />}
                    {pack.badge}
                  </span>
                </div>
              )}

              {(() => {
                const icons: Record<string, React.ComponentType<{ className?: string }>> = {
                  starter: Zap,
                  growth: Rocket,
                  scale: Building2,
                };
                const PackIcon = icons[pack.id];
                return PackIcon ? (
                  <PackIcon className={cn("h-6 w-6", pack.highlight ? "text-copper" : "text-gray-400")} />
                ) : null;
              })()}

              <h3 className="mt-2 text-lg font-semibold text-white">{pack.name}</h3>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-5xl font-bold text-white">{pack.price}</span>
                <span className="text-gray-500">{t("oneTime")}</span>
              </div>

              <div className="mt-6 space-y-2">
                <p className="text-2xl font-semibold text-copper">{pack.credits}</p>
                <p className="text-sm text-gray-400">{pack.rate}</p>
              </div>

              <Link
                href={ctaHref}
                className={cn(
                  "mt-8 flex items-center justify-center gap-2 rounded-md px-4 py-3.5 text-center text-sm font-semibold transition-opacity",
                  pack.highlight
                    ? "bg-gradient-to-r from-copper to-copper-light text-white hover:opacity-90"
                    : "border border-gray-700 text-white hover:bg-black"
                )}
              >
                <ArrowRight className="h-4 w-4" />
                {pack.cta}
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <p className="text-sm text-gray-500">{t("quotaNote")}</p>
        </div>
      </div>
    </section>
  );
}
