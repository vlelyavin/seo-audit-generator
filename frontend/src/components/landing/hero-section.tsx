"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowRight,
  Globe,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  FileText,
} from "lucide-react";

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
    <section className="mx-auto max-w-6xl px-4 pt-24 pb-20 lg:px-6">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="mb-4 text-sm font-medium italic text-copper">
            {t("sectionLabel")}
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            {t("title")}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-gray-400">
            {t("subtitle")}
          </p>

          <form onSubmit={handleAuditSubmit} className="mt-8">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Globe className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={t("urlPlaceholder")}
                  className="w-full rounded-lg border border-gray-800 bg-gray-950 py-3 pl-11 pr-4 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-copper"
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

        <div className="relative">
          <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950 p-4 shadow-2xl">
            {/* Styled dashboard mockup placeholder */}
            <div className="space-y-4">
              {/* Header bar */}
              <div className="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-copper" />
                  <span className="text-xs font-medium text-white">
                    SEO Audit Report
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                  <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Score", value: "87/100", color: "text-green-400" },
                  { label: "Issues", value: "12", color: "text-yellow-400" },
                  { label: "Pages", value: "48", color: "text-copper" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-lg bg-gray-900 px-3 py-2.5 text-center"
                  >
                    <p className={`text-lg font-bold ${stat.color}`}>
                      {stat.value}
                    </p>
                    <p className="text-[10px] text-gray-500">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Issue list mockup */}
              <div className="space-y-2">
                {[
                  {
                    icon: CheckCircle,
                    text: "Meta tags optimized",
                    status: "text-green-400",
                  },
                  {
                    icon: AlertTriangle,
                    text: "3 images missing alt text",
                    status: "text-yellow-400",
                  },
                  {
                    icon: CheckCircle,
                    text: "Headings structure valid",
                    status: "text-green-400",
                  },
                  {
                    icon: FileText,
                    text: "Schema markup detected",
                    status: "text-green-400",
                  },
                ].map((item) => (
                  <div
                    key={item.text}
                    className="flex items-center gap-2.5 rounded-lg bg-gray-900 px-3 py-2"
                  >
                    <item.icon className={`h-3.5 w-3.5 ${item.status}`} />
                    <span className="text-xs text-gray-300">{item.text}</span>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div className="rounded-lg bg-gray-900 px-3 py-2.5">
                <div className="mb-1.5 flex justify-between text-[10px]">
                  <span className="text-gray-500">Analysis Progress</span>
                  <span className="text-copper">100%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-800">
                  <div className="h-full w-full rounded-full bg-gradient-to-r from-copper to-copper-light" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
