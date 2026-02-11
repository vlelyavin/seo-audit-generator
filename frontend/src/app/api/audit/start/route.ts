import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fastapiFetch } from "@/lib/api-client";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { url, language = "en", analyzers = null, maxPages } = body;

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  // Check plan limits
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { plan: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const auditsThisMonth = await prisma.audit.count({
    where: {
      userId: user.id,
      startedAt: { gte: monthStart },
    },
  });

  if (auditsThisMonth >= user.plan.auditsPerMonth) {
    return NextResponse.json(
      { error: "Monthly audit limit reached. Please upgrade your plan." },
      { status: 429 }
    );
  }

  // Enforce plan's maxPages limit
  const effectiveMaxPages = Math.min(
    maxPages || user.plan.maxPages,
    user.plan.maxPages
  );

  // Start audit on FastAPI
  const fastapiRes = await fastapiFetch("/api/audit", {
    method: "POST",
    body: JSON.stringify({
      url,
      language,
      analyzers,
      max_pages: effectiveMaxPages,
    }),
  });

  if (!fastapiRes.ok) {
    const err = await fastapiRes.text();
    return NextResponse.json(
      { error: `Failed to start audit: ${err}` },
      { status: 500 }
    );
  }

  const data = await fastapiRes.json();

  // Store audit in DB
  const audit = await prisma.audit.create({
    data: {
      fastApiId: data.audit_id,
      userId: session.user.id,
      url,
      language,
      status: "crawling",
    },
  });

  return NextResponse.json({
    id: audit.id,
    fastApiId: data.audit_id,
    status: "started",
  });
}
