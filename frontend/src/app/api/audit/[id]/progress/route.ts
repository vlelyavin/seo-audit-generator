import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Get audit from database
  const audit = await prisma.audit.findUnique({
    where: { id },
    select: { userId: true, fastApiId: true, status: true }
  });

  if (!audit || audit.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!audit.fastApiId) {
    return NextResponse.json({ error: "Audit not started" }, { status: 400 });
  }

  // Fetch from FastAPI
  const fastapiUrl = process.env.FASTAPI_URL || "http://127.0.0.1:8000";

  try {
    const res = await fetch(`${fastapiUrl}/api/audit/${audit.fastApiId}/current-status`);

    if (!res.ok) {
      console.error('[Progress API] FastAPI returned:', res.status);
      return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Progress API] Error fetching from FastAPI:', error);
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 });
  }
}
