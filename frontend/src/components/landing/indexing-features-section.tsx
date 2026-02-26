"use client";

import { useTranslations } from "next-intl";
import {
  BarChart3,
  MousePointerClick,
  RefreshCw,
  ShieldAlert,
  Mail,
  Lightbulb,
} from "lucide-react";
import { motion } from "framer-motion";

const ICONS = [BarChart3, MousePointerClick, RefreshCw, ShieldAlert, Mail, Lightbulb];

export function IndexingFeaturesSection() {
  const t = useTranslations("marketing.indexingLanding.features");

  const features = Array.from({ length: 6 }, (_, i) => ({
    title: t(`feature${i + 1}Title`),
    desc: t(`feature${i + 1}Desc`),
    icon: ICONS[i],
  }));

  return (
    <section className="bg-black py-24">
      <div className="mx-auto max-w-6xl px-4 lg:px-6">
        <p className="mb-2 text-center text-base md:text-2xl font-bold bg-gradient-to-r from-copper to-copper-light bg-clip-text text-transparent">
          {t("sectionLabel")}
        </p>
        <h2 className="text-center text-4xl md:text-5xl font-bold text-white">
          {t("title")}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-base text-gray-400">
          {t("subtitle")}
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feat, i) => (
            <motion.div
              key={feat.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group rounded-xl border border-gray-800 bg-gray-950 p-8 transition-colors hover:border-copper/30"
            >
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-copper/10">
                <feat.icon className="h-6 w-6 text-copper" />
              </div>
              <h3 className="text-xl font-semibold text-white">{feat.title}</h3>
              <p className="mt-3 text-sm text-gray-400">
                {feat.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
