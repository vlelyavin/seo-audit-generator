"use client";

import { useTranslations } from "next-intl";

export function IndexingFeaturesSection() {
  const t = useTranslations("marketing.indexingLanding.features");

  const features = Array.from({ length: 6 }, (_, i) => ({
    title: t(`feature${i + 1}Title`),
    desc: t(`feature${i + 1}Desc`),
  }));

  return (
    <section className="bg-black py-24">
      <div className="mx-auto max-w-6xl px-4 lg:px-6">
        <p className="mb-4 text-sm font-medium not-italic text-copper">
          {t("sectionLabel")}
        </p>
        <h2 className="text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
          {t("title")}
        </h2>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feat) => (
            <div
              key={feat.title}
              className="rounded-xl border border-gray-800 bg-gray-950 p-6"
            >
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
