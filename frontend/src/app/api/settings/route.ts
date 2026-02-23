import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { compare, hash } from "bcryptjs";
import { rateLimit } from "@/lib/rate-limit";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { name, currentPassword, newPassword } = body as Record<string, string>;

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Password change (5 attempts / 15 min per user)
  if (currentPassword && newPassword) {
    if (!rateLimit(`pw:${user.id}`, 5, 15 * 60_000).ok) {
      return NextResponse.json({ error: "Too many attempts, try later" }, { status: 429 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }
    if (!user.password) {
      return NextResponse.json(
        { error: "Account uses OAuth, no password to change" },
        { status: 400 }
      );
    }

    const valid = await compare(currentPassword, user.password);
    if (!valid) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { password: await hash(newPassword, 12) },
    });

    return NextResponse.json({ message: "Password changed" });
  }

  // Profile update
  if (name !== undefined) {
    await prisma.user.update({
      where: { id: user.id },
      data: { name },
    });
  }

  return NextResponse.json({ message: "Updated" });
}
