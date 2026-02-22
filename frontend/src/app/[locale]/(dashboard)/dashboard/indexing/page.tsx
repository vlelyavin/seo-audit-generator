"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
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
  Copy,
  Check,
  CreditCard,
  ExternalLink,
  Info,
  ChevronLeft,
  ChevronRight,
  Loader2,
  BarChart3,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function gscStatusColor(
  status: string | null | undefined
): { bg: string; text: string; label: string } {
  if (!status)
    return { bg: "bg-gray-800", text: "text-gray-400", label: "Unknown" };
  const s = status.toLowerCase();
  if (s.includes("submitted and indexed") || s === "indexed")
    return { bg: "bg-green-900/40", text: "text-green-400", label: "Indexed" };
  if (s.includes("crawled") && s.includes("not indexed"))
    return {
      bg: "bg-orange-900/40",
      text: "text-orange-400",
      label: "Not indexed",
    };
  if (s.includes("discovered"))
    return {
      bg: "bg-yellow-900/40",
      text: "text-yellow-400",
      label: "Discovered",
    };
  if (
    s.includes("blocked") ||
    s.includes("not found") ||
    s.includes("soft 404") ||
    s.includes("server error") ||
    s.includes("noindex")
  )
    return { bg: "bg-red-900/40", text: "text-red-400", label: "Blocked" };
  if (s.includes("redirect") || s.includes("duplicate"))
    return {
      bg: "bg-yellow-900/40",
      text: "text-yellow-400",
      label: "Redirect",
    };
  return { bg: "bg-gray-800", text: "text-gray-400", label: "Unknown" };
}

function ourStatusColor(status: string): {
  bg: string;
  text: string;
  label: string;
} {
  switch (status) {
    case "submitted":
      return {
        bg: "bg-blue-900/40",
        text: "text-blue-400",
        label: "Submitted",
      };
    case "failed":
      return { bg: "bg-red-900/40", text: "text-red-400", label: "Failed" };
    case "pending":
      return {
        bg: "bg-yellow-900/40",
        text: "text-yellow-400",
        label: "Pending",
      };
    default:
      return {
        bg: "bg-gray-800",
        text: "text-gray-500",
        label: "Not submitted",
      };
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IndexingPage() {
  const t = useTranslations("indexing");

  // GSC + sites state
  const [gscStatus, setGscStatus] = useState<GscStatus | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [syncingSites, setSyncingSites] = useState(false);
  const [expandedSite, setExpandedSite] = useState<string | null>(null);
  const [siteStats, setSiteStats] = useState<Record<string, SiteStats>>({});
  const [siteQuotas, setSiteQuotas] = useState<Record<string, Quota>>({});
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState<Record<string, boolean>>({});
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

  const handleDisconnect = async () => {
    if (!window.confirm(t("disconnectConfirm"))) return;
    const res = await fetch("/api/indexing/gsc/disconnect", {
      method: "DELETE",
    });
    if (res.ok) {
      await loadStatus();
      setSites([]);
      showToast("Disconnected.");
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

  const loadSiteStats = async (siteId: string) => {
    const res = await fetch(`/api/indexing/sites/${siteId}/stats`);
    if (res.ok) {
      const data = await res.json();
      setSiteStats((prev) => ({ ...prev, [siteId]: data }));
    }
  };

  const loadSiteQuota = async (siteId: string) => {
    const res = await fetch(`/api/indexing/sites/${siteId}/quota`);
    if (res.ok) {
      const data = await res.json();
      setSiteQuotas((prev) => ({ ...prev, [siteId]: data }));
    }
  };

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
    try {
      const res = await fetch(`/api/indexing/sites/${siteId}/run-auto-index`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        showToast(
          `Done. New: ${data.newUrls}, Changed: ${data.changedUrls}, Google: ${data.submittedGoogle}, Bing: ${data.submittedBing}`
        );
        await loadSiteStats(siteId);
        await loadSiteQuota(siteId);
        await loadCredits();
      }
    } finally {
      setRunning((prev) => ({ ...prev, [siteId]: false }));
    }
  };

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
        showToast("Failed to start checkout.", false);
      }
    } finally {
      setBuyingPack(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingStatus) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-500" />
      </div>
    );
  }

  const isConnected = gscStatus?.connected && gscStatus.hasRequiredScopes;
  const creditsLow = credits !== null && credits < 10;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 rounded-lg px-5 py-3 text-sm font-medium shadow-lg",
            toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"
          )}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">{t("title")}</h1>

        {/* Credits indicator */}
        {credits !== null && (
          <button
            onClick={() => setShowCreditModal(true)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:opacity-80",
              credits === 0
                ? "border-red-700 bg-red-900/20 text-red-400"
                : creditsLow
                  ? "border-orange-700 bg-orange-900/20 text-orange-400"
                  : "border-gray-700 bg-gray-900 text-gray-300"
            )}
          >
            <CreditCard className="h-4 w-4" />
            {credits === 0
              ? t("noCredits")
              : t("creditsRemaining", { count: credits })}
          </button>
        )}
      </div>

      {/* GSC Connection Card */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Google Search Console
            </h2>
            <p className="mt-1 text-sm text-gray-400">{t("connectDesc")}</p>
          </div>

          {isConnected ? (
            <span className="flex items-center gap-1.5 rounded-full bg-green-900/40 px-3 py-1 text-xs font-medium text-green-400">
              <CheckCircle className="h-3.5 w-3.5" />
              {t("connected")}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-red-900/40 px-3 py-1 text-xs font-medium text-red-400">
              <XCircle className="h-3.5 w-3.5" />
              {t("notConnected")}
            </span>
          )}
        </div>

        {gscStatus?.email && (
          <p className="mt-3 text-sm text-gray-400">{gscStatus.email}</p>
        )}

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
              className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-gray-100"
            >
              <Link2 className="h-4 w-4" />
              {gscStatus?.connected ? t("reconnect") : t("connectGoogle")}
            </button>
          ) : (
            <>
              <button
                onClick={syncSites}
                disabled={syncingSites}
                className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-gray-100 disabled:opacity-50"
              >
                <RefreshCw
                  className={cn("h-4 w-4", syncingSites && "animate-spin")}
                />
                {syncingSites ? t("syncing") : t("syncSites")}
              </button>
              <button
                onClick={handleDisconnect}
                className="flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition hover:border-red-700 hover:text-red-400"
              >
                <Link2Off className="h-4 w-4" />
                {t("disconnect")}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Sites list */}
      {isConnected && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">{t("sites")}</h2>

          {sites.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-10 text-center">
              <Search className="mx-auto h-10 w-10 text-gray-600 mb-3" />
              <p className="text-gray-400 text-sm">{t("noSites")}</p>
            </div>
          ) : (
            sites.map((site) => (
              <SiteCard
                key={site.id}
                site={site}
                expanded={expandedSite === site.id}
                stats={siteStats[site.id]}
                quota={siteQuotas[site.id]}
                syncingUrls={syncing[site.id] ?? false}
                running={running[site.id] ?? false}
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
                showToast={showToast}
              />
            ))
          )}
        </div>
      )}

      {/* Credit packs modal */}
      {showCreditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-950 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                {t("creditPacks")}
              </h3>
              <button
                onClick={() => setShowCreditModal(false)}
                className="text-gray-500 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
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
                  className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 p-4"
                >
                  <div>
                    <p className="font-medium text-white capitalize">
                      {pack.id}
                    </p>
                    <p className="text-sm text-gray-400">
                      {pack.credits} credits
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-white font-semibold">
                      {pack.price_formatted}
                    </span>
                    <button
                      onClick={() => buyCredits(pack.id)}
                      disabled={buyingPack !== null}
                      className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-gray-100 transition disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-gray-800 bg-gray-950 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-3">
              {t("confirmSubmitTitle")}
            </h3>
            <p className="text-sm text-gray-300 mb-5">
              {confirmState.engines.includes("google") &&
              !confirmState.engines.includes("bing")
                ? t("confirmSubmitGoogle", {
                    count: confirmState.count,
                    remaining: credits ?? 0,
                  })
                : confirmState.engines.includes("bing") &&
                    !confirmState.engines.includes("google")
                  ? t("confirmSubmitBing", { count: confirmState.count })
                  : `Submit ${confirmState.count} URLs to Google & Bing?`}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmState(null)}
                disabled={submitting}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500 transition disabled:opacity-50"
              >
                {t("cancel", { ns: "common" }) ?? "Cancel"}
              </button>
              <button
                onClick={executeSubmit}
                disabled={submitting}
                className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-100 transition disabled:opacity-50"
              >
                {submitting && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                {t("confirm")}
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
  stats,
  quota,
  syncingUrls,
  running,
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
  showToast,
}: {
  site: Site;
  expanded: boolean;
  stats?: SiteStats;
  quota?: Quota;
  syncingUrls: boolean;
  running: boolean;
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
  showToast: (msg: string, ok?: boolean) => void;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "urls" | "report">(
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

  // Report state
  const [report, setReport] = useState<Report | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Verify key state
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<boolean | null>(null);

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

  // Load URLs/report when tabs become active
  useEffect(() => {
    if (!expanded) return;
    if (activeTab === "urls" && !urlPage) loadUrls(urlFilter, 1, urlSearch);
    if (activeTab === "report" && !report) loadReport();
  }, [expanded, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when filter/page changes
  useEffect(() => {
    if (!expanded || activeTab !== "urls") return;
    loadUrls(urlFilter, urlCurrentPage, urlSearch);
  }, [urlFilter, urlCurrentPage]); // eslint-disable-line react-hooks/exhaustive-deps

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
        showToast(t("inspect") + " complete.");
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

  // ── Verify IndexNow key ───────────────────────────────────────────────────

  const verifyKey = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch(
        `/api/indexing/sites/${site.id}/verify-key`
      );
      if (res.ok) {
        const data = await res.json();
        setVerifyResult(data.verified);
      }
    } finally {
      setVerifying(false);
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
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
      {/* Header row */}
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-gray-800/50 transition"
      >
        <div className="flex items-center gap-3">
          <Search className="h-5 w-5 text-gray-400 shrink-0" />
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
          <div className="flex border-b border-gray-800 px-6">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-4 py-3 text-sm font-medium transition border-b-2 -mb-px",
                  activeTab === tab.id
                    ? "border-white text-white"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Overview Tab ─────────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <div className="px-6 py-5 space-y-5">
              {/* Stats row */}
              {stats ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-16 rounded-lg border border-gray-800 bg-gray-950 animate-pulse"
                    />
                  ))}
                </div>
              )}

              {/* Quota */}
              {quota && (
                <div className="rounded-lg border border-gray-800 bg-gray-950 p-4 space-y-2">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {t("quota")}
                  </p>
                  <QuotaBar
                    label={t("googleQuota")}
                    used={quota.googleSubmissions.used}
                    limit={quota.googleSubmissions.limit}
                  />
                  <QuotaBar
                    label={t("inspectionQuota")}
                    used={quota.inspections.used}
                    limit={quota.inspections.limit}
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={onSyncUrls}
                  disabled={syncingUrls}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:border-gray-500 hover:text-white transition disabled:opacity-50"
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
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 transition disabled:opacity-50"
                >
                  {t("submitAllNotIndexed")} (Google)
                </button>

                {site.indexnowKey && (
                  <button
                    onClick={() =>
                      onRequestSubmit(
                        site.id,
                        [],
                        ["bing"],
                        stats?.notIndexed ?? 0
                      )
                    }
                    disabled={!stats?.notIndexed}
                    className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-500 transition disabled:opacity-50"
                  >
                    {t("submitAllNotIndexed")} (Bing)
                  </button>
                )}

                {(site.autoIndexGoogle || site.autoIndexBing) && (
                  <button
                    onClick={onRunNow}
                    disabled={running}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:border-gray-500 hover:text-white transition disabled:opacity-50"
                  >
                    <Play
                      className={cn(
                        "h-3.5 w-3.5",
                        running && "animate-pulse"
                      )}
                    />
                    {t("runNow")}
                  </button>
                )}
              </div>

              {/* Auto-index toggles */}
              <div className="space-y-2">
                <Toggle
                  label={t("autoIndexGoogle")}
                  tooltip="Automatically submits new and updated pages to Google via the Indexing API."
                  checked={site.autoIndexGoogle}
                  onChange={onToggleAutoGoogle}
                />
                <Toggle
                  label={t("autoIndexBing")}
                  tooltip="Automatically pings Bing via IndexNow when pages are added or updated. Free."
                  checked={site.autoIndexBing}
                  onChange={onToggleAutoBing}
                />
              </div>

              {/* IndexNow key */}
              {site.indexnowKey && (
                <div className="rounded-lg border border-gray-800 bg-gray-950 p-4 space-y-3">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {t("indexnowKey")}
                  </p>
                  <p className="text-xs text-gray-500">{t("indexnowKeyDesc")}</p>
                  <div className="flex items-center gap-2 rounded-md border border-gray-800 bg-gray-900 px-3 py-2">
                    <code className="flex-1 text-xs text-green-400 break-all">
                      {site.indexnowKey}
                    </code>
                    <button
                      onClick={() => onCopyKey(site.indexnowKey!)}
                      className="shrink-0 text-gray-400 hover:text-white transition"
                    >
                      {copied === site.indexnowKey ? (
                        <Check className="h-4 w-4 text-green-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    File URL:{" "}
                    <code className="text-gray-300">
                      {(site.domain.startsWith("sc-domain:")
                        ? `https://${site.domain.replace("sc-domain:", "")}`
                        : site.domain.replace(/\/$/, ""))}/
                      {site.indexnowKey}.txt
                    </code>
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={verifyKey}
                      disabled={verifying}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500 hover:text-white transition disabled:opacity-50"
                    >
                      {verifying ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      {verifying ? t("verifying") : t("verifyKey")}
                    </button>
                    {verifyResult === true && (
                      <span className="text-xs text-green-400 flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5" />
                        {t("keyVerified")}
                      </span>
                    )}
                    {verifyResult === false && (
                      <span className="text-xs text-red-400 flex items-center gap-1">
                        <XCircle className="h-3.5 w-3.5" />
                        {t("keyNotFound")}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── URLs Tab ─────────────────────────────────────────────────── */}
          {activeTab === "urls" && (
            <div className="px-6 py-5 space-y-4">
              {/* Filter tabs + search row */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1">
                  {URL_FILTERS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => handleFilterChange(f.id)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition",
                        urlFilter === f.id
                          ? "bg-white text-black"
                          : "bg-gray-800 text-gray-400 hover:text-white"
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={urlSearch}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder={t("searchUrls")}
                  className="ml-auto w-48 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:border-gray-500 focus:outline-none"
                />
                <button
                  onClick={() => loadUrls(urlFilter, urlCurrentPage, urlSearch)}
                  className="rounded-lg border border-gray-700 p-1.5 text-gray-400 hover:text-white transition"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Bulk action bar */}
              {selectedUrls.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5">
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
                    className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 transition disabled:opacity-50"
                  >
                    {t("submitToGoogle")}
                  </button>
                  {site.indexnowKey && (
                    <button
                      onClick={() =>
                        onRequestSubmit(
                          site.id,
                          [...selectedUrls],
                          ["bing"],
                          selectedUrls.size
                        )
                      }
                      className="rounded-md bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-500 transition"
                    >
                      {t("submitToBing")}
                    </button>
                  )}
                  <button
                    onClick={bulkInspect}
                    className="rounded-md border border-gray-600 px-3 py-1 text-xs text-gray-300 hover:text-white transition"
                  >
                    {t("inspect")}
                  </button>
                  <button
                    onClick={() => setSelectedUrls(new Set())}
                    className="ml-auto text-gray-500 hover:text-white transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Google quota warning */}
              {quota && quota.googleSubmissions.remaining === 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-900/10 px-3 py-2 text-xs text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Google submission quota exhausted for today.
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
                  {/* Table */}
                  <div className="overflow-x-auto rounded-lg border border-gray-800">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800 bg-gray-950">
                          <th className="w-10 px-3 py-3 text-left">
                            <input
                              type="checkbox"
                              checked={allOnPageSelected}
                              onChange={toggleSelectAll}
                              className="rounded border-gray-600 bg-gray-800 text-white"
                            />
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            URL
                          </th>
                          <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            {t("gscStatus")}
                          </th>
                          <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            {t("ourStatus")}
                          </th>
                          <th className="hidden lg:table-cell px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            {t("lastSynced")}
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            {t("actions")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {urlPage.urls.map((url) => {
                          const gsc = gscStatusColor(url.gscStatus);
                          const our = ourStatusColor(url.indexingStatus);
                          const isInspecting = inspecting[url.url] ?? false;

                          return (
                            <tr
                              key={url.id}
                              className="hover:bg-gray-800/30 transition"
                            >
                              <td className="px-3 py-3">
                                <input
                                  type="checkbox"
                                  checked={selectedUrls.has(url.id)}
                                  onChange={() => toggleUrl(url.id)}
                                  className="rounded border-gray-600 bg-gray-800"
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
                                <GscStatusBadge
                                  status={url.gscStatus}
                                  gsc={gsc}
                                />
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
                                {relativeTime(url.lastSyncedAt)}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => inspectUrl(url.url)}
                                    disabled={isInspecting}
                                    title={t("inspect")}
                                    className="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:text-white hover:border-gray-500 transition disabled:opacity-50"
                                  >
                                    {isInspecting ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Search className="h-3 w-3" />
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
                                    title={t("submitToGoogle")}
                                    disabled={
                                      quota?.googleSubmissions.remaining === 0
                                    }
                                    className="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:text-white hover:border-gray-500 transition disabled:opacity-50"
                                  >
                                    G
                                  </button>
                                  {site.indexnowKey && (
                                    <button
                                      onClick={() =>
                                        onRequestSubmit(
                                          site.id,
                                          [url.id],
                                          ["bing"],
                                          1
                                        )
                                      }
                                      title={t("submitToBing")}
                                      className="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:text-white hover:border-gray-500 transition"
                                    >
                                      B
                                    </button>
                                  )}
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
                        {urlPage.total} URLs
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setUrlCurrentPage((p) => Math.max(1, p - 1));
                          }}
                          disabled={urlCurrentPage <= 1}
                          className="flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500 transition disabled:opacity-40"
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
                          className="flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500 transition disabled:opacity-40"
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
            <div className="px-6 py-5 space-y-5">
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
                      <div className="h-2 w-full rounded-full bg-gray-800">
                        <div
                          className="h-2 rounded-full bg-green-500 transition-all"
                          style={{
                            width: `${Math.round((report.overall.indexed / report.overall.total) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {report.overall.total > 0
                        ? `${Math.round((report.overall.indexed / report.overall.total) * 100)}% indexed`
                        : "No data yet"}
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
                      label="Submitted Google"
                      value={report.today.submittedGoogle}
                      color="green"
                    />
                    <StatBox
                      label="Submitted Bing"
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
                    />
                  </div>

                  {/* New pages list */}
                  {report.today.newPagesList.length > 0 && (
                    <ExpandableList
                      title={t("newPages")}
                      items={report.today.newPagesList}
                    />
                  )}

                  {/* 404 list */}
                  {report.today.pages404List.length > 0 && (
                    <ExpandableList
                      title={t("pages404Found")}
                      items={report.today.pages404List}
                      danger
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function GscStatusBadge({
  status,
  gsc,
}: {
  status: string | null;
  gsc: { bg: string; text: string; label: string };
}) {
  const [showTip, setShowTip] = useState(false);
  const tip = status ? getTip(status) : null;

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
          className="text-gray-500 hover:text-gray-300 transition"
          onMouseEnter={() => setShowTip(true)}
          onMouseLeave={() => setShowTip(false)}
        >
          <Info className="h-3.5 w-3.5" />
          {showTip && (
            <div className="absolute bottom-full left-0 mb-2 w-56 rounded-lg border border-gray-700 bg-gray-900 p-2.5 text-xs text-gray-300 shadow-xl z-10 text-left">
              {tip}
            </div>
          )}
        </button>
      )}
    </div>
  );
}

function getTip(gscStatus: string): string {
  const tips: Record<string, string> = {
    "Crawled - currently not indexed":
      "Google found this page but chose not to index it. Improve content quality or submit via the Indexing API.",
    "Discovered - currently not indexed":
      "Google knows about this page but hasn't crawled it yet. Submit for indexing to speed this up.",
    "URL is unknown to Google":
      "Google has never seen this URL. Submit it now via the Indexing API.",
    "Blocked by robots.txt":
      "Your robots.txt is blocking Google from crawling this page.",
    "Blocked due to noindex":
      "This page has a noindex meta tag. Remove it if you want this page indexed.",
    "Soft 404":
      "Google thinks this page is a soft 404. Add meaningful content.",
    "Not found (404)":
      "This page returns a 404. Either restore the content or remove it from your sitemap.",
    "Submitted and indexed": "This URL is indexed by Google. No action needed.",
    Indexed: "This URL is indexed by Google. No action needed.",
  };
  return tips[gscStatus] ?? gscStatus;
}

function ExpandableList({
  title,
  items,
  danger = false,
}: {
  title: string;
  items: string[];
  danger?: boolean;
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
            {expanded ? "Show less" : `Show all ${items.length}`}
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
    blue: "text-blue-400",
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
    blue: "text-blue-400",
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
}: {
  label: string;
  used: number;
  limit: number;
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
          <span>{used} used</span>
          <span>{limit} limit</span>
        </div>
      )}
      <div className="h-1.5 w-full rounded-full bg-gray-800">
        <div
          className={cn(
            "h-1.5 rounded-full transition-all",
            pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-blue-500"
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
}: {
  label: string;
  tooltip?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <label className="flex cursor-pointer items-center gap-3">
      <div
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 rounded-full transition",
          checked ? "bg-blue-600" : "bg-gray-700"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </div>
      <span className="text-sm text-gray-300">{label}</span>
      {tooltip && (
        <div className="relative">
          <button
            type="button"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            className="text-gray-500 hover:text-gray-300 transition"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
          {showTooltip && (
            <div className="absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-gray-700 bg-gray-900 p-2.5 text-xs text-gray-300 shadow-xl z-10">
              {tooltip}
            </div>
          )}
        </div>
      )}
    </label>
  );
}
