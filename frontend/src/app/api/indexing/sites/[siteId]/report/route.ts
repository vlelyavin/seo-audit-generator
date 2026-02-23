import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getDailyQuota,
  GOOGLE_DAILY_SUBMISSION_LIMIT,
  INDEXED_GSC_STATUSES,
} from "@/lib/google-auth";

/**
 * GET /api/indexing/sites/[siteId]/report
 * Returns the latest auto-index report data (for dashboard display).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;
  const site = await prisma.site.findUnique({ where: { id: siteId } });

  if (!site || site.userId !== session.user.id) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Get today's log entries
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const todayLogs = await prisma.indexingLog.findMany({
    where: {
      userId: session.user.id,
      createdAt: { gte: todayStart },
    },
    orderBy: { createdAt: "desc" },
  });

  // Summarise today's submissions
  const submittedGoogleToday = todayLogs.filter(
    (l) => l.action === "submitted_google"
  ).length;
  const submittedBingToday = todayLogs.filter(
    (l) => l.action === "submitted_indexnow"
  ).length;
  const failedToday = todayLogs.filter((l) => l.action === "failed").length;

  // New pages detected today
  const newPages = await prisma.indexedUrl.findMany({
    where: {
      siteId,
      isNew: true,
      createdAt: { gte: todayStart },
    },
    select: { url: true },
  });

  // 404s detected today
  const pages404 = await prisma.indexedUrl.findMany({
    where: {
      siteId,
      httpStatus: { in: [404, 410] },
      updatedAt: { gte: todayStart },
    },
    select: { url: true, httpStatus: true },
  });

  // Overall stats
  const [total, indexed, pending] = await Promise.all([
    prisma.indexedUrl.count({ where: { siteId } }),
    prisma.indexedUrl.count({
      where: { siteId, gscStatus: { in: [...INDEXED_GSC_STATUSES] } },
    }),
    prisma.indexedUrl.count({
      where: { siteId, indexingStatus: "pending" },
    }),
  ]);

  const quota = await getDailyQuota(session.user.id);

  return NextResponse.json({
    site: { id: site.id, domain: site.domain },
    today: {
      newPagesDetected: newPages.length,
      newPagesList: newPages.map((p) => p.url),
      submittedGoogle: submittedGoogleToday,
      submittedBing: submittedBingToday,
      failed: failedToday,
      pages404: pages404.length,
      pages404List: pages404.map((p) => p.url),
    },
    overall: {
      total,
      indexed,
      notIndexed: total - indexed,
      pending,
    },
    quota: {
      googleUsed: quota.googleSubmissions,
      googleLimit: GOOGLE_DAILY_SUBMISSION_LIMIT,
      googleRemaining: Math.max(
        0,
        GOOGLE_DAILY_SUBMISSION_LIMIT - quota.googleSubmissions
      ),
    },
  });
}
