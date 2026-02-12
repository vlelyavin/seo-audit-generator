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
  const lang = searchParams.get("lang") || "en";

  const audit = await prisma.audit.findUnique({ where: { id } });

  if (!audit || audit.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // If we have cached results, return them
  if (audit.resultJson) {
    return NextResponse.json(JSON.parse(audit.resultJson));
  }

  // Otherwise fetch from FastAPI and cache
  const fastapiRes = await fastapiFetch(
    `/api/audit/${audit.fastApiId}/results?lang=${lang}`
  );

  const data = await fastapiRes.json();

  // If partial results (audit still in progress), return 202
  if (data.partial) {
    return NextResponse.json(
      {
        error: "Audit in progress",
        status: data.status,
        progress: data.progress
      },
      { status: 202 }  // 202 Accepted instead of 400
    );
  }

  if (!fastapiRes.ok) {
    // Update database to reflect failure
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

  // Update audit in DB with results
  await prisma.audit.update({
    where: { id },
    data: {
      status: "completed",
      pagesCrawled: data.pages_crawled,
      totalIssues: data.total_issues,
      criticalIssues: data.critical_issues,
      warnings: data.warnings,
      passedChecks: data.passed_checks,
      resultJson: JSON.stringify(data),
      completedAt: new Date(),
    },
  });

  return NextResponse.json(data);
}
