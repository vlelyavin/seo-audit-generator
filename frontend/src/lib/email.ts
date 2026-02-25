/**
 * Email utility — sends transactional emails via SMTP (nodemailer).
 *
 * Required env vars:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, ADMIN_EMAIL
 */

import nodemailer from "nodemailer";

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

const FROM = process.env.EMAIL_FROM ?? "noreply@seo-audit.online";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const APP_URL = process.env.AUTH_URL ?? "http://localhost:3000";

/** Send a raw email. Returns true on success. */
export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  const transport = createTransport();
  if (!transport) {
    console.warn("[email] SMTP not configured — skipping email to", to);
    return false;
  }

  try {
    await transport.sendMail({ from: FROM, to, subject, html });
    return true;
  } catch (e) {
    console.error("[email] Failed to send email to", to, e);
    return false;
  }
}

// ── Email Builders ─────────────────────────────────────────────────────────────

function baseLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
          <!-- Header -->
          <tr>
            <td style="background:#111827;padding:24px 32px;">
              <span style="color:#ffffff;font-size:18px;font-weight:700;">SEO Audit</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#6b7280;font-size:13px;">
                You're receiving this because you have auto-indexing enabled.
                <a href="${APP_URL}/dashboard/settings" style="color:#111827;">Manage email preferences</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function statRow(label: string, value: string | number): string {
  return `<tr>
    <td style="padding:8px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">${label}</td>
    <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #f3f4f6;">${value}</td>
  </tr>`;
}

function ctaButton(text: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">${text}</a>`;
}

// ── Email Senders ─────────────────────────────────────────────────────────────

export interface DailyReportEmailData {
  newPagesFound: number;
  submittedGoogle: number;
  submittedGoogleFailed: number;
  submittedBing: number;
  submittedBingFailed: number;
  pages404: number;
  totalIndexed: number;
  totalUrls: number;
  creditsRemaining: number;
}

/**
 * A) Daily indexing report email.
 * Only sent when there's something to report (new pages, submissions, or errors).
 */
export async function sendDailyReportEmail(
  userEmail: string,
  domain: string,
  date: string,
  data: DailyReportEmailData,
  siteId: string
): Promise<boolean> {
  const coverage =
    data.totalUrls > 0
      ? `${data.totalIndexed}/${data.totalUrls} (${Math.round((data.totalIndexed / data.totalUrls) * 100)}%)`
      : "N/A";

  const dashboardUrl = `${APP_URL}/dashboard/indexator`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Indexing Report</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">${domain} &mdash; ${date}</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${statRow("New pages found", data.newPagesFound)}
      ${statRow("Submitted to Google", `${data.submittedGoogle}${data.submittedGoogleFailed > 0 ? ` (${data.submittedGoogleFailed} failed)` : ""}`)}
      ${statRow("Submitted to Bing / IndexNow", `${data.submittedBing}${data.submittedBingFailed > 0 ? ` (${data.submittedBingFailed} failed)` : ""}`)}
      ${statRow("404s detected", data.pages404)}
      ${statRow("Index coverage", coverage)}
      ${statRow("Credits remaining", data.creditsRemaining)}
    </table>

    ${ctaButton("View in Dashboard", dashboardUrl)}
  `;

  return sendEmail(
    userEmail,
    `Indexing Report for ${domain} — ${date}`,
    baseLayout(`Indexing Report — ${domain}`, body)
  );
}

/**
 * B) Low credits alert.
 * Sent when credits drop below CREDIT_LOW_THRESHOLD after a submission run.
 */
export async function sendLowCreditsEmail(
  userEmail: string,
  balance: number
): Promise<boolean> {
  const dashboardUrl = `${APP_URL}/dashboard/indexator`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Low Indexing Credits</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">
      Your indexing credit balance is running low.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${statRow("Credits remaining", balance)}
    </table>

    <p style="color:#374151;font-size:14px;line-height:1.6;">
      When your balance reaches 0, Google Indexing API submissions will be paused.
      Bing / IndexNow submissions are free and will continue.
    </p>

    ${ctaButton("Buy More Credits", dashboardUrl)}
  `;

  return sendEmail(
    userEmail,
    `Low indexing credits — ${balance} remaining`,
    baseLayout("Low Indexing Credits", body)
  );
}

/**
 * C) 404 alert.
 * Sent when new 404s are detected during the daily job.
 */
export async function send404AlertEmail(
  userEmail: string,
  domain: string,
  urls404: string[]
): Promise<boolean> {
  const displayUrls = urls404.slice(0, 20);
  const remaining = urls404.length - displayUrls.length;
  const dashboardUrl = `${APP_URL}/dashboard/indexator`;

  const urlList = displayUrls
    .map((url) => `<li style="padding:4px 0;color:#374151;font-size:13px;word-break:break-all;">${url}</li>`)
    .join("");

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">${urls404.length} Broken Page${urls404.length === 1 ? "" : "s"} Detected</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">
      The following URLs returned 404 / 410 during today's indexing check on <strong>${domain}</strong>:
    </p>

    <ul style="margin:0 0 16px;padding-left:20px;">
      ${urlList}
    </ul>

    ${remaining > 0 ? `<p style="color:#6b7280;font-size:13px;">… and ${remaining} more. View all in the dashboard.</p>` : ""}

    ${ctaButton("View in Dashboard", dashboardUrl)}
  `;

  return sendEmail(
    userEmail,
    `${urls404.length} broken page${urls404.length === 1 ? "" : "s"} detected on ${domain}`,
    baseLayout("Broken Pages Detected", body)
  );
}

/**
 * D) Token expired alert.
 * Sent when the user's Google OAuth token can no longer be refreshed.
 */
export async function sendTokenExpiredEmail(
  userEmail: string,
  domain: string
): Promise<boolean> {
  const reconnectUrl = `${APP_URL}/dashboard/indexator`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Google Search Console Disconnected</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">
      Auto-indexing for <strong>${domain}</strong> has been paused because your Google Search Console
      connection has expired and could not be automatically refreshed.
    </p>

    <p style="color:#374151;font-size:14px;line-height:1.6;">
      To resume automatic indexing, reconnect your Google account from the Indexing dashboard.
      This is usually caused by revoking access or Google expiring long-lived refresh tokens.
    </p>

    ${ctaButton("Reconnect Google Account", reconnectUrl)}
  `;

  return sendEmail(
    userEmail,
    `Google Search Console disconnected — action needed`,
    baseLayout("Google Account Disconnected", body)
  );
}

/**
 * Admin alert — sent when a cron job crashes entirely.
 */
export async function sendCronErrorAlert(
  jobName: string,
  error: string
): Promise<boolean> {
  if (!ADMIN_EMAIL) return false;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#dc2626;">Cron Job Failed</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Job: <strong>${jobName}</strong></p>
    <pre style="background:#f9fafb;border:1px solid #e5e7eb;padding:16px;border-radius:4px;font-size:12px;overflow-x:auto;white-space:pre-wrap;">${error}</pre>
    <p style="color:#374151;font-size:13px;">Time: ${new Date().toISOString()}</p>
  `;

  return sendEmail(
    ADMIN_EMAIL,
    `[ALERT] Cron job failed: ${jobName}`,
    baseLayout("Cron Job Failure", body)
  );
}
