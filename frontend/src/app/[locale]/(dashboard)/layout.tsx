"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
// HIDDEN: Sidebar hidden from dashboard (component preserved)
// import { Sidebar } from "@/components/layout/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();

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
    <div className="relative min-h-dvh">
      {/* HIDDEN: Sidebar and overlay removed from render */}
      {/* <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} /> */}

      <Header />

      <main className="mx-auto max-w-6xl p-4 pt-2 lg:px-6">
        {children}
      </main>
    </div>
  );
}
