"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import {
  Shield,
  Users,
  CreditCard,
  Activity,
  BarChart3,
  Search,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  Unlink,
  X,
  Check,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
  planId: string;
  indexingCredits: number;
  gscConnected: boolean;
  createdAt: string;
  auditsCount: number;
  lastAuditDate: string | null;
  hasGoogleAccount: boolean;
}

interface Stats {
  totalUsers: number;
  paidUsers: number;
  totalAudits: number;
  activeThisWeek: number;
}

type SortField = "createdAt" | "lastAudit" | "credits";
type SortOrder = "asc" | "desc";

export default function AdminDashboardPage() {
  const { data: session } = useSession();
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const tPlans = useTranslations("plans");
  const tBreadcrumbs = useTranslations("breadcrumbs");
  const locale = useLocale();

  const isAdmin = session?.user?.role === "admin";

  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Action state
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [editingCredits, setEditingCredits] = useState<string | null>(null);
  const [creditsValue, setCreditsValue] = useState("");
  const [confirmAction, setConfirmAction] = useState<{
    type: "delete" | "revokeGsc" | "revokeGoogle";
    userId: string;
    email: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats");
      if (res.ok) setStats(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (planFilter) params.set("plan", planFilter);
      if (sortBy === "credits") params.set("sortBy", "credits");
      params.set("sortOrder", sortOrder);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await fetch(`/api/admin/users?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
        setTotal(data.total);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [search, planFilter, sortBy, sortOrder, page]);

  useEffect(() => {
    if (!isAdmin) return;
    loadStats();
    loadUsers();
  }, [isAdmin, loadStats, loadUsers]);

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function toggleSort(field: SortField) {
    if (sortBy === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortBy !== field) return null;
    return sortOrder === "asc" ? (
      <ChevronUp className="inline h-3 w-3" />
    ) : (
      <ChevronDown className="inline h-3 w-3" />
    );
  }

  async function handlePlanChange(userId: string, planId: string) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, planId } : u))
        );
        loadStats();
      }
    } catch {
      /* ignore */
    }
  }

  async function handleCreditsSave(userId: string) {
    const credits = parseInt(creditsValue);
    if (isNaN(credits) || credits < 0) return;

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indexingCredits: credits }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId ? { ...u, indexingCredits: credits } : u
          )
        );
        setEditingCredits(null);
      }
    } catch {
      /* ignore */
    }
  }

  async function handleConfirmAction() {
    if (!confirmAction) return;
    setActionLoading(true);

    try {
      let url = "";
      let method = "POST";

      switch (confirmAction.type) {
        case "delete":
          url = `/api/admin/users/${confirmAction.userId}`;
          method = "DELETE";
          break;
        case "revokeGsc":
          url = `/api/admin/users/${confirmAction.userId}/revoke-gsc`;
          break;
        case "revokeGoogle":
          url = `/api/admin/users/${confirmAction.userId}/revoke-google`;
          break;
      }

      const res = await fetch(url, { method });
      if (res.ok) {
        if (confirmAction.type === "delete") {
          setUsers((prev) =>
            prev.filter((u) => u.id !== confirmAction.userId)
          );
          setTotal((t) => t - 1);
          loadStats();
        } else if (confirmAction.type === "revokeGsc") {
          setUsers((prev) =>
            prev.map((u) =>
              u.id === confirmAction.userId
                ? { ...u, gscConnected: false }
                : u
            )
          );
        } else if (confirmAction.type === "revokeGoogle") {
          setUsers((prev) =>
            prev.map((u) =>
              u.id === confirmAction.userId
                ? { ...u, gscConnected: false, hasGoogleAccount: false }
                : u
            )
          );
        }
        setConfirmAction(null);
      }
    } catch {
      /* ignore */
    } finally {
      setActionLoading(false);
    }
  }

  // Close action menu on outside click
  useEffect(() => {
    if (!actionMenu) return;
    const handler = () => {
      setActionMenu(null);
      setMenuPosition(null);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [actionMenu]);

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

  const totalPages = Math.ceil(total / pageSize);

  const confirmTitles: Record<string, string> = {
    delete: t("deleteAccount"),
    revokeGsc: t("revokeGsc"),
    revokeGoogle: t("revokeGoogle"),
  };

  const confirmMessages: Record<string, string> = {
    delete: t("confirmDeleteMessage"),
    revokeGsc: t("confirmRevokeGscMessage"),
    revokeGoogle: t("confirmRevokeGoogleMessage"),
  };

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[
          { label: tBreadcrumbs("dashboard"), href: `/${locale}/dashboard` },
          { label: tBreadcrumbs("admin") },
        ]} />
        <h1 className="text-2xl font-bold text-white">{t("title")}</h1>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Users}
            label={t("totalUsers")}
            value={stats.totalUsers}
            color="gray"
          />
          <StatCard
            icon={CreditCard}
            label={t("paidUsers")}
            value={stats.paidUsers}
            color="green"
          />
          <StatCard
            icon={Activity}
            label={t("activeThisWeek")}
            value={stats.activeThisWeek}
            color="yellow"
          />
          <StatCard
            icon={BarChart3}
            label={t("totalAudits")}
            value={stats.totalAudits}
            color="red"
          />
        </div>
      )}

      {/* User management */}
      <div className="rounded-xl border border-gray-800 bg-black">
        <div className="border-b border-gray-800 p-4">
          <h2 className="text-lg font-semibold text-white">
            {t("userManagement")} ({total})
          </h2>

          {/* Search & Filter */}
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("searchByEmail")}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 py-2 pl-9 pr-3 text-base md:text-sm text-white placeholder-gray-500 focus:border-copper focus:outline-none focus:ring-2 focus:ring-copper/20"
              />
            </div>
            <select
              value={planFilter}
              onChange={(e) => {
                setPlanFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-base md:text-sm text-gray-300 focus:border-copper focus:outline-none focus:ring-2 focus:ring-copper/20"
            >
              <option value="">{t("allPlans")}</option>
              <option value="free">{tPlans("free")}</option>
              <option value="pro">{tPlans("pro")}</option>
              <option value="agency">{tPlans("agency")}</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto pb-4">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-gray-700 bg-gray-900">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                  {t("email")}
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-gray-500 md:table-cell">
                  {t("name")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                  {t("plan")}
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-gray-500 sm:table-cell">
                  <button
                    onClick={() => toggleSort("credits")}
                    className="flex items-center gap-1 hover:text-gray-300"
                  >
                    {t("credits")} <SortIcon field="credits" />
                  </button>
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-gray-500 lg:table-cell">
                  {t("audits")}
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-gray-500 md:table-cell">
                  {t("gsc")}
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-gray-500 lg:table-cell">
                  <button
                    onClick={() => toggleSort("createdAt")}
                    className="flex items-center gap-1 hover:text-gray-300"
                  >
                    {t("registered")} <SortIcon field="createdAt" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  {t("actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-sm text-gray-500"
                  >
                    {t("noUsers")}
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-gray-700 last:border-b-0 hover:bg-gray-900/50"
                  >
                    {/* Email */}
                    <td className="px-4 py-2">
                      <span className="text-white">{user.email}</span>
                      {user.role === "admin" && (
                        <span className="ml-2 inline-flex rounded bg-copper/20 px-1.5 py-0.5 text-[10px] font-medium text-copper-light">
                          {t("roleAdmin")}
                        </span>
                      )}
                    </td>

                    {/* Name */}
                    <td className="hidden px-4 py-2 text-gray-400 md:table-cell">
                      {user.name || "—"}
                    </td>

                    {/* Plan */}
                    <td className="px-4 py-2">
                      <select
                        value={user.planId}
                        onChange={(e) =>
                          handlePlanChange(user.id, e.target.value)
                        }
                        className="rounded border border-gray-600 bg-gray-900 px-1.5 py-0.5 text-xs text-gray-300"
                      >
                        <option value="free">{tPlans("free")}</option>
                        <option value="pro">{tPlans("pro")}</option>
                        <option value="agency">{tPlans("agency")}</option>
                      </select>
                    </td>

                    {/* Credits */}
                    <td className="hidden px-4 py-2 sm:table-cell">
                      {editingCredits === user.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            value={creditsValue}
                            onChange={(e) => setCreditsValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                handleCreditsSave(user.id);
                              if (e.key === "Escape")
                                setEditingCredits(null);
                            }}
                            className="w-20 rounded border border-gray-600 bg-gray-900 px-2 py-0.5 text-base md:text-xs text-white"
                            autoFocus
                          />
                          <button
                            onClick={() => handleCreditsSave(user.id)}
                            className="rounded p-0.5 text-green-400 hover:bg-green-900/20"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingCredits(null)}
                            className="rounded p-0.5 text-gray-400 hover:bg-gray-900"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingCredits(user.id);
                            setCreditsValue(String(user.indexingCredits));
                          }}
                          className="group/credits flex items-center gap-1 text-gray-400"
                        >
                          <span>{user.indexingCredits}</span>
                          <Pencil className="h-3 w-3 opacity-100 lg:opacity-0 lg:group-hover/credits:opacity-100" />
                        </button>
                      )}
                    </td>

                    {/* Audits */}
                    <td className="hidden px-4 py-2 lg:table-cell">
                      <span className="text-gray-400">
                        {user.auditsCount}
                      </span>
                      {user.lastAuditDate && (
                        <span className="ml-1 text-[11px] text-gray-600">
                          ({formatDate(user.lastAuditDate, locale)})
                        </span>
                      )}
                    </td>

                    {/* GSC */}
                    <td className="hidden px-4 py-2 md:table-cell">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                          user.gscConnected
                            ? "bg-green-900/35 text-green-400"
                            : "bg-gray-900 text-gray-500"
                        )}
                      >
                        {user.gscConnected ? t("yes") : t("no")}
                      </span>
                    </td>

                    {/* Registered */}
                    <td className="hidden px-4 py-2 text-xs text-gray-500 lg:table-cell">
                      {formatDate(user.createdAt, locale)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-2 text-right">
                      <div className="relative inline-block">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (actionMenu === user.id) {
                              setActionMenu(null);
                              setMenuPosition(null);
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              if (window.innerWidth >= 1024) {
                                setMenuPosition({
                                  top: rect.bottom + 4,
                                  left: Math.max(8, rect.right - 192),
                                });
                              } else {
                                setMenuPosition(null);
                              }
                              setActionMenu(user.id);
                            }
                          }}
                          className="rounded-md p-2.5 text-gray-400 hover:bg-gray-900 hover:text-gray-200"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>

                        {actionMenu === user.id && (
                          <>
                            {/* Backdrop */}
                            <div
                              className={cn(
                                "fixed inset-0 z-40",
                                !menuPosition && "bg-black/50"
                              )}
                              onClick={() => {
                                setActionMenu(null);
                                setMenuPosition(null);
                              }}
                            />
                            {/* Menu */}
                            <div
                              className={cn(
                                "fixed z-50 border-gray-700 bg-gray-900 shadow-xl",
                                menuPosition
                                  ? "w-48 rounded-lg border py-1"
                                  : "inset-x-0 bottom-0 rounded-t-xl border-t p-4"
                              )}
                              style={
                                menuPosition
                                  ? { top: menuPosition.top, left: menuPosition.left }
                                  : undefined
                              }
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Mobile close header */}
                              {!menuPosition && (
                                <div className="mb-3 flex items-center justify-between">
                                  <span className="text-sm font-medium text-gray-300">
                                    {user.email}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setActionMenu(null);
                                      setMenuPosition(null);
                                    }}
                                    className="rounded-md p-2 text-gray-400 hover:bg-gray-700"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              )}

                              <button
                                onClick={() => {
                                  setEditingCredits(user.id);
                                  setCreditsValue(
                                    String(user.indexingCredits)
                                  );
                                  setActionMenu(null);
                                  setMenuPosition(null);
                                }}
                                className={cn(
                                  "flex w-full items-center gap-2 text-left text-gray-300 hover:bg-gray-700",
                                  menuPosition ? "px-3 py-2 text-xs" : "px-3 py-3 text-sm"
                                )}
                              >
                                <Pencil className={cn(menuPosition ? "h-3.5 w-3.5" : "h-4 w-4")} />
                                {t("editCredits")}
                              </button>

                              {user.gscConnected && (
                                <button
                                  onClick={() => {
                                    setConfirmAction({
                                      type: "revokeGsc",
                                      userId: user.id,
                                      email: user.email,
                                    });
                                    setActionMenu(null);
                                    setMenuPosition(null);
                                  }}
                                  className={cn(
                                    "flex w-full items-center gap-2 text-left text-gray-300 hover:bg-gray-700",
                                    menuPosition ? "px-3 py-2 text-xs" : "px-3 py-3 text-sm"
                                  )}
                                >
                                  <Unlink className={cn(menuPosition ? "h-3.5 w-3.5" : "h-4 w-4")} />
                                  {t("revokeGsc")}
                                </button>
                              )}

                              {user.hasGoogleAccount && (
                                <button
                                  onClick={() => {
                                    setConfirmAction({
                                      type: "revokeGoogle",
                                      userId: user.id,
                                      email: user.email,
                                    });
                                    setActionMenu(null);
                                    setMenuPosition(null);
                                  }}
                                  className={cn(
                                    "flex w-full items-center gap-2 text-left text-gray-300 hover:bg-gray-700",
                                    menuPosition ? "px-3 py-2 text-xs" : "px-3 py-3 text-sm"
                                  )}
                                >
                                  <Unlink className={cn(menuPosition ? "h-3.5 w-3.5" : "h-4 w-4")} />
                                  {t("revokeGoogle")}
                                </button>
                              )}

                              <div className="my-1 border-t border-gray-700" />

                              <button
                                onClick={() => {
                                  setConfirmAction({
                                    type: "delete",
                                    userId: user.id,
                                    email: user.email,
                                  });
                                  setActionMenu(null);
                                  setMenuPosition(null);
                                }}
                                className={cn(
                                  "flex w-full items-center gap-2 text-left text-red-400 hover:bg-gray-700",
                                  menuPosition ? "px-3 py-2 text-xs" : "px-3 py-3 text-sm"
                                )}
                              >
                                <Trash2 className={cn(menuPosition ? "h-3.5 w-3.5" : "h-4 w-4")} />
                                {t("deleteAccount")}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-800 px-4 py-3">
            <p className="text-xs text-gray-500">
              {t("showing")} {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, total)} {t("of")} {total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-md border border-gray-700 px-3 py-1 text-xs text-gray-300 hover:bg-gray-900 disabled:opacity-40"
              >
                {t("prev")}
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-md border border-gray-700 px-3 py-1 text-xs text-gray-300 hover:bg-gray-900 disabled:opacity-40"
              >
                {t("next")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirmAction}
        title={confirmAction ? confirmTitles[confirmAction.type] : ""}
        message={
          confirmAction
            ? `${confirmMessages[confirmAction.type]} (${confirmAction.email})`
            : ""
        }
        confirmText={
          actionLoading ? tCommon("loading") : tCommon("delete")
        }
        cancelText={tCommon("cancel")}
        loading={actionLoading}
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: "gray" | "green" | "yellow" | "red";
}) {
  const colorClasses = {
    gray: "bg-gray-900 text-white",
    green: "bg-green-900/35 text-green-400",
    yellow: "bg-yellow-900/35 text-yellow-400",
    red: "bg-red-900/35 text-red-400",
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-black p-4">
      <div className="flex items-center gap-3">
        <div className={cn("rounded-lg p-2", colorClasses[color])}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-[11px] leading-tight whitespace-nowrap text-gray-400 sm:text-xs">
            {label}
          </p>
        </div>
      </div>
    </div>
  );
}
