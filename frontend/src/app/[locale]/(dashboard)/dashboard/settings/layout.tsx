"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const pathname = usePathname();

  const basePath = `/${locale}/dashboard/settings`;

  const tabs = [
    { href: basePath, label: t("tabGeneral") },
    { href: `${basePath}/branding`, label: t("tabBranding") },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-white">
        {t("title")}
      </h1>

      <div className="flex gap-1 border-b border-gray-800">
        {tabs.map((tab) => {
          const isActive =
            tab.href === basePath
              ? pathname === basePath
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-colors -mb-px border-b-2",
                isActive
                  ? "border-copper text-white"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
