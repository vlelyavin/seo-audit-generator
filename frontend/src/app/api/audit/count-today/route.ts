import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/audit/count-today
 * Returns the number of audits started by the current user today.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const count = await prisma.audit.count({
    where: {
      userId: session.user.id,
      startedAt: { gte: todayStart },
    },
  });

  return NextResponse.json({ count });
}
