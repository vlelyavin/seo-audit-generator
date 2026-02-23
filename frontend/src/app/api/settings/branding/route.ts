import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toPublicLogoPath } from "@/lib/logo-storage";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { planId: true },
  });

  if (!user || user.planId !== "agency") {
    return NextResponse.json(
      { error: "Agency plan required" },
      { status: 403 }
    );
  }

  const branding = await prisma.brandSettings.findUnique({
    where: { userId: session.user.id },
  });

  if (!branding) {
    return NextResponse.json(null);
  }

  return NextResponse.json({
    ...branding,
    logoUrl: toPublicLogoPath(branding.logoUrl),
  });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check plan
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { planId: true },
  });

  if (!user || user.planId !== "agency") {
    return NextResponse.json(
      { error: "Agency plan required" },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { companyName, logoUrl } = body as { companyName?: string | null; logoUrl?: string | null };

  // Validate companyName
  if (companyName !== undefined && companyName !== null) {
    if (typeof companyName !== "string" || companyName.length > 100) {
      return NextResponse.json(
        { error: "Company name must be a string under 100 characters" },
        { status: 400 }
      );
    }
  }

  let normalizedLogoUrl: string | null | undefined = undefined;

  // Validate + normalize logoUrl.
  if (logoUrl === null || logoUrl === "") {
    normalizedLogoUrl = null;
  } else if (logoUrl !== undefined) {
    try {
      normalizedLogoUrl = toPublicLogoPath(logoUrl);
      if (!normalizedLogoUrl) {
        return NextResponse.json(
          { error: "Invalid logo URL" },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid logo URL format" },
        { status: 400 }
      );
    }
  }

  const updatePayload: { companyName?: string | null; logoUrl?: string | null } = {};
  if (companyName !== undefined) {
    updatePayload.companyName = companyName;
  }
  if (normalizedLogoUrl !== undefined) {
    updatePayload.logoUrl = normalizedLogoUrl;
  }

  const branding = await prisma.brandSettings.upsert({
    where: { userId: session.user.id },
    update: updatePayload,
    create: {
      userId: session.user.id,
      companyName,
      logoUrl: normalizedLogoUrl ?? null,
    },
  });

  return NextResponse.json(branding);
}
