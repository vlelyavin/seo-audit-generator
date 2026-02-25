"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { Shield, ChevronDown } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
  planId: string;
  createdAt: string;
  _count: { audits: number };
}

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const t = useTranslations("admin");
  const tPlans = useTranslations("plans");
  const tBreadcrumbs = useTranslations("breadcrumbs");
  const locale = useLocale();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = session?.user?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;

    async function load() {
      try {
        const res = await fetch("/api/admin/users");
        if (res.ok) {
          setUsers(await res.json());
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, [isAdmin]);

  async function updateUser(userId: string, data: { role?: string; planId?: string }) {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...data }),
      });

      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, ...data } : u))
        );
      }
    } catch { /* ignore */ }
  }

  if (!isAdmin) {
    return (
      <div className="py-12 text-center">
        <Shield className="mx-auto mb-4 h-12 w-12 text-gray-600" />
        <p className="text-gray-500">{t("accessRequired")}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <Breadcrumbs items={[
        { label: tBreadcrumbs("dashboard"), href: `/${locale}/dashboard` },
        { label: tBreadcrumbs("admin"), href: `/${locale}/dashboard/admin` },
        { label: tBreadcrumbs("users") },
      ]} />
      <h1 className="mb-6 text-2xl font-bold text-white">
        {t("title")} ({users.length})
      </h1>

      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-gray-700 bg-gray-900">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">{t("email")}</th>
              <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500">{t("name")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">{t("role")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">{t("plan")}</th>
              <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500">{t("audits")}</th>
              <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500">{t("joined")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-gray-700 hover:bg-gray-900/50">
                <td className="px-4 py-2 text-white truncate max-w-[200px]">{user.email}</td>
                <td className="hidden sm:table-cell px-4 py-2 text-gray-400">{user.name || "—"}</td>
                <td className="px-4 py-2">
                  <select
                    value={user.role}
                    onChange={(e) => updateUser(user.id, { role: e.target.value })}
                    className="rounded border border-gray-600 bg-gray-900 px-1.5 py-1.5 text-base md:text-xs text-gray-300"
                  >
                    <option value="user">{t("roleUser")}</option>
                    <option value="admin">{t("roleAdmin")}</option>
                  </select>
                </td>
                <td className="px-4 py-2">
                  <select
                    value={user.planId}
                    onChange={(e) => updateUser(user.id, { planId: e.target.value })}
                    className="rounded border border-gray-600 bg-gray-900 px-1.5 py-1.5 text-base md:text-xs text-gray-300"
                  >
                    <option value="free">{tPlans("free")}</option>
                    <option value="pro">{tPlans("pro")}</option>
                    <option value="agency">{tPlans("agency")}</option>
                  </select>
                </td>
                <td className="hidden md:table-cell px-4 py-2 text-gray-400">
                  {user._count.audits}
                </td>
                <td className="hidden md:table-cell px-4 py-2 text-xs text-gray-500">
                  {formatDate(user.createdAt, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
