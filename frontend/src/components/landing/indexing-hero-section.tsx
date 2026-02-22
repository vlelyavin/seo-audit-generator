"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, CheckCircle, XCircle, Clock, ToggleRight } from "lucide-react";

export function IndexingHeroSection() {
  const t = useTranslations("marketing.indexingLanding.hero");
  const locale = useLocale();

  return (
    <section className="mx-auto max-w-6xl px-4 pt-24 pb-20 lg:px-6">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* LEFT SIDE */}
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

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/${locale}/dashboard/indexing`}
              className="rounded-md bg-gradient-to-r from-copper to-copper-light px-8 py-3.5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              {t("ctaPrimary")}
            </Link>
            <a
              href="#pricing"
              className="rounded-md border border-gray-700 px-8 py-3.5 text-center text-sm font-semibold text-white transition-colors hover:bg-gray-900"
            >
              {t("ctaSecondary")} <ArrowRight className="inline h-4 w-4 ml-1" />
            </a>
          </div>
        </div>

        {/* RIGHT SIDE: Indexing Dashboard Mockup */}
        <div className="relative">
          <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950 p-4 shadow-2xl">
            <div className="space-y-4">
              {/* Header bar */}
              <div className="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-3">
                <span className="text-xs font-medium text-white">
                  Indexing Dashboard
                </span>
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                  <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total URLs", value: "142", color: "text-white" },
                  { label: "Indexed", value: "98", color: "text-green-400" },
                  { label: "Not Indexed", value: "44", color: "text-yellow-400" },
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

              {/* URL table rows */}
              <div className="space-y-1.5">
                {[
                  {
                    url: "/blog/post-1",
                    status: "Indexed",
                    icon: CheckCircle,
                    color: "text-green-400",
                    bg: "bg-green-400/10",
                  },
                  {
                    url: "/products/item-2",
                    status: "Not Indexed",
                    icon: XCircle,
                    color: "text-yellow-400",
                    bg: "bg-yellow-400/10",
                  },
                  {
                    url: "/about",
                    status: "Submitted",
                    icon: Clock,
                    color: "text-blue-400",
                    bg: "bg-blue-400/10",
                  },
                  {
                    url: "/contact",
                    status: "Indexed",
                    icon: CheckCircle,
                    color: "text-green-400",
                    bg: "bg-green-400/10",
                  },
                ].map((row) => (
                  <div
                    key={row.url}
                    className="flex items-center justify-between rounded-lg bg-gray-900 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <row.icon className={`h-3.5 w-3.5 shrink-0 ${row.color}`} />
                      <span className="text-xs text-gray-300 font-mono">
                        {row.url}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${row.color} ${row.bg}`}
                    >
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>

              {/* Auto-indexing toggles */}
              <div className="rounded-lg bg-gray-900 px-3 py-2.5 space-y-2">
                {[
                  { label: "Auto-indexing via Google", active: true },
                  { label: "Daily email reports", active: true },
                ].map((toggle) => (
                  <div key={toggle.label} className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-400">{toggle.label}</span>
                    <div className="flex items-center gap-1.5">
                      <ToggleRight className="h-4 w-4 text-copper" />
                      <span className="text-[10px] text-copper font-medium">ON</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
