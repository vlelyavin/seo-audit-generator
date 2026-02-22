-- AlterTable: Add GSC fields to User
ALTER TABLE "User" ADD COLUMN "gscConnected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "gscConnectedAt" DATETIME;

-- CreateTable: Site
CREATE TABLE "Site" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "gscPermissionLevel" TEXT,
    "autoIndexGoogle" BOOLEAN NOT NULL DEFAULT false,
    "autoIndexBing" BOOLEAN NOT NULL DEFAULT false,
    "sitemapUrl" TEXT,
    "indexnowKey" TEXT,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Site_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex: Site unique
CREATE UNIQUE INDEX "Site_userId_domain_key" ON "Site"("userId", "domain");

-- CreateTable: IndexedUrl
CREATE TABLE "IndexedUrl" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "gscStatus" TEXT,
    "indexingStatus" TEXT NOT NULL DEFAULT 'none',
    "submissionMethod" TEXT NOT NULL DEFAULT 'none',
    "submittedAt" DATETIME,
    "lastSyncedAt" DATETIME,
    "errorMessage" TEXT,
    "httpStatus" INTEGER,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "isChanged" BOOLEAN NOT NULL DEFAULT false,
    "lastmod" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IndexedUrl_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex: IndexedUrl unique
CREATE UNIQUE INDEX "IndexedUrl_siteId_url_key" ON "IndexedUrl"("siteId", "url");

-- CreateTable: IndexingLog
CREATE TABLE "IndexingLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "indexedUrlId" TEXT,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IndexingLog_indexedUrlId_fkey" FOREIGN KEY ("indexedUrlId") REFERENCES "IndexedUrl" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IndexingLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: UserDailyQuota
CREATE TABLE "UserDailyQuota" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "googleSubmissions" INTEGER NOT NULL DEFAULT 0,
    "inspectionsUsed" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "UserDailyQuota_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex: UserDailyQuota unique
CREATE UNIQUE INDEX "UserDailyQuota_userId_date_key" ON "UserDailyQuota"("userId", "date");
