-- Add emailReports preference to User
ALTER TABLE "User" ADD COLUMN "emailReports" BOOLEAN NOT NULL DEFAULT true;

-- Add retryCount to IndexedUrl for failed submission retries
ALTER TABLE "IndexedUrl" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;

-- Create DailyReport table — one record per site per day
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportDate" TEXT NOT NULL,
    "newPagesFound" INTEGER NOT NULL DEFAULT 0,
    "changedPagesFound" INTEGER NOT NULL DEFAULT 0,
    "removedPagesFound" INTEGER NOT NULL DEFAULT 0,
    "submittedGoogle" INTEGER NOT NULL DEFAULT 0,
    "submittedGoogleFailed" INTEGER NOT NULL DEFAULT 0,
    "submittedBing" INTEGER NOT NULL DEFAULT 0,
    "submittedBingFailed" INTEGER NOT NULL DEFAULT 0,
    "pages404" INTEGER NOT NULL DEFAULT 0,
    "totalIndexed" INTEGER NOT NULL DEFAULT 0,
    "totalUrls" INTEGER NOT NULL DEFAULT 0,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "creditsRemaining" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyReport_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DailyReport_siteId_reportDate_key" ON "DailyReport"("siteId", "reportDate");
CREATE INDEX "DailyReport_userId_reportDate_idx" ON "DailyReport"("userId", "reportDate");

-- Create CronJobLog table — tracks last run of each scheduled job
CREATE TABLE "CronJobLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobName" TEXT NOT NULL,
    "lastRunAt" DATETIME NOT NULL,
    "lastResult" TEXT NOT NULL,
    "lastSummary" TEXT,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "CronJobLog_jobName_key" ON "CronJobLog"("jobName");
