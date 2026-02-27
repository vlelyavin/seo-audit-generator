"use client";

import { useState } from "react";
import Image from "next/image";
import { Link, usePathname } from "@/i18n/navigation";
import { localePath } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useSession, signOut, signIn } from "next-auth/react";
import { LogOut, Menu, X } from "lucide-react";
// HIDDEN: Language switcher disabled while app is English-only
// import { LocaleSwitcher } from "./locale-switcher";
import { cn } from "@/lib/utils";

/* PRESERVED: SidebarToggleIcon kept for future use */
// function SidebarToggleIcon({ open }: { open: boolean }) { ... }

export function Header() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;
  const isAdmin = user?.role === "admin";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const rawName = user?.name?.trim();
  const emailLocal = user?.email?.split("@")[0];
  const initials = rawName
    ? rawName
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : emailLocal?.[0]?.toUpperCase() || "?";

  const navItems = [
    { href: "/app", label: t("dashboard") },
    { href: "/app/plans", label: t("plans") },
    // HIDDEN: Settings page temporarily disabled
    // { href: "/app/settings", label: t("settings") },
    ...(isAdmin ? [{ href: "/app/admin", label: t("admin") }] : []),
  ];

  const isActive = (href: string) => {
    if (!pathname.startsWith(href)) return false;
    const allMatching = navItems.filter((i) => pathname.startsWith(i.href));
    const longestMatch = allMatching.reduce(
      (longest, current) =>
        current.href.length > longest.href.length ? current : longest,
      allMatching[0]
    );
    return longestMatch.href === href;
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-gradient-to-b from-black to-transparent">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4 lg:px-6">
          {/* Logo - left */}
          <Link
            href="/app"
            className="flex shrink-0 items-center gap-2 font-semibold"
          >
            <Image src="/images/Indexator-logo.png" alt="Indexator" width={200} height={50} className="h-4 w-auto -mt-[2px] md:h-5 md:-mt-[6px]" />
          </Link>

          {/* Nav links - centered (desktop) */}
          <nav className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive(item.href)
                    ? "text-white"
                    : "text-gray-400 hover:text-white"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right section */}
          <div className="ml-auto flex items-center gap-3">
            {/* HIDDEN: Language switcher disabled while app is English-only */}
            {/* <LocaleSwitcher /> */}

            {user ? (
              <div className="flex items-center gap-2">
                {user.image ? (
                  <Image
                    src={user.image}
                    width={28}
                    height={28}
                    alt=""
                    className="rounded-full"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-700 text-xs font-medium text-white">
                    {initials}
                  </div>
                )}
                <button
                  onClick={() =>
                    signOut({ callbackUrl: localePath(locale, "/") })
                  }
                  className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-900 hover:text-white"
                  title={t("logout")}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() =>
                  signIn("google", {
                    callbackUrl: localePath(locale, "/app"),
                  })
                }
                className="rounded-md bg-gradient-to-r from-copper to-copper-light px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                {t("login")}
              </button>
            )}

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="flex items-center justify-center rounded-md px-2 py-2 text-white transition-colors hover:bg-gray-900 md:hidden"
              aria-label={mobileMenuOpen ? t("closeSidebar") : t("openSidebar")}
              type="button"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile dropdown nav */}
      {mobileMenuOpen && (
        <div className="fixed inset-x-0 top-14 z-50 border-b border-gray-800 bg-black/95 backdrop-blur-sm md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col px-4 py-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive(item.href)
                    ? "text-white"
                    : "text-gray-400 hover:text-white"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
