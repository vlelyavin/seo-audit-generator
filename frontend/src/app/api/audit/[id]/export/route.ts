import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fastapiFetch } from "@/lib/api-client";
import { access } from "fs/promises";
import { constants as fsConstants } from "fs";
import { join } from "path";
import {
  getPlanCapabilities,
  type ExportFormat,
} from "@/lib/plan-capabilities";
import {
  extractLogoFilenameFromUrl,
  getUploadsDir,
  toPublicLogoPath,
} from "@/lib/logo-storage";

const SUPPORTED_FORMATS: ExportFormat[] = ["pdf", "html", "docx", "json", "csv"];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const requestedFormat = (searchParams.get("format") || "pdf").toLowerCase();
  const lang = searchParams.get("lang");

  if (!SUPPORTED_FORMATS.includes(requestedFormat as ExportFormat)) {
    return NextResponse.json(
      { error: "Unsupported export format" },
      { status: 400 }
    );
  }
  const format = requestedFormat as ExportFormat;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { planId: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const capabilities = getPlanCapabilities(user.planId);
  if (!capabilities.allowedExportFormats.includes(format)) {
    return NextResponse.json(
      { error: "Your plan allows PDF export only" },
      { status: 403 }
    );
  }

  const audit = await prisma.audit.findUnique({ where: { id } });

  if (!audit || audit.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // --- JSON / CSV: handled directly without going to FastAPI ---
  if (format === "json" || format === "csv") {
    if (!audit.resultJson) {
      return NextResponse.json({ error: "No audit data available" }, { status: 404 });
    }

    let auditData: Record<string, unknown>;
    try {
      auditData = JSON.parse(audit.resultJson);
    } catch {
      return NextResponse.json({ error: "Invalid audit data" }, { status: 500 });
    }

    let hostname = audit.url;
    try { hostname = new URL(audit.url).hostname; } catch { /* use raw url */ }
    const dateStr = new Date().toISOString().slice(0, 10);

    if (format === "json") {
      // Strip large base64 screenshot to keep file size reasonable
      const { homepage_screenshot: _screenshot, ...rest } = auditData as Record<string, unknown>;
      const exportData = {
        audit_id: audit.id,
        site_url: audit.url,
        language: audit.language,
        started_at: audit.startedAt,
        completed_at: audit.completedAt,
        stats: {
          pages_crawled: audit.pagesCrawled,
          passed_checks: audit.passedChecks,
          warnings: audit.warnings,
          critical_issues: audit.criticalIssues,
          total_issues: audit.totalIssues,
        },
        results: rest.results ?? {},
      };
      return new NextResponse(JSON.stringify(exportData, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="seo-audit_${hostname}_${dateStr}.json"`,
        },
      });
    }

    // CSV: per-analyzer summary rows with a metadata header
    const results = (auditData.results ?? {}) as Record<string, Record<string, unknown>>;
    const csvLines: string[] = [
      `# SEO Audit Report`,
      `# URL: ${audit.url}`,
      `# Date: ${dateStr}`,
      `# Pages Crawled: ${audit.pagesCrawled}`,
      `# Passed Checks: ${audit.passedChecks}`,
      `# Warnings: ${audit.warnings}`,
      `# Critical Issues: ${audit.criticalIssues}`,
      `#`,
      `Analyzer,Status,Critical Issues,Warnings`,
    ];
    for (const result of Object.values(results)) {
      const name = (result.display_name ?? result.name ?? "Unknown") as string;
      const severity = ((result.severity ?? result.status ?? "info") as string).toUpperCase();
      const issues = (result.issues ?? []) as Array<Record<string, unknown>>;
      const criticals = issues.filter((i) => (i.severity as string)?.toLowerCase() === "error").length;
      const warns = issues.filter((i) => (i.severity as string)?.toLowerCase() === "warning").length;
      csvLines.push(`"${name.replace(/"/g, '""')}","${severity}",${criticals},${warns}`);
    }
    return new NextResponse(csvLines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="seo-audit_${hostname}_${dateStr}.csv"`,
      },
    });
  }

  let brand: Record<string, string> | undefined;
  if (capabilities.canUseBranding) {
    const branding = await prisma.brandSettings.findUnique({
      where: { userId: session.user.id },
    });
    if (branding) {
      const origin = new URL(req.url).origin;

      let logoUrl: string | undefined;
      const publicLogoPath = toPublicLogoPath(branding.logoUrl);
      const filename = extractLogoFilenameFromUrl(publicLogoPath);
      if (publicLogoPath && filename) {
        try {
          await access(join(getUploadsDir(), filename), fsConstants.R_OK);
          logoUrl = `${origin}${publicLogoPath}`;
        } catch {
          logoUrl = undefined;
        }
      }

      brand = {
        ...(branding.companyName ? { company_name: branding.companyName } : {}),
        ...(logoUrl ? { logo_url: logoUrl } : {}),
      };
      if (Object.keys(brand).length === 0) {
        brand = undefined;
      }
    }
  }

  // Build query params for FastAPI
  const queryParams = new URLSearchParams({ format });
  if (lang) queryParams.set("lang", lang);
  queryParams.set("show_watermark", String(capabilities.showWatermark));
  if (brand) {
    if (brand.company_name) queryParams.set("company_name", brand.company_name);
    if (brand.logo_url) queryParams.set("logo_url", brand.logo_url);
  }

  const fastapiRes = await fastapiFetch(
    `/api/audit/${audit.fastApiId}/download?${queryParams.toString()}`
  );

  // If FastAPI doesn't have the audit in memory anymore, regenerate from cached data
  if (fastapiRes.status === 404 && audit.resultJson) {
    const regenerateRes = await fastapiFetch("/api/report/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format,
        audit: JSON.parse(audit.resultJson),
        language: lang || audit.language || "en",
        show_watermark: capabilities.showWatermark,
        brand,
      }),
    });

    if (!regenerateRes.ok) {
      return NextResponse.json(
        { error: "Report generation failed" },
        { status: regenerateRes.status }
      );
    }

    const contentType =
      regenerateRes.headers.get("content-type") || "application/octet-stream";
    const disposition =
      regenerateRes.headers.get("content-disposition") || "";
    const blob = await regenerateRes.arrayBuffer();

    return new NextResponse(blob, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
      },
    });
  }

  if (!fastapiRes.ok) {
    return NextResponse.json(
      { error: "Export failed" },
      { status: fastapiRes.status }
    );
  }

  const contentType = fastapiRes.headers.get("content-type") || "application/octet-stream";
  const disposition = fastapiRes.headers.get("content-disposition") || "";
  const blob = await fastapiRes.arrayBuffer();

  return new NextResponse(blob, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": disposition,
    },
  });
}
