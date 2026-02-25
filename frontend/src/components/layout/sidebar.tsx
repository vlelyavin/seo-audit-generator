"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import {
  CreditCard,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const t = useTranslations("nav");
  const tPlans = useTranslations("plans");
  const pathname = usePathname();
  const { data: session } = useSession();

  const isAdmin = session?.user?.role === "admin";

  const navItems = [
    {
      href: "/dashboard",
      label: t("dashboard"),
      icon: LayoutDashboard,
    },
    {
      href: "/dashboard/auditor/new",
      label: t("newAudit"),
      icon: Plus,
    },
    {
      href: "/dashboard/indexator",
      label: t("indexing"),
      icon: Search,
    },
    {
      href: "/dashboard/plans",
      label: t("plans"),
      icon: CreditCard,
    },
    {
      href: "/dashboard/settings",
      label: t("settings"),
      icon: Settings,
    },
  ];

  const adminItems = isAdmin
    ? [
        {
          href: "/dashboard/admin",
          label: t("admin"),
          icon: Users,
        },
      ]
    : [];

  const closeOnMobile = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      onClose();
    }
  };

  return (
    <aside
      id="dashboard-sidebar"
      className={cn(
        "fixed inset-y-0 left-0 top-14 z-50 flex w-56 flex-col overflow-hidden border-r border-gray-800 bg-black transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
        open
          ? "translate-x-0"
          : "-translate-x-full"
      )}
    >
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
              onClick={closeOnMobile}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-gray-900 text-white"
                  : "text-gray-300 hover:bg-gray-900"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        {adminItems.length > 0 && (
          <>
            <div className="my-3 border-t border-gray-800" />
            <p className="px-3 text-xs font-medium uppercase text-gray-500">
              {t("admin")}
            </p>
            {adminItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeOnMobile}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-gray-900 text-white"
                      : "text-gray-300 hover:bg-gray-900"
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
        <div className="border-t border-gray-800 p-3">
          <Link
            href="/dashboard/plans"
            onClick={closeOnMobile}
            className="block rounded-lg bg-black p-3 transition-colors hover:bg-gray-900"
          >
            <p className="text-xs font-medium text-gray-400">
              {t("currentPlan")}
            </p>
            <p className="text-sm font-semibold capitalize text-white">
              {tPlans(session.user.planId as "free" | "pro" | "agency")}
            </p>
          </Link>
        </div>
      )}
    </aside>
  );
}
