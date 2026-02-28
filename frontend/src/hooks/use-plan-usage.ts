"use client";

import { useState, useEffect, useCallback } from "react";

interface QuotaBucket {
  used: number;
  limit: number;
  remaining: number;
}

export interface IndexatorUsage {
  siteCount: number;
  googleSubmissions: QuotaBucket;
  inspections: QuotaBucket;
}

export interface AuditorUsage {
  auditsToday: number;
}

type PageContext = "auditor" | "indexator" | "other";

function getPageContext(pathname: string): PageContext {
  if (pathname.startsWith("/app/auditor")) return "auditor";
  if (pathname.startsWith("/app/indexator")) return "indexator";
  return "other";
}

export function usePlanUsage(pathname: string) {
  const [indexatorUsage, setIndexatorUsage] = useState<IndexatorUsage | null>(null);
  const [auditorUsage, setAuditorUsage] = useState<AuditorUsage | null>(null);
  const [loading, setLoading] = useState(false);

  const context = getPageContext(pathname);

  const fetchData = useCallback(async () => {
    if (context === "other") return;

    setLoading(true);
    try {
      if (context === "indexator") {
        const [sitesRes, quotaRes] = await Promise.all([
          fetch("/api/indexing/sites"),
          fetch("/api/indexing/quota"),
        ]);

        const siteCount = sitesRes.ok
          ? ((await sitesRes.json()).sites?.length ?? 0)
          : 0;

        const quota = quotaRes.ok ? await quotaRes.json() : null;

        setIndexatorUsage({
          siteCount,
          googleSubmissions: quota?.googleSubmissions ?? { used: 0, limit: 200, remaining: 200 },
          inspections: quota?.inspections ?? { used: 0, limit: 2000, remaining: 2000 },
        });
      } else if (context === "auditor") {
        const res = await fetch("/api/audit/count-today");
        const data = res.ok ? await res.json() : { count: 0 };
        setAuditorUsage({ auditsToday: data.count });
      }
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    fetchData();

    if (context === "other") return;

    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData, context]);

  return { context, indexatorUsage, auditorUsage, loading };
}
