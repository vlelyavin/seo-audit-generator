"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils";

const SIDEBAR_STORAGE_KEY = "seo-audit.sidebar.open";
const SIDEBAR_WIDTH_MOBILE_CLASS = "translate-x-64";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const hasLoadedStoredState = useRef(false);
  const { data: session, status } = useSession();
  const locale = useLocale();
  const tNav = useTranslations("nav");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (saved !== null) {
        setSidebarOpen(saved === "true");
      } else {
        setSidebarOpen(window.innerWidth >= 1024);
      }
    } catch {
      // Ignore storage read errors and keep default state.
    } finally {
      hasLoadedStoredState.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedStoredState.current) return;
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarOpen));
    } catch {
      // Ignore storage write errors.
    }
  }, [sidebarOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white dark:border-white border-t-transparent dark:border-t-transparent" />
      </div>
    );
  }

  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  return (
    <div className="relative h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {sidebarOpen && (
        <button
          type="button"
          aria-label={tNav("closeSidebar")}
          className="fixed inset-x-0 bottom-0 top-14 z-40 bg-black/35 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div
        className={cn(
          "relative z-30 flex h-full flex-col transition-[padding-left,transform] duration-300 ease-out",
          sidebarOpen ? SIDEBAR_WIDTH_MOBILE_CLASS : "translate-x-0",
          sidebarOpen ? "lg:pl-64 lg:translate-x-0" : "lg:pl-0 lg:translate-x-0"
        )}
      >
        <Header
          sidebarOpen={sidebarOpen}
          onSidebarToggle={() => setSidebarOpen((prev) => !prev)}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
