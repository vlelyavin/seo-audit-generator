"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Search,
  RefreshCw,
  Link2,
  Link2Off,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Play,
  ShieldCheck,
  CreditCard,
  ExternalLink,
  Info,
  ChevronLeft,
  ChevronRight,
  Loader2,
  BarChart3,
  X,
  Trash2,
  Key,
  Send,
  Download,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GscStatus {
  connected: boolean;
  hasRequiredScopes: boolean;
  email: string | null;
  scopes: string[];
  connectedAt: string | null;
}

interface Site {
  id: string;
  domain: string;
  gscPermissionLevel: string | null;
  autoIndexGoogle: boolean;
  autoIndexBing: boolean;
  sitemapUrl: string | null;
  indexnowKey: string | null;
  indexnowKeyVerified: boolean;
  lastSyncedAt: string | null;
  totalUrls: number;
  indexedCount: number;
  submissionCounts: Record<string, number>;
}

interface SiteStats {
  total: number;
  indexed: number;
  notIndexed: number;
  pending: number;
  submittedGoogle: number;
  submittedBing: number;
  failed: number;
  is404s: number;
}

interface Quota {
  googleSubmissions: { used: number; limit: number; remaining: number };
  inspections: { used: number; limit: number; remaining: number };
}

interface UrlRecord {
  id: string;
  url: string;
  gscStatus: string | null;
  indexingStatus: string;
  submissionMethod: string;
  submittedAt: string | null;
  lastSyncedAt: string | null;
  lastInspectedAt: string | null;
  httpStatus: number | null;
  errorMessage: string | null;
}

interface UrlPage {
  urls: UrlRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface Report {
  today: {
    newPagesDetected: number;
    newPagesList: string[];
    submittedGoogle: number;
    submittedBing: number;
    failed: number;
    pages404: number;
    pages404List: string[];
  };
  overall: {
    total: number;
    indexed: number;
    notIndexed: number;
    pending: number;
  };
  quota: {
    googleUsed: number;
    googleLimit: number;
    googleRemaining: number;
  };
}

interface CreditPack {
  id: string;
  credits: number;
  price: number;
  price_formatted: string;
}

interface ConfirmState {
  siteId: string;
  urlIds: string[];
  engines: string[];
  count: number;
}

interface RunStatus {
  phase: "running" | "done" | "error";
  newUrls?: number;
  changedUrls?: number;
  removedUrls?: number;
  submittedGoogle?: number;
  submittedBing?: number;
  failedGoogle?: number;
  failedBing?: number;
  errorMsg?: string;
  ranAt?: string; // ISO string
}

interface LogEntry {
  id: string;
  action: string;
  label: string;
  url: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

interface LogPage {
  logs: LogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  availableActions: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string | null | undefined, t?: ReturnType<typeof useTranslations<"indexing">>): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t ? t("relativeJustNow") : "just now";
  if (mins < 60) return t ? t("relativeMinutes", { count: mins }) : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t ? t("relativeHours", { count: hrs }) : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return t ? t("relativeDays", { count: days }) : `${days}d ago`;
}

function gscStatusColor(
  status: string | null | undefined,
  t?: ReturnType<typeof useTranslations<"indexing">>
): { bg: string; text: string; label: string } {
  const l = (key: string, fallback: string) => t ? t(key as Parameters<typeof t>[0]) : fallback;
  if (!status)
    return { bg: "bg-gray-900", text: "text-gray-400", label: l("statusUnknown", "Unknown") };
  const s = status.toLowerCase();
  if (s.includes("submitted and indexed") || s === "indexed")
    return { bg: "bg-green-900/35", text: "text-green-400", label: l("statusIndexed", "Indexed") };
  if (s.includes("crawled") && s.includes("not indexed"))
    return {
      bg: "bg-orange-900/35",
      text: "text-orange-400",
      label: l("statusNotIndexed", "Not indexed"),
    };
  if (s.includes("discovered"))
    return {
      bg: "bg-yellow-900/35",
      text: "text-yellow-400",
      label: l("statusDiscovered", "Discovered"),
    };
  if (
    s.includes("blocked") ||
    s.includes("not found") ||
    s.includes("soft 404") ||
    s.includes("server error") ||
    s.includes("noindex")
  )
    return { bg: "bg-red-900/35", text: "text-red-400", label: l("statusBlocked", "Blocked") };
  if (s.includes("redirect") || s.includes("duplicate"))
    return {
      bg: "bg-yellow-900/35",
      text: "text-yellow-400",
      label: l("statusRedirect", "Redirect"),
    };
  return { bg: "bg-gray-900", text: "text-gray-400", label: l("statusUnknown", "Unknown") };
}

function ourStatusColor(status: string, t?: ReturnType<typeof useTranslations<"indexing">>): {
  bg: string;
  text: string;
  label: string;
} {
  const l = (key: string, fallback: string) => t ? t(key as Parameters<typeof t>[0]) : fallback;
  switch (status) {
    case "submitted":
      return {
        bg: "bg-copper/10",
        text: "text-copper-light",
        label: l("submitted", "Submitted"),
      };
    case "failed":
      return { bg: "bg-red-900/35", text: "text-red-400", label: l("failed", "Failed") };
    case "pending":
      return {
        bg: "bg-yellow-900/35",
        text: "text-yellow-400",
        label: l("pending", "Pending"),
      };
    case "removal_requested":
      return {
        bg: "bg-orange-900/35",
        text: "text-orange-400",
        label: l("statusRemovalSent", "Removal sent"),
      };
    default:
      return {
        bg: "bg-gray-900",
        text: "text-gray-500",
        label: l("notSubmitted", "Not submitted"),
      };
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IndexingPage() {
  const t = useTranslations("indexing");
  const tBreadcrumbs = useTranslations("breadcrumbs");
  const locale = useLocale();

  // GSC + sites state
  const [gscStatus, setGscStatus] = useState<GscStatus | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [syncingSites, setSyncingSites] = useState(false);
  const [expandedSite, setExpandedSite] = useState<string | null>(null);
  const [siteStats, setSiteStats] = useState<Record<string, SiteStats>>({});
  const [siteQuotas, setSiteQuotas] = useState<Record<string, Quota>>({});
  const [globalQuota, setGlobalQuota] = useState<Quota | null>(null);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [runStatuses, setRunStatuses] = useState<Record<string, RunStatus>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Credits state
  const [credits, setCredits] = useState<number | null>(null);
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [buyingPack, setBuyingPack] = useState<string | null>(null);

  // Submit confirmation state
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Disconnect modal state
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [disconnectMode, setDisconnectMode] = useState<"keep" | "delete" | null>(null);

  // Polling refs
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expandedSiteRef = useRef<string | null>(null);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Load GSC status ────────────────────────────────────────────────────────

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch("/api/indexing/gsc/status");
      if (res.ok) setGscStatus(await res.json());
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  // ── Load credits ──────────────────────────────────────────────────────────

  const loadCredits = useCallback(async () => {
    const res = await fetch("/api/indexing/credits");
    if (res.ok) {
      const data = await res.json();
      setCredits(data.credits ?? 0);
    }
  }, []);

  // ── Load credit packs ─────────────────────────────────────────────────────

  const loadCreditPacks = useCallback(async () => {
    const res = await fetch("/api/indexing/credits/packs");
    if (res.ok) setCreditPacks(await res.json());
  }, []);

  // ── Load sites ────────────────────────────────────────────────────────────

  const loadSites = useCallback(async () => {
    const res = await fetch("/api/indexing/sites");
    if (res.ok) {
      const data = await res.json();
      setSites(data.sites ?? []);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadSites();
    loadCredits();
    loadCreditPacks();
  }, [loadStatus, loadSites, loadCredits, loadCreditPacks]);

  // ── Reconnect / Disconnect ────────────────────────────────────────────────

  const handleReconnect = async () => {
    const res = await fetch("/api/indexing/gsc/reconnect", { method: "POST" });
    if (res.ok) {
      const { authUrl } = await res.json();
      window.location.href = authUrl;
    }
  };

  const handleDisconnect = () => {
    setShowDisconnectModal(true);
  };

  const handleDisconnectConfirm = async (deleteData: boolean) => {
    setDisconnectMode(deleteData ? "delete" : "keep");
    try {
      const res = await fetch(
        `/api/indexing/gsc/disconnect?deleteData=${deleteData}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        await loadStatus();
        if (deleteData) setSites([]);
        showToast(
          deleteData
            ? t("disconnectedDeleteData")
            : t("disconnectedKeepData")
        );
      }
    } finally {
      setDisconnectMode(null);
      setShowDisconnectModal(false);
    }
  };

  // ── Sync sites from GSC ───────────────────────────────────────────────────

  const syncSites = async () => {
    setSyncingSites(true);
    try {
      const res = await fetch("/api/indexing/sites/sync", { method: "POST" });
      if (res.ok) {
        await loadSites();
        await loadStatus();
        showToast(t("successSync"));
      } else {
        showToast(t("errorSync"), false);
      }
    } finally {
      setSyncingSites(false);
    }
  };

  // ── Expand site — load stats + quota ─────────────────────────────────────

  const toggleSite = async (siteId: string) => {
    if (expandedSite === siteId) {
      setExpandedSite(null);
      return;
    }
    setExpandedSite(siteId);
    await Promise.all([loadSiteStats(siteId), loadSiteQuota(siteId)]);
  };

  const loadSiteStats = useCallback(async (siteId: string) => {
    const res = await fetch(`/api/indexing/sites/${siteId}/stats`);
    if (res.ok) {
      const data = await res.json();
      setSiteStats((prev) => ({ ...prev, [siteId]: data }));
    }
  }, []);

  const loadSiteQuota = useCallback(async (siteId: string) => {
    const res = await fetch(`/api/indexing/sites/${siteId}/quota`);
    if (res.ok) {
      const data = await res.json();
      setSiteQuotas((prev) => ({ ...prev, [siteId]: data }));
      setGlobalQuota(data);
    }
  }, []);

  // Load global quota from the first available site when sites load
  useEffect(() => {
    if (sites.length > 0 && !globalQuota) {
      loadSiteQuota(sites[0].id);
    }
  }, [sites, globalQuota, loadSiteQuota]);

  // Keep ref in sync with expanded site state (avoids stale closure in polling)
  useEffect(() => {
    expandedSiteRef.current = expandedSite;
  }, [expandedSite]);

  // Poll every 10 s while the page is open; clean up on unmount
  useEffect(() => {
    pollIntervalRef.current = setInterval(() => {
      void loadSites();
      void loadCredits();
      const siteId = expandedSiteRef.current;
      if (siteId) {
        void loadSiteStats(siteId);
        void loadSiteQuota(siteId);
      }
    }, 10_000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [loadSites, loadCredits, loadSiteStats, loadSiteQuota]);

  // ── Sync URLs for a site ──────────────────────────────────────────────────

  const syncUrls = async (siteId: string) => {
    setSyncing((prev) => ({ ...prev, [siteId]: true }));
    try {
      const res = await fetch(`/api/indexing/sites/${siteId}/sync-urls`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        await loadSiteStats(siteId);
        showToast(t("syncUrlsSuccess", { total: data.totalUrls ?? 0 }));
      } else {
        showToast(t("errorSync"), false);
      }
    } finally {
      setSyncing((prev) => ({ ...prev, [siteId]: false }));
    }
  };

  // ── Submit (with optional confirmation) ───────────────────────────────────

  const requestSubmit = useCallback(
    (siteId: string, urlIds: string[], engines: string[], count: number) => {
      setConfirmState({ siteId, urlIds, engines, count });
    },
    []
  );

  const executeSubmit = async () => {
    if (!confirmState) return;
    const { siteId, urlIds, engines, count } = confirmState;

    setSubmitting(true);
    try {
      const body =
        urlIds.length === 0
          ? { all_not_indexed: true, engines }
          : { url_ids: urlIds, engines };

      const res = await fetch(`/api/indexing/sites/${siteId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 402) {
        const data = await res.json();
        showToast(
          t("notEnoughCredits", {
            required: data.required,
            available: data.available,
          }),
          false
        );
        setConfirmState(null);
        return;
      }

      if (res.ok) {
        const data = await res.json();
        showToast(
          t("submitResult", {
            google: data.submitted_google,
            bing: data.submitted_bing,
            skipped: data.skipped_404 ?? 0,
          })
        );
        if (data.credits_remaining !== undefined)
          setCredits(data.credits_remaining);
        await loadSiteStats(siteId);
        await loadSiteQuota(siteId);
      } else {
        showToast(t("errorSubmit"), false);
      }
    } finally {
      setSubmitting(false);
      setConfirmState(null);
      void count;
    }
  };

  // ── Toggle auto-index ────────────────────────────────────────────────────

  const toggleAutoIndex = async (
    siteId: string,
    engine: "google" | "bing",
    value: boolean
  ) => {
    const res = await fetch(`/api/indexing/sites/${siteId}/auto-index`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [engine]: value }),
    });
    if (res.ok) {
      setSites((prev) =>
        prev.map((s) =>
          s.id === siteId
            ? {
                ...s,
                autoIndexGoogle:
                  engine === "google" ? value : s.autoIndexGoogle,
                autoIndexBing: engine === "bing" ? value : s.autoIndexBing,
              }
            : s
        )
      );
    }
  };

  // ── Run auto-index now ────────────────────────────────────────────────────

  const runNow = async (siteId: string) => {
    setRunning((prev) => ({ ...prev, [siteId]: true }));
    setRunStatuses((prev) => ({ ...prev, [siteId]: { phase: "running" } }));
    try {
      const res = await fetch(`/api/indexing/sites/${siteId}/run-auto-index`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setRunStatuses((prev) => ({
          ...prev,
          [siteId]: {
            phase: "done",
            newUrls: data.newUrls,
            changedUrls: data.changedUrls,
            removedUrls: data.removedUrls,
            submittedGoogle: data.submittedGoogle,
            submittedBing: data.submittedBing,
            failedGoogle: data.failedGoogle,
            failedBing: data.failedBing,
            ranAt: new Date().toISOString(),
          },
        }));
        await loadSiteStats(siteId);
        await loadSiteQuota(siteId);
        await loadCredits();
      } else {
        const data = await res.json().catch(() => ({}));
        setRunStatuses((prev) => ({
          ...prev,
          [siteId]: {
            phase: "error",
            errorMsg: data.error ?? "Unknown error",
            ranAt: new Date().toISOString(),
          },
        }));
      }
    } catch (e) {
      setRunStatuses((prev) => ({
        ...prev,
        [siteId]: {
          phase: "error",
          errorMsg: e instanceof Error ? e.message : "Network error",
          ranAt: new Date().toISOString(),
        },
      }));
    } finally {
      setRunning((prev) => ({ ...prev, [siteId]: false }));
    }
  };

  // ── Mark site as IndexNow-verified / failed in local state ───────────────

  const handleVerifySuccess = useCallback((siteId: string) => {
    setSites((prev) =>
      prev.map((s) => (s.id === siteId ? { ...s, indexnowKeyVerified: true } : s))
    );
  }, []);

  const handleVerifyFail = useCallback((siteId: string) => {
    setSites((prev) =>
      prev.map((s) => (s.id === siteId ? { ...s, indexnowKeyVerified: false } : s))
    );
  }, []);

  // ── Copy IndexNow key ─────────────────────────────────────────────────────

  const copyKey = async (key: string) => {
    await navigator.clipboard.writeText(key);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  // ── Buy credits ───────────────────────────────────────────────────────────

  const buyCredits = async (packId: string) => {
    setBuyingPack(packId);
    try {
      const res = await fetch("/api/indexing/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack: packId }),
      });
      if (res.ok) {
        const { checkout_url } = await res.json();
        window.open(checkout_url, "_blank");
        setShowCreditModal(false);
      } else {
        showToast(t("checkoutFailed"), false);
      }
    } finally {
      setBuyingPack(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingStatus) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    );
  }

  const isConnected = gscStatus?.connected && gscStatus.hasRequiredScopes;
  const creditsLow = credits !== null && credits < 10;

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 rounded-lg border px-5 py-3 text-sm font-medium shadow-xl",
            toast.ok
              ? "border-green-800 bg-green-900/35 text-green-300"
              : "border-red-800 bg-red-900/35 text-red-300"
          )}
        >
          {toast.msg}
        </div>
      )}

      {/* Breadcrumbs + Header */}
      <div>
        <Breadcrumbs items={[
          { label: tBreadcrumbs("dashboard"), href: `/${locale}/dashboard` },
          { label: tBreadcrumbs("indexing") },
        ]} />
        <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">{t("title")}</h1>

        {/* Credits indicator */}
        {credits !== null && (
          <button
            onClick={() => setShowCreditModal(true)}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-80",
              credits === 0
                ? "border-red-800 bg-red-900/35 text-red-400"
                : creditsLow
                  ? "border-orange-800 bg-orange-900/35 text-orange-400"
                  : "border-gray-700 bg-black text-gray-300"
            )}
          >
            <CreditCard className="h-4 w-4" />
            {credits === 0
              ? t("noCredits")
              : t("creditsRemaining", { count: credits })}
          </button>
        )}
        </div>
      </div>

      {/* GSC Connection Card */}
      <div className="rounded-xl border border-gray-800 bg-black p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {t("gscTitle")}
            </h2>
            <p className="mt-1 text-sm text-gray-400">{t("connectDesc")}</p>
          </div>
        </div>

        {/* GSC account status container */}
        <div className="mt-3 flex items-center gap-3 rounded-md border border-gray-800 bg-gray-950 px-3 py-2.5">
          <div className="flex flex-1 items-center gap-2 min-w-0">
            {isConnected ? (
              <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-gray-500 shrink-0" />
            )}
            <span className="text-sm text-gray-300 truncate">
              {gscStatus?.email ?? t("notConnected")}
            </span>
          </div>
          {isConnected && (
            <span className="shrink-0 text-xs font-medium text-green-400">
              {t("connected")}
            </span>
          )}
        </div>

        {gscStatus?.connected && !gscStatus.hasRequiredScopes && (
          <p className="mt-2 text-sm text-yellow-400">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
            {t("missingScopes")}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          {!isConnected ? (
            <button
              onClick={handleReconnect}
              className="flex items-center gap-2 rounded-md bg-gradient-to-r from-copper to-copper-light px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Link2 className="h-4 w-4" />
              {gscStatus?.connected ? t("reconnect") : t("connectGoogle")}
            </button>
          ) : (
            <>
              <button
                onClick={syncSites}
                disabled={syncingSites}
                className="flex items-center gap-2 rounded-md bg-gradient-to-r from-copper to-copper-light px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <RefreshCw
                  className={cn("h-4 w-4", syncingSites && "animate-spin")}
                />
                {syncingSites ? t("syncing") : t("syncSites")}
              </button>
              <button
                onClick={handleDisconnect}
                className="flex items-center gap-2 rounded-md border border-gray-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-red-700 hover:text-red-400"
              >
                <Link2Off className="h-4 w-4" />
                {t("disconnect")}
              </button>
            </>
          )}
        </div>

        {/* Quota — account-level, shown once globally below the sync button */}
        {isConnected && globalQuota && (
          <div className="mt-5 rounded-lg border border-gray-800 bg-gray-950 p-4 space-y-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              {t("quota")}
            </p>
            <QuotaBar
              label={t("googleQuota")}
              used={globalQuota.googleSubmissions.used}
              limit={globalQuota.googleSubmissions.limit}
            />
            <QuotaBar
              label={t("inspectionQuota")}
              used={globalQuota.inspections.used}
              limit={globalQuota.inspections.limit}
            />
          </div>
        )}
      </div>

      {/* Sites list — shown when connected OR when data was retained after disconnect */}
      {(isConnected || sites.length > 0) && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">{t("sites")}</h2>

          {sites.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-black p-10 text-center">
              <Search className="mx-auto h-10 w-10 text-gray-600 mb-3" />
              <p className="text-gray-400 text-sm">{t("noSites")}</p>
              <p className="text-gray-600 text-xs mt-1">
                {t("connectDesc")}
              </p>
            </div>
          ) : (
            sites.map((site) => (
              <SiteCard
                key={site.id}
                site={site}
                expanded={expandedSite === site.id}
                gscConnected={isConnected ?? false}
                stats={siteStats[site.id]}
                quota={siteQuotas[site.id]}
                syncingUrls={syncing[site.id] ?? false}
                running={running[site.id] ?? false}
                runStatus={runStatuses[site.id]}
                copied={copied}
                credits={credits}
                t={t}
                onToggle={() => toggleSite(site.id)}
                onSyncUrls={() => syncUrls(site.id)}
                onRequestSubmit={requestSubmit}
                onToggleAutoGoogle={(v) => toggleAutoIndex(site.id, "google", v)}
                onToggleAutoBing={(v) => toggleAutoIndex(site.id, "bing", v)}
                onRunNow={() => runNow(site.id)}
                onCopyKey={(k) => copyKey(k)}
                onVerifySuccess={() => handleVerifySuccess(site.id)}
                onVerifyFail={() => handleVerifyFail(site.id)}
                showToast={showToast}
              />
            ))
          )}
        </div>
      )}

      {/* Credit packs modal */}
      {showCreditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowCreditModal(false)}
          />
          <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-gray-800 bg-black p-6 shadow-xl">
            {/* Close button */}
            <button
              onClick={() => setShowCreditModal(false)}
              className="absolute right-4 top-4 rounded-md p-2 text-gray-400 hover:bg-gray-900 hover:text-gray-200 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            {/* Icon */}
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-copper/10">
              <CreditCard className="h-6 w-6 text-copper" />
            </div>
            {/* Title */}
            <h3 className="mb-2 text-lg font-semibold text-white">
              {t("creditPacks")}
            </h3>
            <p className="text-sm text-gray-400 mb-5">{t("creditPacksDesc")}</p>
            {credits !== null && (
              <p className="text-sm text-gray-300 mb-4">
                {t("creditsRemaining", { count: credits })}
              </p>
            )}
            <div className="space-y-3">
              {creditPacks.map((pack) => (
                <div
                  key={pack.id}
                  className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950 p-4"
                >
                  <div>
                    <p className="font-medium text-white capitalize">
                      {pack.id}
                    </p>
                    <p className="text-sm text-gray-400">
                      {t("creditsCount", { count: pack.credits })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-white font-semibold">
                      {pack.price_formatted}
                    </span>
                    <button
                      onClick={() => buyCredits(pack.id)}
                      disabled={buyingPack !== null}
                      className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-copper to-copper-light px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {buyingPack === pack.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        t("buyCredits")
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Submit confirmation dialog */}
      {confirmState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !submitting && setConfirmState(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-gray-800 bg-black p-6 shadow-xl">
            {/* Close button */}
            <button
              onClick={() => !submitting && setConfirmState(null)}
              disabled={submitting}
              className="absolute right-4 top-4 rounded-md p-2 text-gray-400 hover:bg-gray-900 hover:text-gray-200 disabled:opacity-50 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            {/* Icon */}
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-copper/10">
              <Send className="h-6 w-6 text-copper" />
            </div>
            {/* Title */}
            <h3 className="mb-2 text-base font-semibold text-white">
              {t("confirmSubmitTitle")}
            </h3>
            <p className="mb-5 text-sm text-gray-300">
              {confirmState.engines.includes("google") &&
              !confirmState.engines.includes("bing")
                ? t("confirmSubmitGoogle", {
                    count: confirmState.count,
                    remaining: credits ?? 0,
                  })
                : confirmState.engines.includes("bing") &&
                    !confirmState.engines.includes("google")
                  ? t("confirmSubmitBing", { count: confirmState.count })
                  : t("confirmSubmitBoth", { count: confirmState.count })}
            </p>
            {/* Actions: primary LEFT, cancel RIGHT */}
            <div className="flex gap-3">
              <button
                onClick={executeSubmit}
                disabled={submitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-gradient-to-r from-copper to-copper-light px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {submitting && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                {t("confirm")}
              </button>
              <button
                onClick={() => setConfirmState(null)}
                disabled={submitting}
                className="flex-1 rounded-md border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 transition-colors hover:bg-gray-900 disabled:opacity-50"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect confirmation modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !disconnectMode && setShowDisconnectModal(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-gray-800 bg-black p-6 shadow-xl">
            {/* Close button */}
            <button
              onClick={() => !disconnectMode && setShowDisconnectModal(false)}
              disabled={!!disconnectMode}
              className="absolute right-4 top-4 rounded-md p-2 text-gray-400 hover:bg-gray-900 hover:text-gray-200 transition-colors disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
            {/* Icon */}
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
              <Link2Off className="h-6 w-6 text-red-400" />
            </div>
            {/* Title + description */}
            <h3 className="mb-2 text-base font-semibold text-white">
              {t("disconnectTitle")}
            </h3>
            <p className="mb-6 text-sm text-gray-400">
              {t("disconnectDescription")}
            </p>
            {/* Buttons: Keep Data (left, accent) | Delete All Data (right, red) */}
            <div className="flex gap-3">
              <button
                onClick={() => handleDisconnectConfirm(false)}
                disabled={!!disconnectMode}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-copper to-copper-light px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {disconnectMode === "keep" && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {t("keepData")}
              </button>
              <button
                onClick={() => handleDisconnectConfirm(true)}
                disabled={!!disconnectMode}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-800 bg-red-950/50 px-4 py-2.5 text-sm font-semibold text-red-400 transition-colors hover:bg-red-900/30 disabled:opacity-50"
              >
                {disconnectMode === "delete" && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {t("deleteAllData")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Site Card ─────────────────────────────────────────────────────────────────

function SiteCard({
  site,
  expanded,
  gscConnected,
  stats,
  quota,
  syncingUrls,
  running,
  runStatus,
  copied,
  credits,
  t,
  onToggle,
  onSyncUrls,
  onRequestSubmit,
  onToggleAutoGoogle,
  onToggleAutoBing,
  onRunNow,
  onCopyKey,
  onVerifySuccess,
  onVerifyFail,
  showToast,
}: {
  site: Site;
  expanded: boolean;
  gscConnected: boolean;
  stats?: SiteStats;
  quota?: Quota;
  syncingUrls: boolean;
  running: boolean;
  runStatus?: RunStatus;
  copied: string | null;
  credits: number | null;
  t: ReturnType<typeof useTranslations<"indexing">>;
  onToggle: () => void;
  onSyncUrls: () => void;
  onRequestSubmit: (
    siteId: string,
    urlIds: string[],
    engines: string[],
    count: number
  ) => void;
  onToggleAutoGoogle: (v: boolean) => void;
  onToggleAutoBing: (v: boolean) => void;
  onRunNow: () => void;
  onCopyKey: (k: string) => void;
  onVerifySuccess: () => void;
  onVerifyFail: () => void;
  showToast: (msg: string, ok?: boolean) => void;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "urls" | "report" | "log">(
    "overview"
  );

  // URL table state
  const [urlPage, setUrlPage] = useState<UrlPage | null>(null);
  const [loadingUrls, setLoadingUrls] = useState(false);
  const [urlFilter, setUrlFilter] = useState("all");
  const [urlSearch, setUrlSearch] = useState("");
  const [urlCurrentPage, setUrlCurrentPage] = useState(1);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [inspecting, setInspecting] = useState<Record<string, boolean>>({});
  const [removingUrl, setRemovingUrl] = useState<Record<string, boolean>>({});
  const [urlSortCol, setUrlSortCol] = useState<"url" | "gscStatus" | "ourStatus" | "lastSynced" | null>(null);
  const [urlSortDir, setUrlSortDir] = useState<"asc" | "desc">("asc");

  function handleUrlSort(col: "url" | "gscStatus" | "ourStatus" | "lastSynced") {
    if (urlSortCol === col) {
      setUrlSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setUrlSortCol(col);
      setUrlSortDir("asc");
    }
  }

  const sortedUrls = urlPage
    ? [...urlPage.urls].sort((a, b) => {
        if (!urlSortCol) return 0;
        let aVal: string | null = null;
        let bVal: string | null = null;
        if (urlSortCol === "url") { aVal = a.url; bVal = b.url; }
        else if (urlSortCol === "gscStatus") { aVal = a.gscStatus; bVal = b.gscStatus; }
        else if (urlSortCol === "ourStatus") { aVal = a.indexingStatus; bVal = b.indexingStatus; }
        else if (urlSortCol === "lastSynced") { aVal = a.lastSyncedAt; bVal = b.lastSyncedAt; }
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        const cmp = aVal.localeCompare(bVal);
        return urlSortDir === "asc" ? cmp : -cmp;
      })
    : [];

  // Report state
  const [report, setReport] = useState<Report | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Log state
  const [logPage, setLogPage] = useState<LogPage | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);
  const [logFilter, setLogFilter] = useState("all");
  const [logCurrentPage, setLogCurrentPage] = useState(1);

  // IndexNow verification modal state: null = closed, else holds the action to run after verify
  const [indexNowModal, setIndexNowModal] = useState<{ action: () => void } | null>(null);

  // Re-verify state
  const [reVerifying, setReVerifying] = useState(false);

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastSynced = site.lastSyncedAt
    ? new Date(site.lastSyncedAt).toLocaleString()
    : t("never");

  // ── Load URLs ────────────────────────────────────────────────────────────

  const loadUrls = useCallback(
    async (filter: string, page: number, search: string) => {
      setLoadingUrls(true);
      try {
        const params = new URLSearchParams({
          status: filter,
          page: String(page),
          q: search,
        });
        const res = await fetch(
          `/api/indexing/sites/${site.id}/urls?${params}`
        );
        if (res.ok) setUrlPage(await res.json());
      } finally {
        setLoadingUrls(false);
      }
    },
    [site.id]
  );

  // ── Load report ───────────────────────────────────────────────────────────

  const loadReport = useCallback(async () => {
    setLoadingReport(true);
    try {
      const res = await fetch(`/api/indexing/sites/${site.id}/report`);
      if (res.ok) setReport(await res.json());
    } finally {
      setLoadingReport(false);
    }
  }, [site.id]);

  // ── Load log ──────────────────────────────────────────────────────────────

  const loadLog = useCallback(
    async (filter: string, page: number) => {
      setLoadingLog(true);
      try {
        const params = new URLSearchParams({ action: filter, page: String(page) });
        const res = await fetch(`/api/indexing/sites/${site.id}/logs?${params}`);
        if (res.ok) setLogPage(await res.json());
      } finally {
        setLoadingLog(false);
      }
    },
    [site.id]
  );

  // Load URLs/report/log when tabs become active
  useEffect(() => {
    if (!expanded) return;
    if (activeTab === "urls" && !urlPage) loadUrls(urlFilter, 1, urlSearch);
    if (activeTab === "report" && !report) loadReport();
    if (activeTab === "log" && !logPage) loadLog(logFilter, 1);
  }, [expanded, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when filter/page changes
  useEffect(() => {
    if (!expanded || activeTab !== "urls") return;
    loadUrls(urlFilter, urlCurrentPage, urlSearch);
  }, [urlFilter, urlCurrentPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch log when filter/page changes
  useEffect(() => {
    if (!expanded || activeTab !== "log") return;
    loadLog(logFilter, logCurrentPage);
  }, [logFilter, logCurrentPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = (val: string) => {
    setUrlSearch(val);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setUrlCurrentPage(1);
      loadUrls(urlFilter, 1, val);
    }, 350);
  };

  const handleFilterChange = (f: string) => {
    setUrlFilter(f);
    setUrlCurrentPage(1);
    setSelectedUrls(new Set());
  };

  // ── Inspect URL ───────────────────────────────────────────────────────────

  const inspectUrl = async (url: string) => {
    setInspecting((prev) => ({ ...prev, [url]: true }));
    try {
      const res = await fetch(`/api/indexing/sites/${site.id}/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [url] }),
      });
      if (res.status === 429) {
        showToast(t("inspectionLimitReached"), false);
        return;
      }
      if (res.ok) {
        await loadUrls(urlFilter, urlCurrentPage, urlSearch);
        showToast(t("inspectComplete"));
      }
    } finally {
      setInspecting((prev) => ({ ...prev, [url]: false }));
    }
  };

  // ── Bulk inspect ─────────────────────────────────────────────────────────

  const bulkInspect = async () => {
    const urlsToInspect = urlPage?.urls
      .filter((u) => selectedUrls.has(u.id))
      .map((u) => u.url) ?? [];
    if (urlsToInspect.length === 0) return;

    const res = await fetch(`/api/indexing/sites/${site.id}/inspect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: urlsToInspect }),
    });
    if (res.status === 429) {
      showToast(t("inspectionLimitReached"), false);
      return;
    }
    if (res.ok) {
      await loadUrls(urlFilter, urlCurrentPage, urlSearch);
      setSelectedUrls(new Set());
    }
  };

  // ── IndexNow submit guard (with live pre-operation verification check) ──────

  const bingSubmit = async (action: () => void) => {
    if (!site.indexnowKeyVerified) {
      setIndexNowModal({ action });
      return;
    }
    // Live pre-operation check
    try {
      const res = await fetch(`/api/indexing/sites/${site.id}/verify-key`);
      const data = await res.json();
      if (data.verified) {
        action();
      } else {
        onVerifyFail();
        setIndexNowModal({ action });
      }
    } catch {
      showToast(t("indexnowVerifyNetworkError"), false);
    }
  };

  // ── Re-verify IndexNow key manually ──────────────────────────────────────

  const reVerify = async () => {
    setReVerifying(true);
    try {
      const res = await fetch(`/api/indexing/sites/${site.id}/verify-key`);
      const data = await res.json();
      if (data.verified) {
        onVerifySuccess();
        showToast(t("indexnowVerifySuccess"), true);
      } else {
        onVerifyFail();
        setIndexNowModal({ action: () => {} });
      }
    } catch {
      showToast(t("indexnowVerifyNetworkError"), false);
    } finally {
      setReVerifying(false);
    }
  };

  // ── Request URL removal from Google ──────────────────────────────────────

  const requestRemoval = async (urlId: string) => {
    setRemovingUrl((prev) => ({ ...prev, [urlId]: true }));
    try {
      const res = await fetch(
        `/api/indexing/sites/${site.id}/request-removal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urlId }),
        }
      );
      if (res.ok) {
        showToast(t("removalRequestSent"));
        await loadUrls(urlFilter, urlCurrentPage, urlSearch);
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error ?? t("removalRequestFailed"), false);
      }
    } finally {
      setRemovingUrl((prev) => ({ ...prev, [urlId]: false }));
    }
  };

  // ── Checkbox helpers ─────────────────────────────────────────────────────

  const allOnPageSelected =
    (urlPage?.urls.length ?? 0) > 0 &&
    (urlPage?.urls.every((u) => selectedUrls.has(u.id)) ?? false);

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelectedUrls(new Set());
    } else {
      setSelectedUrls(new Set(urlPage?.urls.map((u) => u.id) ?? []));
    }
  };

  const toggleUrl = (id: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Tabs ─────────────────────────────────────────────────────────────────

  const TABS = [
    { id: "overview" as const, label: t("tabOverview") },
    { id: "urls" as const, label: t("tabUrls") },
    { id: "report" as const, label: t("tabReport") },
    { id: "log" as const, label: t("tabLog") },
  ];

  const LOG_FILTERS = [
    { id: "all", label: t("logFilterAll") },
    { id: "submitted_google", label: t("logFilterGoogle") },
    { id: "submitted_indexnow", label: t("logFilterBing") },
    { id: "failed", label: t("logFilterFailed") },
    { id: "url_discovered", label: t("logFilterDiscovered") },
    { id: "url_removed", label: t("logFilterRemoved") },
    { id: "url_404", label: t("logFilter404") },
    { id: "removal_requested", label: t("logFilterRemoval") },
  ];

  const URL_FILTERS = [
    { id: "all", label: t("filterAll") },
    { id: "indexed", label: t("filterIndexed") },
    { id: "not_indexed", label: t("filterNotIndexed") },
    { id: "submitted", label: t("filterSubmitted") },
    { id: "failed", label: t("filterFailed") },
    { id: "404", label: t("filter404") },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-black">
      {/* Header row */}
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 sm:px-6 py-4 text-left hover:bg-gray-900/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Search className="h-5 w-5 text-copper shrink-0" />
          <div>
            <p className="font-medium text-white">{site.domain}</p>
            <p className="text-xs text-gray-500">
              {t("lastSynced")}: {lastSynced}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex gap-4 text-sm">
            <StatPill label={t("total")} value={site.totalUrls} color="gray" />
            <StatPill
              label={t("indexed")}
              value={site.indexedCount}
              color="green"
            />
            <StatPill
              label={t("notIndexed")}
              value={Math.max(0, site.totalUrls - site.indexedCount)}
              color="red"
            />
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-800">
          {/* Tabs */}
          <div className="flex overflow-hidden border-b border-gray-800 px-4 sm:px-6">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "shrink-0 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                  activeTab === tab.id
                    ? "border-copper text-white"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Overview Tab ─────────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-5">
              {/* Stats row */}
              {stats ? (
                <div className="flex flex-wrap gap-3 [&>*]:min-w-[100px] [&>*]:flex-1">
                  <StatBox label={t("total")} value={stats.total} />
                  <StatBox
                    label={t("indexed")}
                    value={stats.indexed}
                    color="green"
                  />
                  <StatBox
                    label={t("notIndexed")}
                    value={stats.notIndexed}
                    color="red"
                  />
                  <StatBox
                    label={t("pending")}
                    value={stats.pending}
                    color="yellow"
                  />
                  <StatBox
                    label={t("submitted")}
                    value={stats.submittedGoogle + stats.submittedBing}
                    color="blue"
                  />
                  <StatBox
                    label={t("failed")}
                    value={stats.failed}
                    color="red"
                  />
                  <StatBox
                    label={t("pages404")}
                    value={stats.is404s}
                    color="orange"
                  />
                </div>
              ) : (
                <div className="flex flex-wrap gap-3 [&>*]:min-w-[100px] [&>*]:flex-1">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-16 rounded-lg border border-gray-800 bg-gray-950 animate-pulse"
                    />
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={onSyncUrls}
                  disabled={syncingUrls}
                  className="flex items-center gap-1.5 rounded-md border border-gray-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-900 disabled:opacity-50"
                >
                  <RefreshCw
                    className={cn(
                      "h-3.5 w-3.5",
                      syncingUrls && "animate-spin"
                    )}
                  />
                  {t("syncUrls")}
                </button>

                <button
                  onClick={() =>
                    onRequestSubmit(
                      site.id,
                      [],
                      ["google"],
                      stats?.notIndexed ?? 0
                    )
                  }
                  disabled={
                    !stats?.notIndexed ||
                    quota?.googleSubmissions.remaining === 0
                  }
                  className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-copper to-copper-light px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {t("submitAllNotIndexed")} (Google)
                </button>

                {site.indexnowKey && (
                  <button
                    onClick={() =>
                      bingSubmit(() =>
                        onRequestSubmit(site.id, [], ["bing"], stats?.notIndexed ?? 0)
                      )
                    }
                    disabled={!stats?.notIndexed}
                    className="flex items-center gap-1.5 rounded-md border border-gray-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-900 disabled:opacity-50"
                  >
                    {t("submitAllNotIndexed")} (Bing)
                  </button>
                )}

                {(site.autoIndexGoogle || site.autoIndexBing) && (
                  <button
                    onClick={onRunNow}
                    disabled={running}
                    className="flex items-center gap-1.5 rounded-md border border-gray-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-900 disabled:opacity-50"
                  >
                    {running ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {running ? t("running") : t("runNow")}
                  </button>
                )}
              </div>

              {/* Auto-index toggles */}
              <div className="space-y-3">
                <Toggle
                  label={t("autoIndexGoogle")}
                  tooltip={t("tooltipAutoGoogle")}
                  checked={site.autoIndexGoogle}
                  onChange={onToggleAutoGoogle}
                />
                <Toggle
                  label={t("autoIndexBing")}
                  tooltip={
                    !site.indexnowKeyVerified
                      ? t("tooltipAutoBingDisabled")
                      : t("tooltipAutoBing")
                  }
                  checked={site.autoIndexBing}
                  onChange={onToggleAutoBing}
                  disabled={!site.indexnowKeyVerified}
                  onDisabledClick={() => setIndexNowModal({ action: () => {} })}
                />
              </div>

              {/* IndexNow key status + Re-verify button */}
              {site.indexnowKey && (
                <div className="flex items-center gap-2 flex-wrap">
                  {site.indexnowKeyVerified ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-900/35 px-3 py-1 text-xs font-medium text-green-400">
                      <CheckCircle className="h-3.5 w-3.5" />
                      {t("indexnowVerified")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-900/35 px-3 py-1 text-xs font-medium text-yellow-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {t("indexnowNotVerified")}
                    </span>
                  )}
                  <button
                    onClick={reVerify}
                    disabled={reVerifying}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={cn("h-3 w-3", reVerifying && "animate-spin")} />
                    {reVerifying ? t("verifying") : t("reVerify")}
                  </button>
                </div>
              )}

              {/* Run Now status panel */}
              {runStatus && (
                <div
                  className={cn(
                    "rounded-lg border px-4 py-3 text-sm",
                    runStatus.phase === "running" &&
                      "border-gray-700 bg-gray-950 text-gray-300",
                    runStatus.phase === "done" &&
                      "border-green-900/40 bg-green-900/10 text-green-300",
                    runStatus.phase === "error" &&
                      "border-red-900/40 bg-red-900/10 text-red-400"
                  )}
                >
                  {runStatus.phase === "running" && (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                      {t("runStatusRunning")}
                    </span>
                  )}
                  {runStatus.phase === "done" && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-medium">
                        <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {t("runStatusCompleted")}{" "}
                          <span className="text-xs font-normal text-green-500/70">
                            {relativeTime(runStatus.ranAt, t)}
                          </span>
                        </span>
                      </div>
                      <p className="text-xs text-green-400/80 pl-5">
                        {t("runStatusSummary", { newUrls: runStatus.newUrls ?? 0, changedUrls: runStatus.changedUrls ?? 0, removedUrls: runStatus.removedUrls ?? 0, submittedGoogle: runStatus.submittedGoogle ?? 0, submittedBing: runStatus.submittedBing ?? 0 })}
                        {(runStatus.failedGoogle ?? 0) + (runStatus.failedBing ?? 0) > 0 && (
                          <span className="text-red-400"> · {t("runStatusFailed", { count: (runStatus.failedGoogle ?? 0) + (runStatus.failedBing ?? 0) })}</span>
                        )}
                      </p>
                    </div>
                  )}
                  {runStatus.phase === "error" && (
                    <div className="flex items-start gap-2">
                      <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        {t("runStatusError")}{" "}
                        <span className="text-xs font-normal text-red-400/70">
                          {relativeTime(runStatus.ranAt, t)}
                        </span>
                        {runStatus.errorMsg && (
                          <span className="block text-xs mt-0.5 text-red-400/80">
                            {runStatus.errorMsg}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── URLs Tab ─────────────────────────────────────────────────── */}
          {activeTab === "urls" && (
            <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-4">
              {/* Filter tabs + search row */}
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-1">
                  {URL_FILTERS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => handleFilterChange(f.id)}
                      className={cn(
                        "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                        urlFilter === f.id
                          ? "bg-gradient-to-r from-copper to-copper-light text-white"
                          : "bg-gray-900 text-gray-400 hover:text-white"
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={urlSearch}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder={t("searchUrls")}
                    className="flex-1 min-w-0 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-base md:text-xs text-white placeholder-gray-500 outline-none transition-colors focus:border-copper focus:ring-2 focus:ring-copper/20"
                  />
                  <button
                    onClick={() => loadUrls(urlFilter, urlCurrentPage, urlSearch)}
                    className="shrink-0 rounded-md border border-gray-700 p-2 text-gray-400 hover:bg-gray-900 hover:text-white transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Bulk action bar */}
              {selectedUrls.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5">
                  <span className="text-sm text-gray-300 mr-1">
                    {t("selectedCount", { count: selectedUrls.size })}
                  </span>
                  <button
                    onClick={() =>
                      onRequestSubmit(
                        site.id,
                        [...selectedUrls],
                        ["google"],
                        selectedUrls.size
                      )
                    }
                    disabled={
                      quota?.googleSubmissions.remaining === 0
                    }
                    className="rounded-md bg-gradient-to-r from-copper to-copper-light px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {t("submitToGoogle")}
                  </button>
                  {site.indexnowKey && (
                    <button
                      onClick={() =>
                        bingSubmit(() =>
                          onRequestSubmit(site.id, [...selectedUrls], ["bing"], selectedUrls.size)
                        )
                      }
                      className="rounded-md border border-gray-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-gray-700"
                    >
                      {t("submitToBing")}
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedUrls(new Set())}
                    className="ml-auto rounded-md p-2 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Google quota warning */}
              {quota && quota.googleSubmissions.remaining === 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-900/35 px-3 py-2 text-xs text-red-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {t("quotaExhausted")}
                </div>
              )}

              {/* URL table */}
              {loadingUrls ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-12 rounded-lg border border-gray-800 bg-gray-950 animate-pulse"
                    />
                  ))}
                </div>
              ) : !urlPage || urlPage.urls.length === 0 ? (
                <div className="rounded-lg border border-gray-800 bg-gray-950 p-10 text-center">
                  <Search className="mx-auto h-8 w-8 text-gray-600 mb-2" />
                  <p className="text-sm text-gray-400">
                    {urlPage?.total === 0 && urlFilter === "all" && !urlSearch
                      ? t("noUrls")
                      : t("urlTableEmpty")}
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile card list */}
                  <div className="md:hidden space-y-2">
                    {sortedUrls.map((url) => {
                      const gsc = gscStatusColor(url.gscStatus, t);
                      const our = ourStatusColor(url.indexingStatus, t);
                      const isInspecting = inspecting[url.url] ?? false;
                      return (
                        <div key={url.id} className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                          <div className="flex items-start gap-2.5">
                            {/* Checkbox */}
                            <Checkbox
                              checked={selectedUrls.has(url.id)}
                              onChange={() => toggleUrl(url.id)}
                              className="mt-0.5"
                            />
                            {/* Content */}
                            <div className="flex-1 min-w-0 space-y-1.5">
                              {/* URL */}
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-xs text-gray-200 min-w-0" title={url.url}>
                                  {url.url}
                                </span>
                                <a
                                  href={url.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 text-gray-500 hover:text-white transition"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                              {/* Status badges */}
                              <div className="flex flex-wrap gap-1.5">
                                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs", gsc.bg, gsc.text)}>
                                  {gsc.label}
                                </span>
                                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs", our.bg, our.text)}>
                                  {our.label}
                                </span>
                              </div>
                              {/* Timestamps */}
                              <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                                {url.lastSyncedAt && <span>{t("syncedTime", { time: relativeTime(url.lastSyncedAt, t) })}</span>}
                                {url.lastInspectedAt && <span>{t("inspectedTime", { time: relativeTime(url.lastInspectedAt, t) })}</span>}
                              </div>
                            </div>
                            {/* Action buttons */}
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => inspectUrl(url.url)}
                                disabled={isInspecting || !gscConnected}
                                title={!gscConnected ? t("reconnectRequired") : t("inspect")}
                                className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-700 text-gray-400 transition-colors hover:bg-gray-900 hover:text-white disabled:opacity-50"
                              >
                                {isInspecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                onClick={() => onRequestSubmit(site.id, [url.id], ["google"], 1)}
                                title={!gscConnected ? t("reconnectRequired") : t("submitToGoogle")}
                                disabled={!gscConnected || quota?.googleSubmissions.remaining === 0}
                                className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-700 text-xs font-semibold text-gray-400 transition-colors hover:bg-copper/20 hover:text-copper-light hover:border-copper/30 disabled:opacity-50"
                              >
                                G
                              </button>
                              {site.indexnowKey && (
                                <button
                                  onClick={() => bingSubmit(() => onRequestSubmit(site.id, [url.id], ["bing"], 1))}
                                  title={t("submitToBing")}
                                  className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-700 text-xs font-semibold text-gray-400 transition-colors hover:bg-gray-900 hover:text-white"
                                >
                                  B
                                </button>
                              )}
                              <button
                                onClick={() => requestRemoval(url.id)}
                                disabled={removingUrl[url.id] || url.indexingStatus === "removal_requested"}
                                title={t("requestRemoval")}
                                className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-700 text-gray-400 transition-colors hover:bg-red-900/20 hover:text-red-400 hover:border-red-900/40 disabled:opacity-50"
                              >
                                {removingUrl[url.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-800">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10">
                        <tr className="border-b border-gray-800 bg-gray-950">
                          <th className="w-10 px-3 py-3 text-left">
                            <Checkbox
                              checked={allOnPageSelected}
                              onChange={toggleSelectAll}
                            />
                          </th>
                          <th
                            className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200"
                            onClick={() => handleUrlSort("url")}
                          >
                            <span className="flex items-center gap-1">{t("urlHeader")}<ArrowUpDown className="h-3 w-3" /></span>
                          </th>
                          <th
                            className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200"
                            onClick={() => handleUrlSort("gscStatus")}
                          >
                            <span className="flex items-center gap-1">{t("gscStatus")}<ArrowUpDown className="h-3 w-3" /></span>
                          </th>
                          <th
                            className="hidden sm:table-cell px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200"
                            onClick={() => handleUrlSort("ourStatus")}
                          >
                            <span className="flex items-center gap-1">{t("ourStatus")}<ArrowUpDown className="h-3 w-3" /></span>
                          </th>
                          <th
                            className="hidden lg:table-cell px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200"
                            onClick={() => handleUrlSort("lastSynced")}
                          >
                            <span className="flex items-center gap-1">{t("lastSynced")}<ArrowUpDown className="h-3 w-3" /></span>
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            {t("actions")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {sortedUrls.map((url) => {
                          const gsc = gscStatusColor(url.gscStatus, t);
                          const our = ourStatusColor(url.indexingStatus, t);
                          const isInspecting = inspecting[url.url] ?? false;

                          return (
                            <tr
                              key={url.id}
                              className="hover:bg-gray-900/50 transition-colors"
                            >
                              <td className="px-3 py-3">
                                <Checkbox
                                  checked={selectedUrls.has(url.id)}
                                  onChange={() => toggleUrl(url.id)}
                                />
                              </td>
                              <td className="px-4 py-3 max-w-xs">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="truncate text-gray-200 text-xs"
                                    title={url.url}
                                  >
                                    {url.url}
                                  </span>
                                  <a
                                    href={url.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 text-gray-500 hover:text-white transition"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                                {/* Mobile: show statuses inline */}
                                <div className="flex gap-1.5 mt-1 md:hidden">
                                  <span
                                    className={cn(
                                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs",
                                      gsc.bg,
                                      gsc.text
                                    )}
                                  >
                                    {gsc.label}
                                  </span>
                                  <span
                                    className={cn(
                                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs",
                                      our.bg,
                                      our.text
                                    )}
                                  >
                                    {our.label}
                                  </span>
                                </div>
                              </td>
                              <td className="hidden md:table-cell px-4 py-3">
                                <div className="space-y-0.5">
                                  <GscStatusBadge
                                    status={url.gscStatus}
                                    gsc={gsc}
                                    t={t}
                                  />
                                  {url.lastInspectedAt && (
                                    <p className="text-xs text-gray-600">
                                      {t("inspectedTime", { time: relativeTime(url.lastInspectedAt, t) })}
                                    </p>
                                  )}
                                </div>
                              </td>
                              <td className="hidden sm:table-cell px-4 py-3">
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
                                    our.bg,
                                    our.text
                                  )}
                                >
                                  {our.label}
                                </span>
                              </td>
                              <td className="hidden lg:table-cell px-4 py-3 text-xs text-gray-500">
                                {relativeTime(url.lastSyncedAt, t)}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => inspectUrl(url.url)}
                                    disabled={isInspecting || !gscConnected}
                                    title={!gscConnected ? t("reconnectRequired") : t("inspect")}
                                    className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 text-gray-400 transition-colors hover:bg-gray-900 hover:text-white disabled:opacity-50"
                                  >
                                    {isInspecting ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Search className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() =>
                                      onRequestSubmit(
                                        site.id,
                                        [url.id],
                                        ["google"],
                                        1
                                      )
                                    }
                                    title={!gscConnected ? t("reconnectRequired") : t("submitToGoogle")}
                                    disabled={
                                      !gscConnected ||
                                      quota?.googleSubmissions.remaining === 0
                                    }
                                    className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 text-xs font-semibold text-gray-400 transition-colors hover:bg-copper/20 hover:text-copper-light hover:border-copper/30 disabled:opacity-50"
                                  >
                                    G
                                  </button>
                                  {site.indexnowKey && (
                                    <button
                                      onClick={() =>
                                        bingSubmit(() =>
                                          onRequestSubmit(site.id, [url.id], ["bing"], 1)
                                        )
                                      }
                                      title={t("submitToBing")}
                                      className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 text-xs font-semibold text-gray-400 transition-colors hover:bg-gray-900 hover:text-white"
                                    >
                                      B
                                    </button>
                                  )}
                                  <button
                                    onClick={() => requestRemoval(url.id)}
                                    disabled={
                                      removingUrl[url.id] ||
                                      url.indexingStatus === "removal_requested"
                                    }
                                    title={t("requestRemovalTooltip")}
                                    className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 text-gray-400 transition-colors hover:bg-red-900/20 hover:text-red-400 hover:border-red-900/40 disabled:opacity-50"
                                  >
                                    {removingUrl[url.id] ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {urlPage.totalPages > 1 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-xs text-gray-500">
                        {t("pageOf", {
                          page: urlPage.page,
                          total: urlPage.totalPages,
                        })}
                        {" · "}
                        {t("totalUrls", { total: urlPage.total })}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setUrlCurrentPage((p) => Math.max(1, p - 1));
                          }}
                          disabled={urlCurrentPage <= 1}
                          className="flex items-center gap-1 rounded-md border border-gray-700 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-gray-900 disabled:opacity-40"
                        >
                          <ChevronLeft className="h-3 w-3" />
                          {t("prevPage")}
                        </button>
                        <button
                          onClick={() => {
                            setUrlCurrentPage((p) =>
                              Math.min(urlPage.totalPages, p + 1)
                            );
                          }}
                          disabled={urlCurrentPage >= urlPage.totalPages}
                          className="flex items-center gap-1 rounded-md border border-gray-700 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-gray-900 disabled:opacity-40"
                        >
                          {t("nextPage")}
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Log Tab ──────────────────────────────────────────────────── */}
          {activeTab === "log" && (
            <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-4">
              {/* Filter + refresh row */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1">
                  {LOG_FILTERS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => {
                        setLogFilter(f.id);
                        setLogCurrentPage(1);
                        setLogPage(null);
                      }}
                      className={cn(
                        "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                        logFilter === f.id
                          ? "bg-gradient-to-r from-copper to-copper-light text-white"
                          : "bg-gray-900 text-gray-400 hover:text-white"
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setLogPage(null);
                    loadLog(logFilter, logCurrentPage);
                  }}
                  className="rounded-md border border-gray-700 px-2 text-gray-400 hover:bg-gray-900 hover:text-white transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Log entries */}
              {loadingLog ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-10 rounded-lg border border-gray-800 bg-gray-950 animate-pulse"
                    />
                  ))}
                </div>
              ) : !logPage || logPage.logs.length === 0 ? (
                <div className="rounded-lg border border-gray-800 bg-gray-950 p-10 text-center">
                  <BarChart3 className="mx-auto h-8 w-8 text-gray-600 mb-2" />
                  <p className="text-sm text-gray-400">{t("noLogs")}</p>
                </div>
              ) : (
                <>
                  <div className="overflow-hidden rounded-lg border border-gray-800 divide-y divide-gray-800">
                    {logPage.logs.map((entry) => {
                      const { dot, text } = logActionColor(entry.action);
                      return (
                        <div
                          key={entry.id}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-gray-900/40 transition-colors"
                        >
                          {/* Colored dot */}
                          <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />

                          {/* Label */}
                          <span className={cn("text-xs font-medium shrink-0 w-24 sm:w-40", text)}>
                            {entry.label}
                          </span>

                          {/* URL */}
                          {entry.url ? (
                            <span className="flex-1 flex items-center gap-1.5 min-w-0">
                              <span
                                className="truncate text-xs text-gray-300"
                                title={entry.url}
                              >
                                {entry.url}
                              </span>
                              <a
                                href={entry.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 text-gray-500 hover:text-white transition"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </span>
                          ) : (
                            <span className="flex-1 text-xs text-gray-600">—</span>
                          )}

                          {/* Timestamp */}
                          <span className="shrink-0 text-xs text-gray-500">
                            {relativeTime(entry.createdAt, t)}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination */}
                  {logPage.totalPages > 1 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-xs text-gray-500">
                        {t("logPageOf", { page: logPage.page, total: logPage.totalPages, entries: logPage.total })}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setLogCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={logCurrentPage <= 1}
                          className="flex items-center gap-1 rounded-md border border-gray-700 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-gray-900 disabled:opacity-40"
                        >
                          <ChevronLeft className="h-3 w-3" />
                          {t("prevPage")}
                        </button>
                        <button
                          onClick={() =>
                            setLogCurrentPage((p) => Math.min(logPage.totalPages, p + 1))
                          }
                          disabled={logCurrentPage >= logPage.totalPages}
                          className="flex items-center gap-1 rounded-md border border-gray-700 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-gray-900 disabled:opacity-40"
                        >
                          {t("nextPage")}
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Report Tab ───────────────────────────────────────────────── */}
          {activeTab === "report" && (
            <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-5">
              <h3 className="text-sm font-semibold text-white">
                {t("todayReport")}
              </h3>

              {loadingReport ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-16 rounded-lg border border-gray-800 bg-gray-950 animate-pulse"
                    />
                  ))}
                </div>
              ) : !report ? (
                <div className="rounded-lg border border-gray-800 bg-gray-950 p-10 text-center">
                  <BarChart3 className="mx-auto h-8 w-8 text-gray-600 mb-2" />
                  <p className="text-sm text-gray-400">{t("noReport")}</p>
                </div>
              ) : (
                <>
                  {/* Overall coverage */}
                  <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                      {t("indexedCoverage", {
                        indexed: report.overall.indexed,
                        total: report.overall.total,
                      })}
                    </p>
                    {report.overall.total > 0 && (
                      <div className="h-2 w-full rounded-full bg-gray-900">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-copper to-copper-light transition-all"
                          style={{
                            width: `${Math.round((report.overall.indexed / report.overall.total) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {report.overall.total > 0
                        ? t("percentIndexed", { percent: Math.round((report.overall.indexed / report.overall.total) * 100) })
                        : t("noDataYet")}
                    </p>
                  </div>

                  {/* Today's stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatBox
                      label={t("newPages")}
                      value={report.today.newPagesDetected}
                      color="blue"
                    />
                    <StatBox
                      label={t("submittedGoogle")}
                      value={report.today.submittedGoogle}
                      color="green"
                    />
                    <StatBox
                      label={t("submittedBing")}
                      value={report.today.submittedBing}
                      color="orange"
                    />
                    <StatBox
                      label={t("pages404Found")}
                      value={report.today.pages404}
                      color="red"
                    />
                  </div>

                  {/* Quota */}
                  <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                      {t("googleQuota")}
                    </p>
                    <QuotaBar
                      label=""
                      used={report.quota.googleUsed}
                      limit={report.quota.googleLimit}
                      usedLabel={t("quotaUsed", { used: report.quota.googleUsed })}
                      limitLabel={t("quotaLimit", { limit: report.quota.googleLimit })}
                    />
                  </div>

                  {/* New pages list */}
                  {report.today.newPagesList.length > 0 && (
                    <ExpandableList
                      title={t("newPages")}
                      items={report.today.newPagesList}
                      showLessLabel={t("showLess")}
                      showAllLabel={t("showAll", { count: report.today.newPagesList.length })}
                    />
                  )}

                  {/* 404 list */}
                  {report.today.pages404List.length > 0 && (
                    <ExpandableList
                      title={t("pages404Found")}
                      items={report.today.pages404List}
                      danger
                      showLessLabel={t("showLess")}
                      showAllLabel={t("showAll", { count: report.today.pages404List.length })}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* IndexNow key verification modal */}
      {indexNowModal && site.indexnowKey && (
        <IndexNowVerifyModal
          site={site}
          onClose={() => setIndexNowModal(null)}
          onProceed={() => {
            const action = indexNowModal.action;
            setIndexNowModal(null);
            action();
          }}
          onVerifySuccess={onVerifySuccess}
          t={t}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function GscStatusBadge({
  status,
  gsc,
  t,
}: {
  status: string | null;
  gsc: { bg: string; text: string; label: string };
  t: ReturnType<typeof useTranslations<"indexing">>;
}) {
  const [showTip, setShowTip] = useState(false);
  const tip = status ? getTip(status, t) : null;

  return (
    <div className="relative inline-flex items-center gap-1">
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
          gsc.bg,
          gsc.text
        )}
      >
        {gsc.label}
      </span>
      {tip && tip !== status && (
        <button
          className="text-gray-500 hover:text-gray-300 transition-colors"
          onMouseEnter={() => setShowTip(true)}
          onMouseLeave={() => setShowTip(false)}
        >
          <Info className="h-3.5 w-3.5" />
          {showTip && (
            <div className="absolute bottom-full left-0 mb-2 w-56 rounded-lg border border-gray-800 bg-black p-2.5 text-xs text-gray-300 shadow-xl z-10 text-left">
              {tip}
            </div>
          )}
        </button>
      )}
    </div>
  );
}

function getTip(gscStatus: string, t: ReturnType<typeof useTranslations<"indexing">>): string {
  const tips: Record<string, string> = {
    "Crawled - currently not indexed": t("tipCrawledNotIndexed"),
    "Discovered - currently not indexed": t("tipDiscoveredNotIndexed"),
    "URL is unknown to Google": t("tipUnknownToGoogle"),
    "Blocked by robots.txt": t("tipBlockedRobots"),
    "Blocked due to noindex": t("tipBlockedNoindex"),
    "Soft 404": t("tipSoft404"),
    "Not found (404)": t("tipNotFound404"),
    "Submitted and indexed": t("tipIndexed"),
    Indexed: t("tipIndexed"),
  };
  return tips[gscStatus] ?? gscStatus;
}

function logActionColor(action: string): { dot: string; text: string } {
  switch (action) {
    case "submitted_google":
      return { dot: "bg-green-400", text: "text-green-400" };
    case "submitted_indexnow":
      return { dot: "bg-copper-light", text: "text-copper-light" };
    case "failed":
      return { dot: "bg-red-400", text: "text-red-400" };
    case "url_discovered":
      return { dot: "bg-blue-400", text: "text-blue-400" };
    case "url_removed":
      return { dot: "bg-orange-400", text: "text-orange-400" };
    case "url_404":
      return { dot: "bg-red-500", text: "text-red-500" };
    case "removal_requested":
      return { dot: "bg-orange-400", text: "text-orange-400" };
    default:
      return { dot: "bg-gray-400", text: "text-gray-400" };
  }
}

function ExpandableList({
  title,
  items,
  danger = false,
  showLessLabel = "Show less",
  showAllLabel,
}: {
  title: string;
  items: string[];
  danger?: boolean;
  showLessLabel?: string;
  showAllLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, 5);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          {title} ({items.length})
        </p>
        {items.length > 5 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-gray-500 hover:text-white transition"
          >
            {expanded ? showLessLabel : (showAllLabel ?? `Show all ${items.length}`)}
          </button>
        )}
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {shown.map((url) => (
          <div key={url} className="flex items-center gap-2">
            <span
              className={cn(
                "truncate text-xs",
                danger ? "text-red-400" : "text-gray-300"
              )}
            >
              {url}
            </span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-gray-500 hover:text-white transition"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  color = "gray",
}: {
  label: string;
  value: number;
  color?: "gray" | "green" | "red" | "yellow" | "blue" | "orange";
}) {
  const colors: Record<string, string> = {
    gray: "text-gray-300",
    green: "text-green-400",
    red: "text-red-400",
    yellow: "text-yellow-400",
    blue: "text-copper-light",
    orange: "text-orange-400",
  };
  return (
    <span className="text-xs text-gray-500">
      {label}:{" "}
      <span className={cn("font-semibold", colors[color])}>{value}</span>
    </span>
  );
}

function StatBox({
  label,
  value,
  color = "gray",
}: {
  label: string;
  value: number;
  color?: "gray" | "green" | "red" | "yellow" | "blue" | "orange";
}) {
  const colors: Record<string, string> = {
    gray: "text-white",
    green: "text-green-400",
    red: "text-red-400",
    yellow: "text-yellow-400",
    blue: "text-copper-light",
    orange: "text-orange-400",
  };
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={cn("text-xl font-bold mt-0.5", colors[color])}>{value}</p>
    </div>
  );
}

function QuotaBar({
  label,
  used,
  limit,
  usedLabel,
  limitLabel,
}: {
  label: string;
  used: number;
  limit: number;
  usedLabel?: string;
  limitLabel?: string;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      {label && (
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>{label}</span>
          <span>
            {used}/{limit}
          </span>
        </div>
      )}
      {!label && (
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>{usedLabel ?? `${used} used`}</span>
          <span>{limitLabel ?? `${limit} limit`}</span>
        </div>
      )}
      <div className="h-1.5 w-full rounded-full bg-gray-900">
        <div
          className={cn(
            "h-1.5 rounded-full transition-all",
            pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-copper"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Toggle({
  label,
  tooltip,
  checked,
  onChange,
  disabled = false,
  onDisabledClick,
}: {
  label: string;
  tooltip?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  onDisabledClick?: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  const handleClick = () => {
    if (disabled) {
      onDisabledClick?.();
    } else {
      onChange(!checked);
    }
  };

  return (
    <label className={cn("flex items-center gap-3", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
      <div
        onClick={handleClick}
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          disabled ? "opacity-40" : "",
          checked && !disabled ? "bg-copper" : "bg-gray-700"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked && !disabled ? "translate-x-4" : "translate-x-0"
          )}
        />
      </div>
      <span className={cn("text-sm", disabled ? "text-gray-500" : "text-gray-300")}>{label}</span>
      {tooltip && (
        <div className="relative flex items-center">
          <button
            type="button"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
          {showTooltip && (
            <div className="absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-gray-800 bg-black p-2.5 text-xs text-gray-300 shadow-xl z-10">
              {tooltip}
            </div>
          )}
        </div>
      )}
    </label>
  );
}

// ── IndexNow Verification Modal ───────────────────────────────────────────────

function IndexNowVerifyModal({
  site,
  onClose,
  onProceed,
  onVerifySuccess,
  t,
}: {
  site: Site;
  onClose: () => void;
  onProceed: () => void;
  onVerifySuccess: () => void;
  t: ReturnType<typeof useTranslations<"indexing">>;
}) {
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const baseDomain = site.domain.startsWith("sc-domain:")
    ? `https://${site.domain.replace("sc-domain:", "")}`
    : site.domain.replace(/\/$/, "");
  const keyFileUrl = `${baseDomain}/${site.indexnowKey}.txt`;

  const verify = async () => {
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await fetch(`/api/indexing/sites/${site.id}/verify-key`);
      const data = await res.json();
      if (data.verified) {
        setVerified(true);
        onVerifySuccess();
      } else {
        setVerifyError(t("keyFileNotFound"));
      }
    } catch {
      setVerifyError(t("networkError"));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-gray-800 bg-black p-6 shadow-xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-2 text-gray-400 hover:bg-gray-900 hover:text-gray-200 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
        {/* Icon */}
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-copper/10">
          <Key className="h-6 w-6 text-copper" />
        </div>
        {/* Title */}
        <h3 className="mb-2 text-base font-semibold text-white">
          {t("verifyModalTitle")}
        </h3>

        <p className="text-sm text-gray-400 mb-5">
          {t("verifyModalDesc")}
        </p>

        <div className="space-y-4">
          {/* Step 1 */}
          <div>
            <p className="text-xs font-medium text-gray-300 mb-1.5">
              {t("verifyStep1")}
            </p>
            <a
              href={`/api/indexing/sites/${site.id}/download-key`}
              download
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-900"
            >
              <Download className="h-3.5 w-3.5" />
              {t("downloadKeyFile")}
            </a>
          </div>

          {/* Step 2 */}
          <div>
            <p className="text-xs font-medium text-gray-300 mb-1.5">
              {t("verifyStep2")}
            </p>
            <code className="block text-xs text-gray-300 rounded-md border border-gray-800 bg-gray-950 px-3 py-2 break-all">
              {keyFileUrl}
            </code>
          </div>

          {/* Step 3 */}
          <div>
            <p className="text-xs font-medium text-gray-300 mb-2">
              {t("verifyStep3")}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={verify}
                disabled={verifying || verified}
                className="flex items-center gap-1.5 rounded-md border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-900 disabled:opacity-50"
              >
                {verifying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : verified ? (
                  <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" />
                )}
                {verifying ? t("verifyBtnVerifying") : verified ? t("verifyBtnVerified") : t("verifyBtnVerify")}
              </button>
              {verified && (
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" />
                  {t("keyFileConfirmed")}
                </span>
              )}
              {verifyError && (
                <span className="text-xs text-red-400">{verifyError}</span>
              )}
            </div>
          </div>
        </div>

        {/* Footer: primary LEFT, cancel RIGHT */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={onProceed}
            disabled={!verified}
            className="flex-1 rounded-md bg-gradient-to-r from-copper to-copper-light px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {t("proceedToSubmit")}
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-md border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 transition-colors hover:bg-gray-900"
          >
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
