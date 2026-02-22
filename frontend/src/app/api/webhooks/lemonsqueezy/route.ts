import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { addCredits, creditAmountForVariantId, CREDIT_LOW_THRESHOLD } from "@/lib/credits";

const LS_WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

/** Verify Lemon Squeezy HMAC-SHA256 signature. */
async function verifySignature(rawBody: string, signature: string): Promise<boolean> {
  if (!LS_WEBHOOK_SECRET) return false;
  const expected = crypto
    .createHmac("sha256", LS_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/**
 * POST /api/webhooks/lemonsqueezy
 * Handles Lemon Squeezy webhook events for credit pack purchases.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-signature") ?? "";

  if (!LS_WEBHOOK_SECRET) {
    console.error("[ls-webhook] LEMONSQUEEZY_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const valid = await verifySignature(rawBody, signature);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventName = (event.meta as Record<string, unknown>)?.event_name as string;

  if (eventName !== "order_created") {
    // Acknowledge but ignore other events
    return NextResponse.json({ received: true });
  }

  const data = event.data as Record<string, unknown>;
  const attributes = data?.attributes as Record<string, unknown>;
  const relationships = data?.relationships as Record<string, unknown>;

  // Extract order ID
  const orderId = String(data?.id ?? "");

  // Extract variant ID from relationships
  const variantData = (relationships?.variant as Record<string, unknown>)?.data as Record<string, unknown>;
  const variantId = String(variantData?.id ?? "");

  // Extract custom data (user_id passed during checkout)
  const customData = attributes?.custom_data as Record<string, unknown> | null;
  const userId = customData?.user_id as string | undefined;

  if (!userId) {
    console.error("[ls-webhook] order_created: no user_id in custom_data", { orderId });
    return NextResponse.json({ received: true });
  }

  if (!variantId) {
    console.error("[ls-webhook] order_created: no variant ID", { orderId });
    return NextResponse.json({ received: true });
  }

  // Map variant → credit amount
  const creditAmount = creditAmountForVariantId(variantId);
  if (creditAmount === null) {
    console.error("[ls-webhook] order_created: unknown variant ID", { variantId, orderId });
    return NextResponse.json({ received: true });
  }

  // Idempotency check: skip if this order was already processed
  const existing = await prisma.creditTransaction.findFirst({
    where: { lsOrderId: orderId },
  });
  if (existing) {
    console.log("[ls-webhook] order_created: duplicate webhook, skipping", { orderId });
    return NextResponse.json({ received: true });
  }

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) {
    console.error("[ls-webhook] order_created: user not found", { userId, orderId });
    return NextResponse.json({ received: true });
  }

  // Determine pack name for description
  const packName =
    creditAmount <= 50
      ? "Starter Pack"
      : creditAmount <= 200
      ? "Growth Pack"
      : "Scale Pack";

  // Add credits atomically
  const newBalance = await addCredits(
    userId,
    creditAmount,
    "purchase",
    `${packName} (${creditAmount} credits)`,
    orderId
  );

  // Check if we should clear the low-credit warning flag
  if (newBalance >= CREDIT_LOW_THRESHOLD) {
    await prisma.user.update({
      where: { id: userId },
      data: { creditLowWarningSent: false },
    });
  }

  console.log("[ls-webhook] Credits added", { userId, creditAmount, newBalance, orderId });

  return NextResponse.json({ received: true });
}
