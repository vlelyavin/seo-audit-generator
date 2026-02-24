"use client";

import { useTranslations } from "next-intl";
import { BarChart3, MousePointerClick, RefreshCw, ShieldAlert, Mail, Lightbulb } from "lucide-react";

const FEATURE_ICONS = [BarChart3, MousePointerClick, RefreshCw, ShieldAlert, Mail, Lightbulb];

export function IndexingFeaturesSection() {
  const t = useTranslations("marketing.indexingLanding.features");

  const features = Array.from({ length: 6 }, (_, i) => ({
    title: t(`feature${i + 1}Title`),
    desc: t(`feature${i + 1}Desc`),
    icon: FEATURE_ICONS[i],
  }));

  return (
    <section className="bg-black py-24">
      <div className="mx-auto max-w-6xl px-4 lg:px-6">
        <p className="mb-4 text-center text-sm font-medium not-italic text-copper">
          {t("sectionLabel")}
        </p>
        <h2 className="text-center text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
          {t("title")}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-gray-400">
          {t("subtitle")}
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feat) => (
            <div
              key={feat.title}
              className="rounded-xl border border-gray-800 bg-gray-950 p-6"
            >
              <feat.icon className="mb-3 h-5 w-5 text-copper" />
              <h3 className="text-lg font-semibold text-white">{feat.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                {feat.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
