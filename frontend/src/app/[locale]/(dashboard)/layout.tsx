"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils";

const SIDEBAR_STORAGE_KEY = "seo-audit.sidebar.open";
const SIDEBAR_TRANSITION = "duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]";

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
      <div className="flex h-dvh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent" />
      </div>
    );
  }

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="relative h-dvh overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <button
        type="button"
        aria-label={tNav("closeSidebar")}
        className={cn(
          "fixed inset-x-0 bottom-0 top-14 z-40 bg-black/35 transition-opacity lg:hidden",
          SIDEBAR_TRANSITION,
          sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setSidebarOpen(false)}
      />

      <Header
        sidebarOpen={sidebarOpen}
        onSidebarToggle={() => setSidebarOpen((prev) => !prev)}
      />

      <div
        className={cn(
          "relative z-30 h-[calc(100%-3.5rem)] transition-[padding-left]",
          SIDEBAR_TRANSITION,
          sidebarOpen ? "lg:pl-56" : "lg:pl-0"
        )}
      >
        <main className="h-full overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
