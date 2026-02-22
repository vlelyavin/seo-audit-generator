import { prisma } from "@/lib/prisma";

export const CREDIT_PACKS = [
  {
    id: "starter" as const,
    credits: 50,
    price: 5,
    price_formatted: "$5",
    variantIdEnv: "LS_CREDITS_STARTER_VARIANT_ID",
  },
  {
    id: "growth" as const,
    credits: 200,
    price: 15,
    price_formatted: "$15",
    variantIdEnv: "LS_CREDITS_GROWTH_VARIANT_ID",
  },
  {
    id: "scale" as const,
    credits: 1000,
    price: 39,
    price_formatted: "$39",
    variantIdEnv: "LS_CREDITS_SCALE_VARIANT_ID",
  },
] as const;

export type CreditPackId = (typeof CREDIT_PACKS)[number]["id"];

export const CREDIT_LOW_THRESHOLD = 10;

/** Map a Lemon Squeezy variant ID to a credit amount. Returns null if unknown. */
export function creditAmountForVariantId(variantId: string): number | null {
  for (const pack of CREDIT_PACKS) {
    const envVal = process.env[pack.variantIdEnv];
    if (envVal && envVal === variantId) {
      return pack.credits;
    }
  }
  return null;
}

/** Get a credit pack by its ID. */
export function getCreditPack(id: CreditPackId) {
  return CREDIT_PACKS.find((p) => p.id === id) ?? null;
}

/**
 * Atomically add credits to a user, creating a CreditTransaction record.
 * Returns the updated credit balance.
 */
export async function addCredits(
  userId: string,
  amount: number,
  type: "purchase" | "bonus",
  description: string,
  lsOrderId?: string
): Promise<number> {
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { indexingCredits: { increment: amount } },
      select: { indexingCredits: true },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount,
        balanceAfter: user.indexingCredits,
        type,
        description,
        lsOrderId: lsOrderId ?? null,
      },
    });

    return user.indexingCredits;
  });

  return result;
}

/**
 * Atomically deduct credits from a user, creating a CreditTransaction record.
 * Throws if the user doesn't have enough credits.
 * Returns the updated credit balance.
 */
export async function deductCredits(
  userId: string,
  amount: number,
  description: string
): Promise<number> {
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { indexingCredits: true },
    });

    if (!user || user.indexingCredits < amount) {
      throw new Error("not_enough_credits");
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: { indexingCredits: { decrement: amount } },
      select: { indexingCredits: true },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount: -amount,
        balanceAfter: updated.indexingCredits,
        type: "usage",
        description,
      },
    });

    return updated.indexingCredits;
  });

  return result;
}

/**
 * Atomically refund credits to a user, creating a CreditTransaction record.
 * Returns the updated credit balance.
 */
export async function refundCredits(
  userId: string,
  amount: number,
  description: string
): Promise<number> {
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { indexingCredits: { increment: amount } },
      select: { indexingCredits: true },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount,
        balanceAfter: updated.indexingCredits,
        type: "refund",
        description,
      },
    });

    return updated.indexingCredits;
  });

  return result;
}
