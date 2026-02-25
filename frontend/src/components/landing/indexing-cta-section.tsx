"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export function IndexingCtaSection() {
  const t = useTranslations("marketing.indexingLanding.cta");

  return (
    <section className="bg-black py-24">
      <div className="mx-auto max-w-3xl px-4 text-center lg:px-6">
        <h2 className="text-3xl font-bold text-white sm:text-4xl">
          {t("heading")}
        </h2>
        <p className="mt-4 text-lg text-gray-400">{t("subheading")}</p>
        <Link
          href="/dashboard/indexator"
          className="mt-8 inline-block rounded-md bg-gradient-to-r from-copper to-copper-light px-10 py-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          {t("button")}
        </Link>
      </div>
    </section>
  );
}
