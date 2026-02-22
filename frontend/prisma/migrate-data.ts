/**
 * One-time script to migrate data from SQLite (prod.db) to MySQL.
 *
 * Usage (on VPS):
 *   cd /var/www/seo-audit/frontend
 *   npm install better-sqlite3
 *   npx tsx prisma/migrate-data.ts
 *
 * After confirming MySQL has the data, you can:
 *   npm uninstall better-sqlite3
 *   rm prisma/migrate-data.ts
 */

import { PrismaClient } from "@prisma/client";
import Database from "better-sqlite3";

const SQLITE_PATH = process.argv[2] || "prisma/prod.db";

const mysql = new PrismaClient();
const sqlite = new Database(SQLITE_PATH, { readonly: true });

function getAll(table: string) {
  try {
    return sqlite.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
  } catch {
    console.log(`  ⏭ Table "${table}" not found in SQLite, skipping`);
    return [];
  }
}

function toDate(v: unknown): Date | null {
  if (v == null) return null;
  return new Date(v as string);
}

function toBool(v: unknown): boolean {
  return v === 1 || v === true;
}

async function main() {
  console.log(`Reading from SQLite: ${SQLITE_PATH}`);
  console.log(`Writing to MySQL: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ":***@")}\n`);

  // Clear MySQL tables first (reverse FK order) to avoid unique constraint conflicts
  console.log("Clearing existing MySQL data...");
  await mysql.verificationToken.deleteMany();
  await mysql.cronJobLog.deleteMany();
  await mysql.dailyReport.deleteMany();
  await mysql.creditTransaction.deleteMany();
  await mysql.userDailyQuota.deleteMany();
  await mysql.indexingLog.deleteMany();
  await mysql.indexedUrl.deleteMany();
  await mysql.site.deleteMany();
  await mysql.brandSettings.deleteMany();
  await mysql.audit.deleteMany();
  await mysql.session.deleteMany();
  await mysql.account.deleteMany();
  await mysql.user.deleteMany();
  await mysql.plan.deleteMany();
  console.log("Cleared.\n");

  // 1. Plans (seed should have created these, but upsert to be safe)
  const plans = getAll("Plan");
  console.log(`Plans: ${plans.length}`);
  for (const p of plans) {
    await mysql.plan.upsert({
      where: { id: p.id as string },
      update: {
        name: p.name as string,
        auditsPerMonth: p.auditsPerMonth as number,
        maxPages: p.maxPages as number,
        whiteLabel: toBool(p.whiteLabel),
        price: p.price as number,
      },
      create: {
        id: p.id as string,
        name: p.name as string,
        auditsPerMonth: p.auditsPerMonth as number,
        maxPages: p.maxPages as number,
        whiteLabel: toBool(p.whiteLabel),
        price: p.price as number,
      },
    });
  }

  // 2. Users
  const users = getAll("User");
  console.log(`Users: ${users.length}`);
  for (const u of users) {
    await mysql.user.upsert({
      where: { id: u.id as string },
      update: {},
      create: {
        id: u.id as string,
        name: u.name as string | null,
        email: u.email as string,
        emailVerified: toDate(u.emailVerified),
        password: u.password as string | null,
        image: u.image as string | null,
        role: (u.role as string) || "user",
        planId: (u.planId as string) || "free",
        createdAt: toDate(u.createdAt) || new Date(),
        updatedAt: toDate(u.updatedAt) || new Date(),
        gscConnected: toBool(u.gscConnected),
        gscConnectedAt: toDate(u.gscConnectedAt),
        indexingCredits: (u.indexingCredits as number) || 0,
        creditLowWarningSent: toBool(u.creditLowWarningSent),
        emailReports: u.emailReports != null ? toBool(u.emailReports) : true,
      },
    });
  }

  // 3. Accounts (OAuth)
  const accounts = getAll("Account");
  console.log(`Accounts: ${accounts.length}`);
  for (const a of accounts) {
    await mysql.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: a.provider as string,
          providerAccountId: a.providerAccountId as string,
        },
      },
      update: {},
      create: {
        id: a.id as string,
        userId: a.userId as string,
        type: a.type as string,
        provider: a.provider as string,
        providerAccountId: a.providerAccountId as string,
        refresh_token: a.refresh_token as string | null,
        access_token: a.access_token as string | null,
        expires_at: a.expires_at as number | null,
        token_type: a.token_type as string | null,
        scope: a.scope as string | null,
        id_token: a.id_token as string | null,
        session_state: a.session_state as string | null,
      },
    });
  }

  // 4. Sessions
  const sessions = getAll("Session");
  console.log(`Sessions: ${sessions.length}`);
  for (const s of sessions) {
    await mysql.session.upsert({
      where: { id: s.id as string },
      update: {},
      create: {
        id: s.id as string,
        sessionToken: s.sessionToken as string,
        userId: s.userId as string,
        expires: toDate(s.expires) || new Date(),
      },
    });
  }

  // 5. Audits
  const audits = getAll("Audit");
  console.log(`Audits: ${audits.length}`);
  for (const a of audits) {
    await mysql.audit.upsert({
      where: { id: a.id as string },
      update: {},
      create: {
        id: a.id as string,
        fastApiId: a.fastApiId as string,
        userId: a.userId as string,
        url: a.url as string,
        status: (a.status as string) || "pending",
        language: (a.language as string) || "en",
        pagesCrawled: (a.pagesCrawled as number) || 0,
        totalIssues: (a.totalIssues as number) || 0,
        criticalIssues: (a.criticalIssues as number) || 0,
        warnings: (a.warnings as number) || 0,
        passedChecks: (a.passedChecks as number) || 0,
        resultJson: a.resultJson as string | null,
        reportPath: a.reportPath as string | null,
        errorMessage: a.errorMessage as string | null,
        startedAt: toDate(a.startedAt) || new Date(),
        completedAt: toDate(a.completedAt),
      },
    });
  }

  // 6. BrandSettings
  const brands = getAll("BrandSettings");
  console.log(`BrandSettings: ${brands.length}`);
  for (const b of brands) {
    await mysql.brandSettings.upsert({
      where: { id: b.id as string },
      update: {},
      create: {
        id: b.id as string,
        userId: b.userId as string,
        companyName: b.companyName as string | null,
        logoUrl: b.logoUrl as string | null,
        primaryColor: (b.primaryColor as string) || "#2563eb",
        accentColor: (b.accentColor as string) || "#7c3aed",
      },
    });
  }

  // 7. Sites
  const sites = getAll("Site");
  console.log(`Sites: ${sites.length}`);
  for (const s of sites) {
    await mysql.site.upsert({
      where: { id: s.id as string },
      update: {},
      create: {
        id: s.id as string,
        userId: s.userId as string,
        domain: s.domain as string,
        gscPermissionLevel: s.gscPermissionLevel as string | null,
        autoIndexGoogle: toBool(s.autoIndexGoogle),
        autoIndexBing: toBool(s.autoIndexBing),
        sitemapUrl: s.sitemapUrl as string | null,
        indexnowKey: s.indexnowKey as string | null,
        lastSyncedAt: toDate(s.lastSyncedAt),
        createdAt: toDate(s.createdAt) || new Date(),
        updatedAt: toDate(s.updatedAt) || new Date(),
      },
    });
  }

  // 8. IndexedUrls
  const urls = getAll("IndexedUrl");
  console.log(`IndexedUrls: ${urls.length}`);
  for (const u of urls) {
    await mysql.indexedUrl.upsert({
      where: { id: u.id as string },
      update: {},
      create: {
        id: u.id as string,
        siteId: u.siteId as string,
        url: u.url as string,
        gscStatus: u.gscStatus as string | null,
        indexingStatus: (u.indexingStatus as string) || "none",
        submissionMethod: (u.submissionMethod as string) || "none",
        submittedAt: toDate(u.submittedAt),
        lastSyncedAt: toDate(u.lastSyncedAt),
        errorMessage: u.errorMessage as string | null,
        httpStatus: u.httpStatus as number | null,
        isNew: toBool(u.isNew),
        isChanged: toBool(u.isChanged),
        lastmod: u.lastmod as string | null,
        retryCount: (u.retryCount as number) || 0,
        createdAt: toDate(u.createdAt) || new Date(),
        updatedAt: toDate(u.updatedAt) || new Date(),
      },
    });
  }

  // 9. IndexingLogs
  const logs = getAll("IndexingLog");
  console.log(`IndexingLogs: ${logs.length}`);
  for (const l of logs) {
    await mysql.indexingLog.upsert({
      where: { id: l.id as string },
      update: {},
      create: {
        id: l.id as string,
        indexedUrlId: l.indexedUrlId as string | null,
        userId: l.userId as string,
        action: l.action as string,
        details: l.details as string | null,
        createdAt: toDate(l.createdAt) || new Date(),
      },
    });
  }

  // 10. UserDailyQuotas
  const quotas = getAll("UserDailyQuota");
  console.log(`UserDailyQuotas: ${quotas.length}`);
  for (const q of quotas) {
    await mysql.userDailyQuota.upsert({
      where: { id: q.id as string },
      update: {},
      create: {
        id: q.id as string,
        userId: q.userId as string,
        date: q.date as string,
        googleSubmissions: (q.googleSubmissions as number) || 0,
        inspectionsUsed: (q.inspectionsUsed as number) || 0,
      },
    });
  }

  // 11. CreditTransactions
  const txns = getAll("CreditTransaction");
  console.log(`CreditTransactions: ${txns.length}`);
  for (const t of txns) {
    await mysql.creditTransaction.upsert({
      where: { id: t.id as string },
      update: {},
      create: {
        id: t.id as string,
        userId: t.userId as string,
        amount: t.amount as number,
        balanceAfter: t.balanceAfter as number,
        type: t.type as string,
        description: t.description as string,
        lsOrderId: t.lsOrderId as string | null,
        createdAt: toDate(t.createdAt) || new Date(),
      },
    });
  }

  // 12. DailyReports
  const reports = getAll("DailyReport");
  console.log(`DailyReports: ${reports.length}`);
  for (const r of reports) {
    await mysql.dailyReport.upsert({
      where: { id: r.id as string },
      update: {},
      create: {
        id: r.id as string,
        siteId: r.siteId as string,
        userId: r.userId as string,
        reportDate: r.reportDate as string,
        newPagesFound: (r.newPagesFound as number) || 0,
        changedPagesFound: (r.changedPagesFound as number) || 0,
        removedPagesFound: (r.removedPagesFound as number) || 0,
        submittedGoogle: (r.submittedGoogle as number) || 0,
        submittedGoogleFailed: (r.submittedGoogleFailed as number) || 0,
        submittedBing: (r.submittedBing as number) || 0,
        submittedBingFailed: (r.submittedBingFailed as number) || 0,
        pages404: (r.pages404 as number) || 0,
        totalIndexed: (r.totalIndexed as number) || 0,
        totalUrls: (r.totalUrls as number) || 0,
        creditsUsed: (r.creditsUsed as number) || 0,
        creditsRemaining: (r.creditsRemaining as number) || 0,
        details: r.details as string | null,
        createdAt: toDate(r.createdAt) || new Date(),
      },
    });
  }

  // 13. CronJobLogs
  const cronLogs = getAll("CronJobLog");
  console.log(`CronJobLogs: ${cronLogs.length}`);
  for (const c of cronLogs) {
    await mysql.cronJobLog.upsert({
      where: { id: c.id as string },
      update: {},
      create: {
        id: c.id as string,
        jobName: c.jobName as string,
        lastRunAt: toDate(c.lastRunAt) || new Date(),
        lastResult: c.lastResult as string,
        lastSummary: c.lastSummary as string | null,
        updatedAt: toDate(c.updatedAt) || new Date(),
      },
    });
  }

  // 14. VerificationTokens
  const tokens = getAll("VerificationToken");
  console.log(`VerificationTokens: ${tokens.length}`);
  for (const t of tokens) {
    await mysql.verificationToken.upsert({
      where: {
        identifier_token: {
          identifier: t.identifier as string,
          token: t.token as string,
        },
      },
      update: {},
      create: {
        identifier: t.identifier as string,
        token: t.token as string,
        expires: toDate(t.expires) || new Date(),
      },
    });
  }

  console.log("\nMigration complete!");
}

main()
  .then(() => {
    sqlite.close();
    return mysql.$disconnect();
  })
  .catch((e) => {
    console.error("Migration failed:", e);
    sqlite.close();
    mysql.$disconnect();
    process.exit(1);
  });
