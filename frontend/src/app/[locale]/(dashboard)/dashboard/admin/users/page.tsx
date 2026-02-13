"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { Shield, ChevronDown } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

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
        <Shield className="mx-auto mb-4 h-12 w-12 text-gray-300 dark:text-gray-600" />
        <p className="text-gray-500">{t("accessRequired")}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white dark:border-white border-t-transparent dark:border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">
        {t("title")} ({users.length})
      </h1>

      <div className="overflow-x-auto rounded-xl border dark:border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">{t("email")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">{t("name")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">{t("role")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">{t("plan")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">{t("audits")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">{t("joined")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-2 text-gray-900 dark:text-white">{user.email}</td>
                <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{user.name || "—"}</td>
                <td className="px-4 py-2">
                  <select
                    value={user.role}
                    onChange={(e) => updateUser(user.id, { role: e.target.value })}
                    className="rounded border bg-transparent px-1.5 py-0.5 text-xs dark:border-gray-600 dark:text-gray-300"
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="px-4 py-2">
                  <select
                    value={user.planId}
                    onChange={(e) => updateUser(user.id, { planId: e.target.value })}
                    className="rounded border bg-transparent px-1.5 py-0.5 text-xs dark:border-gray-600 dark:text-gray-300"
                  >
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                    <option value="agency">Agency</option>
                  </select>
                </td>
                <td className="px-4 py-2 text-gray-600 dark:text-gray-400">
                  {user._count.audits}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
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
