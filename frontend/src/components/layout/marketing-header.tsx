"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { LocaleSwitcher } from "./locale-switcher";

export function MarketingHeader() {
  const t = useTranslations("marketing.nav");
  const locale = useLocale();
  const { data: session } = useSession();

  const navLinks = [
    { href: `/${locale}`, label: t("audit") },
    { href: `/${locale}/indexing`, label: t("indexing") },
    { href: `/${locale}/pricing`, label: t("pricing") },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-gray-800 bg-black/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 lg:px-6">
        <Link href={`/${locale}`} className="flex items-center gap-2">
          <span className="text-lg font-bold text-white">SEO Audit</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          {session?.user ? (
            <Link
              href={`/${locale}/dashboard`}
              className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-gray-200"
            >
              {t("dashboard")}
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href={`/${locale}/login`}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-300 transition-colors hover:text-white"
              >
                {t("signIn")}
              </Link>
              <Link
                href={`/${locale}/login`}
                className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-gray-200"
              >
                {t("signUp")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
