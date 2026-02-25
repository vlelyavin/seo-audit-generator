"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowRight, Globe } from "lucide-react";
import { BrowserFrame } from "./browser-frame";

export function HeroSection() {
  const t = useTranslations("marketing.landing");
  const locale = useLocale();
  const router = useRouter();
  const { data: session } = useSession();
  const [url, setUrl] = useState("");

  function handleAuditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    const encoded = encodeURIComponent(url.trim());
    if (session?.user) {
      router.push(`/${locale}/dashboard/audit/new?url=${encoded}`);
    } else {
      router.push(
        `/${locale}/login?callbackUrl=/${locale}/dashboard/audit/new?url=${encoded}`
      );
    }
  }

  return (
    <section className="mx-auto max-w-5xl px-4 pt-24 pb-20 lg:px-6">
      <div className="flex flex-col items-center text-center">
        <p className="mb-4 text-sm font-medium not-italic text-copper">
          {t("sectionLabel")}
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
          {t("title")}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-400">
          {t("subtitle")}
        </p>

        <form onSubmit={handleAuditSubmit} className="mt-8 w-full max-w-xl">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t("urlPlaceholder")}
                className="w-full rounded-lg border border-gray-800 bg-gray-950 py-3 pl-11 pr-4 text-base text-white placeholder-gray-500 outline-none transition-colors focus:border-copper md:text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-gradient-to-r from-copper to-copper-light px-8 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              {t("cta")}
            </button>
          </div>
        </form>

        <div className="mt-4">
          <Link
            href={`/${locale}/pricing`}
            className="inline-flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-white"
          >
            {t("viewPricing")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="mt-16">
        <BrowserFrame
          imageSrc="/images/seo-audit-dashboard-screenshot.png"
          imageAlt={t("title")}
        />
      </div>
    </section>
  );
}
