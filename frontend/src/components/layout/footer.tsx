"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export function Footer() {
  const t = useTranslations("marketing.footer");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-800 bg-black">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-8 sm:flex-row sm:justify-between lg:px-6">
        <p className="text-sm text-gray-500">
          {t("copyright", { year })}
        </p>
        <Link href="/terms" className="text-sm text-gray-400 transition-colors hover:text-white">
          {t("terms")}
        </Link>
      </div>
    </footer>
  );
}
