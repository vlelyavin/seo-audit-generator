"use client";

import { useState } from "react";
import Image from "next/image";
import { Link, usePathname } from "@/i18n/navigation";
import { localePath } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useSession, signOut, signIn } from "next-auth/react";
import { LogOut, Menu, X, LayoutDashboard, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

export function Header() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;
  const isAdmin = user?.role === "admin";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isApp = pathname.startsWith("/app");

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

  const handleLogout = async () => {
    await signOut({ redirect: false });
    window.location.href = localePath(locale, "/");
  };

  const avatar = user?.image ? (
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
  );

  const logoutButton = (
    <button
      onClick={handleLogout}
      className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-900 hover:text-white"
      title={t("logout")}
    >
      <LogOut className="h-4 w-4" />
    </button>
  );

  const outlinedBtnClass =
    "flex items-center gap-2 rounded-md border border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-900";

  return (
    <>
      <header className="sticky top-0 z-50 bg-gradient-to-b from-black to-transparent">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4 lg:px-6">
          {/* Logo */}
          <Link
            href={isApp ? "/app" : "/"}
            className="flex shrink-0 items-center gap-2 font-semibold"
          >
            <Image
              src="/images/Indexator-logo.png"
              alt="Indexator"
              width={200}
              height={50}
              className="h-4 w-auto -mt-[2px] md:h-5 md:-mt-[6px]"
              priority={!isApp}
            />
          </Link>

          {/* Centered nav — app context only, desktop */}
          {isApp && (
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
          )}

          {/* Right section */}
          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-2">
                {/* Marketing context: Dashboard + Plans buttons */}
                {!isApp && (
                  <>
                    <Link href="/app" className={outlinedBtnClass}>
                      <LayoutDashboard className="h-4 w-4" />
                      {t("dashboard")}
                    </Link>
                    <Link href="/app/plans" className={outlinedBtnClass}>
                      <CreditCard className="h-4 w-4" />
                      {t("plans")}
                    </Link>
                  </>
                )}
                {avatar}
                {logoutButton}
              </div>
            ) : (
              <button
                onClick={() =>
                  signIn("google", {
                    callbackUrl: localePath(locale, "/app"),
                  })
                }
                className={outlinedBtnClass}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                {t("login")}
              </button>
            )}

            {/* Mobile hamburger — app context only */}
            {isApp && (
              <button
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className="flex items-center justify-center rounded-md px-2 py-2 text-white transition-colors hover:bg-gray-900 md:hidden"
                aria-label={
                  mobileMenuOpen ? t("closeSidebar") : t("openSidebar")
                }
                type="button"
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile dropdown nav — app context only */}
      {isApp && mobileMenuOpen && (
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
