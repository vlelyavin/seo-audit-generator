import { handlers } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const { GET } = handlers;

// Rate-limit sign-in attempts: 10 req / min per IP
export async function POST(req: NextRequest) {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  if (!rateLimit(`auth:${ip}`, 10, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  return handlers.POST(req);
}
