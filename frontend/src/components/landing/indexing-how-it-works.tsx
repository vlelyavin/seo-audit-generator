"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

export function IndexingHowItWorks() {
  const t = useTranslations("marketing.indexingLanding.howItWorks");

  const steps = [
    { num: "01", title: t("step1Title"), desc: t("step1Desc") },
    { num: "02", title: t("step2Title"), desc: t("step2Desc") },
    { num: "03", title: t("step3Title"), desc: t("step3Desc") },
  ];

  return (
    <section className="bg-black py-24">
      <div className="mx-auto max-w-3xl px-4 lg:px-6">
        <p className="mb-2 text-center text-base md:text-2xl font-bold bg-gradient-to-r from-copper to-copper-light bg-clip-text text-transparent">
          {t("sectionLabel")}
        </p>
        <h2 className="text-center text-4xl md:text-5xl font-bold text-white">
          {t("title")}
        </h2>

        <div className="mt-16 flex flex-col">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
            >
              <div className="border-t border-[#282828]" />

              {/* Step content */}
              <div className="flex gap-6 py-10 sm:gap-10">
                <span className="shrink-0 text-5xl font-bold leading-none bg-gradient-to-b from-copper to-copper-light bg-clip-text text-transparent sm:text-6xl lg:text-7xl">
                  {step.num}
                </span>
                <div className="pt-1">
                  <h3 className="text-xl font-semibold text-white sm:text-2xl">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-400">
                    {step.desc}
                  </p>
                </div>
              </div>

              {/* Bottom divider for last item */}
              {i === steps.length - 1 && (
                <div className="border-t border-[#282828]" />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
