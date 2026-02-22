-- AlterTable: add indexing_credits and credit_low_warning_sent to User
ALTER TABLE "User" ADD COLUMN "indexingCredits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "creditLowWarningSent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: CreditTransaction
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "lsOrderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CreditTransaction_userId_createdAt_idx" ON "CreditTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditTransaction_lsOrderId_idx" ON "CreditTransaction"("lsOrderId");
