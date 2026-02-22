import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const JOB_SCHEDULES: Record<string, string> = {
  "daily-indexing": "Daily at 06:00 UTC",
  "retry-failed": "Daily at 12:00 UTC",
  "weekly-resync": "Sunday at 03:00 UTC",
};

/**
 * GET /api/cron/status
 *
 * Admin-only endpoint. Returns the last run time, result, and summary
 * for each scheduled cron job.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const logs = await prisma.cronJobLog.findMany({
    orderBy: { jobName: "asc" },
  });

  const jobs = Object.entries(JOB_SCHEDULES).map(([jobName, schedule]) => {
    const log = logs.find((l) => l.jobName === jobName);
    return {
      job: jobName,
      schedule,
      last_run_at: log?.lastRunAt ?? null,
      last_result: log?.lastResult ?? "never_run",
      last_summary: log?.lastSummary ? JSON.parse(log.lastSummary) : null,
    };
  });

  return NextResponse.json({ jobs });
}
