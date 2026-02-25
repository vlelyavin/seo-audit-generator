"use client";

import { useTranslations } from "next-intl";
import { Search, BarChart3, FileText, Activity, Globe, FileDown, Lightbulb, Zap } from "lucide-react";

const STEP_ICONS = [Search, BarChart3, FileText] as const;

export function FeaturesSection() {
  const t = useTranslations("marketing.landing.features");

  const steps = [
    { num: "01", icon: STEP_ICONS[0], title: t("step1Title"), desc: t("step1Desc") },
    { num: "02", icon: STEP_ICONS[1], title: t("step2Title"), desc: t("step2Desc") },
    { num: "03", icon: STEP_ICONS[2], title: t("step3Title"), desc: t("step3Desc") },
  ];

  const FEATURE_ICONS = [BarChart3, Activity, Globe, FileDown, Lightbulb, Zap];
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

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((step) => (
            <div key={step.num} className="rounded-xl border border-gray-800 bg-gray-950 p-6">
              <span className="text-4xl font-bold text-copper/30">
                {step.num}
              </span>
              <div className="mt-4 flex items-center gap-3">
                <step.icon className="h-6 w-6 text-copper" />
                <h3 className="text-xl font-semibold text-white">
                  {step.title}
                </h3>
              </div>
              <p className="mt-3 leading-relaxed text-gray-400">
                {step.desc}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-20">
          <p className="mb-4 text-center text-sm font-medium not-italic text-copper">
            {t("featuresSectionLabel")}
          </p>
          <h2 className="text-center text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
            {t("featuresTitle")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-gray-400">
            {t("featuresSubtitle")}
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feat) => (
            <div
              key={feat.title}
              className="rounded-xl border border-gray-800 bg-gray-950 p-6"
            >
              <feat.icon className="mb-3 h-5 w-5 text-copper" />
              <h3 className="text-lg font-semibold text-white">
                {feat.title}
              </h3>
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
