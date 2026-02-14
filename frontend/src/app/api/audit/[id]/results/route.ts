import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fastapiFetch } from "@/lib/api-client";

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
  const rawLang = searchParams.get("lang") || "en";
  const allowedLanguages = ["en", "uk", "ru"];
  const lang = allowedLanguages.includes(rawLang) ? rawLang : "en";

  const audit = await prisma.audit.findUnique({ where: { id } });

  if (!audit || audit.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Always try FastAPI first (it has original data in memory and can translate on-the-fly)
  const fastapiRes = await fastapiFetch(
    `/api/audit/${audit.fastApiId}/results?lang=${lang}`
  );

  if (fastapiRes.ok) {
    const data = await fastapiRes.json();

    // If partial results (audit still in progress), return 202
    if (data.partial) {
      return NextResponse.json(
        {
          error: "Audit in progress",
          status: data.status,
          progress: data.progress,
        },
        { status: 202 }
      );
    }

    // Cache English (source) version in DB for reliable re-translation later
    if (!audit.resultJson) {
      let cacheData = data;

      // If user requested non-English, fetch English version for caching
      if (lang !== "en") {
        try {
          const enRes = await fastapiFetch(
            `/api/audit/${audit.fastApiId}/results?lang=en`
          );
          if (enRes.ok) {
            const enData = await enRes.json();
            if (!enData.partial) cacheData = enData;
          }
        } catch {
          // If English fetch fails, cache whatever we have
        }
      }

      await prisma.audit.update({
        where: { id },
        data: {
          status: "completed",
          pagesCrawled: cacheData.pages_crawled,
          totalIssues: cacheData.total_issues,
          criticalIssues: cacheData.critical_issues,
          warnings: cacheData.warnings,
          passedChecks: cacheData.passed_checks,
          resultJson: JSON.stringify(cacheData),
          completedAt: new Date(),
        },
      });
    }

    return NextResponse.json(data);
  }

  // FastAPI returned 404 (audit expired from memory) — fall back to DB cache
  if (fastapiRes.status === 404 && audit.resultJson) {
    const cachedData = JSON.parse(audit.resultJson);

    // Re-translate cached data via FastAPI translation endpoint
    try {
      const translateRes = await fastapiFetch("/api/results/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results: cachedData, lang }),
      });

      if (translateRes.ok) {
        return NextResponse.json(await translateRes.json());
      }
    } catch {
      // If translation fails, return cached data as-is
    }

    return NextResponse.json(cachedData);
  }

  // Other errors
  if (!fastapiRes.ok) {
    await prisma.audit.update({
      where: { id },
      data: {
        status: "failed",
        errorMessage: `Failed to retrieve results (HTTP ${fastapiRes.status})`,
        completedAt: new Date(),
      },
    });

    return NextResponse.json(
      { error: "Results not available yet" },
      { status: fastapiRes.status }
    );
  }

  return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
}
