import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const IN_PROGRESS_STATUSES = ["crawling", "analyzing", "generating_report", "screenshots", "pending"];
const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const take = Math.min(Math.max(parseInt(searchParams.get("take") || "20", 10) || 20, 1), 100);
  const skip = Math.max(parseInt(searchParams.get("skip") || "0", 10) || 0, 0);

  const audits = await prisma.audit.findMany({
    where: { userId: session.user.id },
    orderBy: { startedAt: "desc" },
    take,
    skip,
    select: {
      id: true,
      fastApiId: true,
      url: true,
      status: true,
      language: true,
      pagesCrawled: true,
      totalIssues: true,
      criticalIssues: true,
      warnings: true,
      passedChecks: true,
      errorMessage: true,
      startedAt: true,
      completedAt: true,
    },
  });

  // Check stale in-progress audits and sync their status from FastAPI
  const now = Date.now();
  const fastapiUrl = process.env.FASTAPI_URL || "http://127.0.0.1:8000";

  const result = await Promise.all(
    audits.map(async (audit) => {
      if (
        !IN_PROGRESS_STATUSES.includes(audit.status) ||
        !audit.fastApiId ||
        now - new Date(audit.startedAt).getTime() < STALE_THRESHOLD_MS
      ) {
        return audit;
      }

      // Stale audit — check FastAPI for real status
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5_000);
        let res: Response;
        try {
          res = await fetch(`${fastapiUrl}/api/audit/${audit.fastApiId}/current-status`, {
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        if (!res.ok) {
          // If FastAPI returns 404, the audit no longer exists — mark as failed
          if (res.status === 404) {
            const failedData = { status: "failed" as const, errorMessage: "Audit expired or not found on server", completedAt: new Date() };
            await prisma.audit.updateMany({
              where: { id: audit.id, status: { notIn: ["completed", "failed"] } },
              data: failedData,
            });
            return { ...audit, ...failedData };
          }
          return audit;
        }

        const data = await res.json();

        if (data.status === "completed" || data.status === "failed") {
          const updateData = data.status === "failed"
            ? { status: "failed" as const, errorMessage: data.error_message || data.message || "Audit failed", completedAt: new Date() }
            : { status: "completed" as const, completedAt: new Date() };

          await prisma.audit.updateMany({
            where: { id: audit.id, status: { not: data.status } },
            data: updateData,
          });

          return { ...audit, ...updateData };
        }
      } catch {
        // Timeout or network error — return as-is
      }

      return audit;
    })
  );

  return NextResponse.json(result);
}
