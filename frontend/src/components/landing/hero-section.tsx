"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, ScanSearch } from "lucide-react";
import Image from "next/image";

export function HeroSection() {
  const t = useTranslations("marketing.landing");

  return (
    <section className="relative overflow-hidden bg-[linear-gradient(0deg,#0b0b0b,black)] pt-24 pb-20">
      {/* Bottom fade for smooth transition */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent" aria-hidden="true" />

      <div className="relative mx-auto max-w-6xl px-4 lg:px-6">
        <div className="flex flex-col items-center text-center">
          <p className="mb-2 text-base md:text-2xl font-bold bg-gradient-to-r from-copper to-copper-light bg-clip-text text-transparent">
            {t("sectionLabel")}
          </p>
          <h1 className="mx-auto max-w-3xl font-bold tracking-tight text-white" style={{ fontSize: "clamp(2rem, 4vw, 4rem)", lineHeight: 1.2 }}>
            {t("title")}
          </h1>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/dashboard/auditor/new"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-copper to-copper-light px-8 py-3.5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              <ScanSearch className="h-4 w-4" />
              {t("cta")}
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-1 rounded-md border border-gray-700 px-8 py-3.5 text-center text-sm font-semibold text-white transition-colors hover:bg-black"
            >
              {t("viewPricing")} <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mt-16">
          <Image
            src="/images/seo-audit-dashboard-screenshot.png"
            alt={t("title")}
            width={1920}
            height={1080}
            className="text-transparent"
            style={{ marginLeft: "-32px", marginRight: "-32px", width: "calc(100% + 64px)", maxWidth: "unset" }}
            priority
          />
        </div>
      </div>
    </section>
  );
}
