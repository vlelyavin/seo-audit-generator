"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";

export function IndexingCtaSection() {
  const t = useTranslations("marketing.indexingLanding.cta");

  return (
    <section className="relative bg-black py-24">
      {/* Copper radial glow background */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <div className="h-[400px] w-[600px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(184,115,51,0.12)_0%,rgba(184,115,51,0.04)_40%,transparent_70%)] blur-2xl" />
      </div>

      <div className="relative mx-auto max-w-3xl px-4 text-center lg:px-6">
        <div className="rounded-2xl border border-gray-800 bg-gray-950/80 px-8 py-16 backdrop-blur-sm">
          <h2 className="text-4xl md:text-5xl font-bold text-white">
            {t("heading")}
          </h2>
          <p className="mt-4 text-base text-gray-400">{t("subheading")}</p>
          <Link
            href="/app"
            className="landing-btn mt-8 inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-copper to-copper-light px-10 py-4 text-sm font-semibold text-white"
          >
            <ArrowRight className="h-4 w-4" />
            {t("button")}
          </Link>
        </div>
      </div>
    </section>
  );
}
