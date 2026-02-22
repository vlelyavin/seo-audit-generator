import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

/**
 * Dev-only login endpoint. Creates a dev user and sets NextAuth JWT cookie.
 * Only works when NODE_ENV=development.
 */
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const email = "dev@localhost";

  // Find or create dev user
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: "Dev User",
        role: "admin",
        planId: "agency",
      },
    });
  }

  // Create JWT token matching NextAuth format
  const token = await encode({
    token: {
      sub: user.id,
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.image,
      role: user.role,
      planId: user.planId,
    },
    secret: process.env.AUTH_SECRET!,
    salt: "authjs.session-token",
  });

  // Set the session cookie
  const cookieStore = await cookies();
  cookieStore.set("authjs.session-token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false, // dev only, no HTTPS
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}
