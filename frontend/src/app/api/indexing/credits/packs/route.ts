import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { CREDIT_PACKS } from "@/lib/credits";

/**
 * GET /api/indexing/credits/packs
 * Returns the available credit packs (for display in UI).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const packs = CREDIT_PACKS.map(({ id, credits, price, price_formatted }) => ({
    id,
    credits,
    price,
    price_formatted,
  }));

  return NextResponse.json(packs);
}
