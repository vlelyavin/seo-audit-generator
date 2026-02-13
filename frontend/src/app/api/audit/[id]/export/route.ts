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
  const format = searchParams.get("format") || "html";

  const audit = await prisma.audit.findUnique({ where: { id } });

  if (!audit || audit.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Branding disabled for now
  // const branding = await prisma.brandSettings.findUnique({
  //   where: { userId: session.user.id },
  // });

  // Build query params for FastAPI
  const queryParams = new URLSearchParams({ format });
  // if (branding?.companyName) queryParams.set("company_name", branding.companyName);
  // if (branding?.primaryColor) queryParams.set("primary_color", branding.primaryColor);
  // if (branding?.accentColor) queryParams.set("accent_color", branding.accentColor);
  // if (branding?.logoUrl) queryParams.set("logo_url", branding.logoUrl);

  const fastapiRes = await fastapiFetch(
    `/api/audit/${audit.fastApiId}/download?${queryParams.toString()}`
  );

  if (!fastapiRes.ok) {
    return NextResponse.json(
      { error: "Export failed" },
      { status: fastapiRes.status }
    );
  }

  const contentType = fastapiRes.headers.get("content-type") || "application/octet-stream";
  const disposition = fastapiRes.headers.get("content-disposition") || "";
  const blob = await fastapiRes.arrayBuffer();

  return new NextResponse(blob, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": disposition,
    },
  });
}
