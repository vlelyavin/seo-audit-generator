/**
 * One-time migration script: encrypts existing plaintext OAuth tokens in the Account table.
 *
 * Prerequisites:
 *   - Set TOKEN_ENCRYPTION_KEY in .env (64-char hex string, 32 bytes)
 *   - Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Usage:
 *   cd frontend
 *   npx tsx prisma/encrypt-tokens.ts
 *
 * Safe to run multiple times — already-encrypted tokens (prefixed with "enc:") are skipped.
 */

import { PrismaClient } from "@prisma/client";
import { encryptToken, isEncryptionEnabled } from "../src/lib/token-encryption";

const prisma = new PrismaClient();

async function main() {
  if (!isEncryptionEnabled()) {
    console.error("TOKEN_ENCRYPTION_KEY is not set. Aborting.");
    process.exit(1);
  }

  const accounts = await prisma.account.findMany({
    select: { id: true, access_token: true, refresh_token: true },
  });

  let encrypted = 0;
  let skipped = 0;

  for (const account of accounts) {
    const updates: Record<string, string> = {};

    if (account.access_token && !account.access_token.startsWith("enc:")) {
      updates.access_token = encryptToken(account.access_token);
    }
    if (account.refresh_token && !account.refresh_token.startsWith("enc:")) {
      updates.refresh_token = encryptToken(account.refresh_token);
    }

    if (Object.keys(updates).length > 0) {
      await prisma.account.update({
        where: { id: account.id },
        data: updates,
      });
      encrypted++;
    } else {
      skipped++;
    }
  }

  console.log(
    `Done. Encrypted: ${encrypted} account(s), Skipped (already encrypted or no tokens): ${skipped}`
  );
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
