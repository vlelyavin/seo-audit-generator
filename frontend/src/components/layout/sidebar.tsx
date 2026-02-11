"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Plus,
  CreditCard,
  Settings,
  Palette,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const { data: session } = useSession();

  const isAdmin = session?.user?.role === "admin";

  const navItems = [
    {
      href: `/${locale}/dashboard`,
      label: t("dashboard"),
      icon: LayoutDashboard,
    },
    {
      href: `/${locale}/dashboard/audit/new`,
      label: t("newAudit"),
      icon: Plus,
    },
    {
      href: `/${locale}/dashboard/plans`,
      label: t("plans"),
      icon: CreditCard,
    },
    {
      href: `/${locale}/dashboard/settings`,
      label: t("settings"),
      icon: Settings,
    },
    {
      href: `/${locale}/dashboard/settings/branding`,
      label: t("branding"),
      icon: Palette,
    },
  ];

  const adminItems = isAdmin
    ? [
        {
          href: `/${locale}/dashboard/admin/users`,
          label: t("users"),
          icon: Users,
        },
      ]
    : [];

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-white dark:border-gray-800 dark:bg-gray-950 transition-transform duration-200 lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-4 dark:border-gray-800 lg:hidden">
          <span className="font-semibold text-gray-900 dark:text-white">
            Menu
          </span>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            // Only highlight if this is the longest matching route
            const isActive = (() => {
              if (!pathname.startsWith(item.href)) return false;

              // Find all matching routes from navItems
              const allMatching = navItems.filter(i =>
                pathname.startsWith(i.href) || pathname === i.href
              );

              // This route is active if it's the longest match
              const longestMatch = allMatching.reduce(
                (longest, current) =>
                  current.href.length > longest.href.length ? current : longest,
                allMatching[0]
              );

              return longestMatch.href === item.href;
            })();

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-gray-100 text-gray-900 dark:bg-[#1a1a1a] dark:text-white border-l-4 border-gray-900 dark:border-white"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}

          {adminItems.length > 0 && (
            <>
              <div className="my-3 border-t dark:border-gray-800" />
              <p className="px-3 text-xs font-medium uppercase text-gray-400 dark:text-gray-500">
                {t("admin")}
              </p>
              {adminItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-gray-100 text-gray-900 dark:bg-[#1a1a1a] dark:text-white border-l-4 border-gray-900 dark:border-white"
                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        {session?.user && (
          <div className="border-t p-3 dark:border-gray-800">
            <Link
              href={`/${locale}/dashboard/plans`}
              onClick={onClose}
              className="block rounded-lg bg-gray-50 p-3 transition-colors hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-800"
            >
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {t("currentPlan")}
              </p>
              <p className="text-sm font-semibold capitalize text-gray-900 dark:text-white">
                {session.user.planId}
              </p>
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}
