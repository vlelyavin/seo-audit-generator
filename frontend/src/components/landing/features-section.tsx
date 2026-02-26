"use client";

import { useTranslations } from "next-intl";
import { BarChart3, Activity, Globe, FileDown, Lightbulb, Zap } from "lucide-react";

export function FeaturesSection() {
  const t = useTranslations("marketing.landing.features");

  const steps = [
    { num: "01", title: t("step1Title"), desc: t("step1Desc") },
    { num: "02", title: t("step2Title"), desc: t("step2Desc") },
    { num: "03", title: t("step3Title"), desc: t("step3Desc") },
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
        <p className="mb-2 text-center text-base md:text-2xl font-bold bg-gradient-to-r from-copper to-copper-light bg-clip-text text-transparent">
          {t("sectionLabel")}
        </p>
        <h2 className="mx-auto max-w-3xl text-center font-bold text-white" style={{ fontSize: "clamp(2rem, 4vw, 4rem)", lineHeight: 1.2 }}>
          {t("title")}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center font-medium text-[#e9e9e9]" style={{ fontSize: "clamp(.8rem, 1.25vw, 1.25rem)", lineHeight: "150%" }}>
          {t("subtitle")}
        </p>

        <div className="mx-auto mt-16 max-w-3xl flex flex-col">
          {steps.map((step, i) => (
            <div key={step.num}>
              <div className="border-t border-[#282828]" />
              <div className="flex gap-6 py-10 sm:gap-10">
                <span className="shrink-0 text-5xl font-bold leading-none bg-gradient-to-b from-copper to-copper-light bg-clip-text text-transparent sm:text-6xl lg:text-7xl">
                  {step.num}
                </span>
                <div className="pt-1">
                  <h3 className="text-xl font-semibold text-white sm:text-2xl">
                    {step.title}
                  </h3>
                  <p className="mt-2 font-medium text-[#e9e9e9]" style={{ fontSize: "clamp(.8rem, 1.25vw, 1.25rem)", lineHeight: "150%" }}>
                    {step.desc}
                  </p>
                </div>
              </div>
              {i === steps.length - 1 && (
                <div className="border-t border-[#282828]" />
              )}
            </div>
          ))}
        </div>

        <div className="mt-20">
          <p className="mb-2 text-center text-base md:text-2xl font-bold bg-gradient-to-r from-copper to-copper-light bg-clip-text text-transparent">
            {t("featuresSectionLabel")}
          </p>
          <h2 className="mx-auto max-w-3xl text-center font-bold text-white" style={{ fontSize: "clamp(2rem, 4vw, 4rem)", lineHeight: 1.2 }}>
            {t("featuresTitle")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center font-medium text-[#e9e9e9]" style={{ fontSize: "clamp(.8rem, 1.25vw, 1.25rem)", lineHeight: "150%" }}>
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
              <p className="mt-2 font-medium text-[#e9e9e9]" style={{ fontSize: "clamp(.8rem, 1.25vw, 1.25rem)", lineHeight: "150%" }}>
                {feat.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
