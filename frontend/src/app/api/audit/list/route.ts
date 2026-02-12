import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const audits = await prisma.audit.findMany({
    where: { userId: session.user.id },
    orderBy: { startedAt: "desc" },
    take: 20,
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

  return NextResponse.json(audits);
}
