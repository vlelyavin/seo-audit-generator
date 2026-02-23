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

  if (userId === session.user.id) {
    return NextResponse.json(
      { error: "Cannot revoke your own Google auth" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Delete all Google OAuth account records (forces re-login)
  await prisma.account.deleteMany({
    where: { userId, provider: "google" },
  });

  // Also disconnect GSC since it depends on Google auth
  await prisma.user.update({
    where: { id: userId },
    data: {
      gscConnected: false,
      gscConnectedAt: null,
    },
  });

  return NextResponse.json({ success: true });
}
