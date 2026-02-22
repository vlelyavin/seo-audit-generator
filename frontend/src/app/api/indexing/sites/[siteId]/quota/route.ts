import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getDailyQuota,
  GOOGLE_DAILY_SUBMISSION_LIMIT,
  GOOGLE_DAILY_INSPECTION_LIMIT,
} from "@/lib/google-auth";

/**
 * GET /api/indexing/sites/[siteId]/quota
 * Returns today's Google submission and inspection quota usage.
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
