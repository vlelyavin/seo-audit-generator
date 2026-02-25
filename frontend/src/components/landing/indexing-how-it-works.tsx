"use client";

import { useTranslations } from "next-intl";
import { Link2, Search, Send, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

const STEP_ICONS = [Link2, Search, Send] as const;

export function IndexingHowItWorks() {
  const t = useTranslations("marketing.indexingLanding.howItWorks");

  const steps = [
    { num: "01", icon: STEP_ICONS[0], title: t("step1Title"), desc: t("step1Desc") },
    { num: "02", icon: STEP_ICONS[1], title: t("step2Title"), desc: t("step2Desc") },
    { num: "03", icon: STEP_ICONS[2], title: t("step3Title"), desc: t("step3Desc") },
  ];

  return (
    <section className="bg-black py-24">
      <div className="mx-auto max-w-6xl px-4 lg:px-6">
        <p className="mb-4 text-center text-sm font-medium not-italic text-copper">
          {t("sectionLabel")}
        </p>
        <h2 className="text-center text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
          {t("title")}
        </h2>

        <div className="mt-16 grid items-start gap-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {steps.map((step, i) => (
            <div key={step.num} className="contents">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: i * 0.15 }}
                className="rounded-xl border border-gray-800 bg-gray-950 p-6"
              >
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
              </motion.div>

              {i < steps.length - 1 && (
                <div className="hidden items-center justify-center self-center sm:flex">
                  <div className="flex items-center gap-1">
                    <div className="h-px w-6 bg-gradient-to-r from-copper/50 to-copper/20" />
                    <ArrowRight className="h-4 w-4 text-copper/40" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
