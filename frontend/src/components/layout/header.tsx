"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useSession, signOut } from "next-auth/react";
import { Search, Menu, LogOut, User } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { LocaleSwitcher } from "./locale-switcher";
import { cn } from "@/lib/utils";

interface HeaderProps {
  onMenuToggle?: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-white/80 px-4 backdrop-blur-sm dark:border-[#1a1a1a] dark:bg-black/80 lg:px-6">
      <button
        onClick={onMenuToggle}
        className="lg:hidden rounded-md p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-[#0a0a0a]"
      >
        <Menu className="h-5 w-5" />
      </button>

      <Link
        href={`/${locale}/dashboard`}
        className="flex items-center gap-2 font-semibold"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-white text-black text-sm font-bold">
          SA
        </div>
        <span className="hidden sm:inline text-gray-900 dark:text-white">
          SEO Audit
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-3">
        <ThemeToggle />
        <LocaleSwitcher />

        {session?.user ? (
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-sm text-gray-600 dark:text-gray-400">
              {session.user.name || session.user.email}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: `/${locale}/login` })}
              className="rounded-md p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-[#0a0a0a]"
              title={t("logout")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Link
            href={`/${locale}/login`}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-gray-200 dark:bg-white dark:hover:bg-gray-200"
          >
            {t("login")}
          </Link>
        )}
      </div>
    </header>
  );
}
