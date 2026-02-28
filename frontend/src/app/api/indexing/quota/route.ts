import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getDailyQuota,
  GOOGLE_DAILY_SUBMISSION_LIMIT,
  GOOGLE_DAILY_INSPECTION_LIMIT,
} from "@/lib/google-auth";

/**
 * GET /api/indexing/quota
 * Returns today's global Google submission and inspection quota usage for the current user.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const quota = await getDailyQuota(session.user.id);

  return NextResponse.json({
    googleSubmissions: {
      used: quota.googleSubmissions,
      limit: GOOGLE_DAILY_SUBMISSION_LIMIT,
      remaining: Math.max(0, GOOGLE_DAILY_SUBMISSION_LIMIT - quota.googleSubmissions),
    },
    inspections: {
      used: quota.inspectionsUsed,
      limit: GOOGLE_DAILY_INSPECTION_LIMIT,
      remaining: Math.max(0, GOOGLE_DAILY_INSPECTION_LIMIT - quota.inspectionsUsed),
    },
  });
}
