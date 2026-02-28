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

  // Fetch from FastAPI with timeout
  const fastapiUrl = process.env.FASTAPI_URL || "http://127.0.0.1:8000";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    let res: Response;
    try {
      res = await fetch(`${fastapiUrl}/api/audit/${audit.fastApiId}/current-status`, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      console.error('[Progress API] FastAPI returned:', res.status);

      // If FastAPI returns 404, the audit no longer exists (expired or never started)
      // Mark it as failed in the database so the UI can show the correct state
      if (res.status === 404) {
        await prisma.audit.updateMany({
          where: { id, status: { notIn: ["completed", "failed"] } },
          data: { status: "failed", errorMessage: "Audit expired or not found on server", completedAt: new Date() },
        });
        return NextResponse.json({ status: "failed", message: "Audit expired or not found on server" });
      }

      return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 });
    }

    const data = await res.json();

    // Atomically update database when terminal state is reached
    if (data.status === "completed" || data.status === "failed") {
      const failedMessage = data.error_message || data.message || "Audit failed";
      const updateData = data.status === "failed"
        ? { status: "failed" as const, errorMessage: failedMessage, completedAt: new Date() }
        : { status: "completed" as const, completedAt: new Date() };

      const updated = await prisma.audit.updateMany({
        where: {
          id,
          status: { not: data.status },
        },
        data: updateData,
      });

      if (updated.count > 0) {
        console.log(`[Progress API] Updated audit ${id} to ${data.status} status`);
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error('[Progress API] Error:', msg);
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 });
  }
}
