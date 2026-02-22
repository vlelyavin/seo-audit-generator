import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { CREDIT_PACKS, getCreditPack, type CreditPackId } from "@/lib/credits";

const LS_API_KEY = process.env.LEMONSQUEEZY_API_KEY;
const LS_STORE_ID = process.env.LEMONSQUEEZY_STORE_ID;

/**
 * POST /api/indexing/credits/checkout
 * Generates a Lemon Squeezy checkout URL for the given credit pack.
 * Body: { pack: "starter" | "growth" | "scale" }
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!LS_API_KEY || !LS_STORE_ID) {
    return NextResponse.json(
      { error: "Payment system not configured" },
      { status: 503 }
    );
  }

  const body = await req.json();
  const packId = body.pack as CreditPackId;
  const pack = getCreditPack(packId);

  if (!pack) {
    return NextResponse.json(
      { error: "Invalid pack. Must be one of: " + CREDIT_PACKS.map((p) => p.id).join(", ") },
      { status: 400 }
    );
  }

  const variantId = process.env[pack.variantIdEnv];
  if (!variantId) {
    return NextResponse.json(
      { error: "Credit pack variant not configured" },
      { status: 503 }
    );
  }

  // Build checkout via Lemon Squeezy API
  const lsResponse = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${LS_API_KEY}`,
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            email: session.user.email,
            custom: {
              user_id: session.user.id,
              credit_pack: packId,
            },
          },
          product_options: {
            redirect_url: `${process.env.AUTH_URL}/dashboard/plans#credits`,
          },
        },
        relationships: {
          store: {
            data: { type: "stores", id: LS_STORE_ID },
          },
          variant: {
            data: { type: "variants", id: variantId },
          },
        },
      },
    }),
  });

  if (!lsResponse.ok) {
    const err = await lsResponse.text();
    console.error("[credits/checkout] Lemon Squeezy error:", err);
    return NextResponse.json(
      { error: "Failed to create checkout" },
      { status: 502 }
    );
  }

  const lsData = await lsResponse.json();
  const checkoutUrl = lsData?.data?.attributes?.url;

  if (!checkoutUrl) {
    return NextResponse.json(
      { error: "No checkout URL returned" },
      { status: 502 }
    );
  }

  return NextResponse.json({ checkout_url: checkoutUrl });
}
