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
  const { url, language = "en", progressLanguage, analyzers = null, maxPages } = body;

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  // Validate URL: protocol + block private/reserved IPs (SSRF protection)
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return NextResponse.json({ error: "Only HTTP and HTTPS URLs are allowed" }, { status: 400 });
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const isPrivate =
    hostname === "localhost" ||
    hostname === "[::1]" ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^0\./.test(hostname) ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    hostname.startsWith("fe80");

  if (isPrivate) {
    return NextResponse.json({ error: "URLs pointing to private/internal networks are not allowed" }, { status: 400 });
  }

  // Validate language
  const allowedLanguages = ["en", "uk", "ru"];
  if (!allowedLanguages.includes(language)) {
    return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
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
      progress_language: progressLanguage || language,
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
