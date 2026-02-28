"use client";

import { Link, localePath } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useSession, signIn } from "next-auth/react";
import { ArrowRight, Zap } from "lucide-react";
import Image from "next/image";

export function AuditorHeroSection() {
  const t = useTranslations("marketing.auditorLanding.hero");
  const locale = useLocale();
  const { data: session } = useSession();

  const handleCta = () => {
    signIn("google", {
      callbackUrl: localePath(locale, "/app/auditor/new"),
    });
  };

  return (
    <section className="relative overflow-hidden bg-black pt-24 pb-20">
      <div className="relative mx-auto max-w-6xl px-4 lg:px-6">
        <div className="flex flex-col items-center text-center">
          <h1 className="mx-auto max-w-3xl text-4xl md:text-6xl font-bold tracking-tight text-white">
            {t("title")}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-gray-400">
            {t("subtitle")}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {session?.user ? (
              <Link
                href="/app/auditor/new"
                className="landing-btn inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-copper to-copper-light px-8 py-3.5 text-center text-sm font-semibold text-white"
              >
                <Zap className="h-4 w-4" />
                {t("ctaPrimary")}
              </Link>
            ) : (
              <button
                onClick={handleCta}
                className="landing-btn inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-copper to-copper-light px-8 py-3.5 text-center text-sm font-semibold text-white"
              >
                <Zap className="h-4 w-4" />
                {t("ctaPrimary")}
              </button>
            )}
            <a
              href="#pricing"
              className="landing-btn-outline inline-flex items-center justify-center gap-2 rounded-md border border-gray-700 px-8 py-3.5 text-center text-sm font-semibold text-white transition-colors hover:border-copper-light"
            >
              {t("ctaSecondary")} <ArrowRight className="ml-1 inline h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="mt-16 hidden sm:block">
          <Image
            src="/images/audit-dashboard-screenshot.png"
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
