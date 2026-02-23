import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await params;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Mark GSC as disconnected (don't clear Account tokens — they're shared with Google auth)
  await prisma.user.update({
    where: { id: userId },
    data: {
      gscConnected: false,
      gscConnectedAt: null,
    },
  });

  return NextResponse.json({ success: true });
}
