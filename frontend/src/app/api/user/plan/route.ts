import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlanCapabilities } from "@/lib/plan-capabilities";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { plan: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    plan: {
      id: user.plan.id,
      name: user.plan.name,
      maxPages: user.plan.maxPages,
      auditsPerMonth: user.plan.auditsPerMonth,
      whiteLabel: user.plan.whiteLabel,
      price: user.plan.price,
      ...getPlanCapabilities(user.plan.id),
    },
  });
}

/**
 * PATCH endpoint removed — plan changes must go through Lemon Squeezy
 * webhook or admin action. Self-serve plan upgrade without payment
 * verification was a security vulnerability.
 */
export async function PATCH() {
  return NextResponse.json(
    { error: "Plan changes are handled via payment provider" },
    { status: 403 }
  );
}
