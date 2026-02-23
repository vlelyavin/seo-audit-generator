import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalUsers, paidUsers, totalAudits, activeThisWeek] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: { planId: { in: ["pro", "agency"] } },
      }),
      prisma.audit.count(),
      prisma.user.count({
        where: {
          audits: {
            some: {
              startedAt: { gte: sevenDaysAgo },
            },
          },
        },
      }),
    ]);

  return NextResponse.json({
    totalUsers,
    paidUsers,
    totalAudits,
    activeThisWeek,
  });
}
