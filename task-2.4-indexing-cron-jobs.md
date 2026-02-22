**Task 2.4 — Indexing Cron Jobs & Email Alerts**

You're adding automated daily indexing and email notifications. The backend APIs (Task 2.1), credits system (Task 2.2), and dashboard (Task 2.3) already exist. You're building the scheduled jobs that tie everything together.

**Before you start:** Read through the existing codebase — especially the auto-indexing logic from Task 2.1 (Steps 5, 6, 7, 9), the credits system from Task 2.2, and any existing cron/scheduler patterns in the project. If there's no scheduler yet, you'll set one up.

---

### Step 1: Cron Infrastructure

Check if the project already has a task scheduler/cron system. If not, set one up.

**Options (pick whichever fits the existing stack):**
- APScheduler (Python, lightweight, good for single-process apps)
- Celery + Redis/RabbitMQ (if the project already uses a message broker)
- Simple cron endpoint + system crontab (most lightweight — just a `POST /api/cron/daily-indexing` endpoint called by system cron)

**Recommendation:** If nothing exists yet, go with the cron endpoint approach. Create a protected endpoint that system cron calls. Protect it with a secret token in the request header (env var `CRON_SECRET`). This is the simplest, most debuggable option.

---

### Step 2: Daily Auto-Index Job

**Endpoint:** `POST /api/cron/daily-indexing`
**Auth:** `Authorization: Bearer {CRON_SECRET}` — reject if missing or wrong
**Schedule:** Daily at 6:00 AM UTC (configure via system crontab)

**Job logic — for each site with auto-indexing enabled:**

1. **Sitemap check:**
   - Fetch and parse the site's sitemap(s)
   - Compare against stored URLs
   - Identify new pages, changed pages (updated `<lastmod>`), removed pages
   - Add new URLs to `indexed_urls` table with status `pending`

2. **404 detection:**
   - HEAD request on all new/changed URLs
   - Mark 404s/410s — skip them for submission
   - Mark redirects — flag but still allow submission of target URL

3. **Google Indexing (if `auto_index_google` is ON):**
   - Get user's remaining daily quota (200 - already used today)
   - Submit new pages first, then changed pages
   - Stop when quota runs out
   - Deduct credits per submission (check balance first — if not enough credits, skip and flag for email alert)
   - Log all submissions

4. **IndexNow/Bing (if `auto_index_bing` is ON):**
   - Batch submit all new/changed URLs via IndexNow
   - No credit cost, no meaningful rate limit
   - Log submissions

5. **Generate report data:**
   - Store results for this run (new pages found, submitted counts, failures, 404s)
   - Save to a `daily_reports` table or JSON field (see Step 3)

6. **Queue email alert** (see Step 4)

**Processing order:**
- Process sites sequentially (not parallel) to avoid rate limit issues
- If one site errors, log it and continue to the next — don't crash the whole job
- Log total job duration and per-site results

**Endpoint response:**
```json
{
  "sites_processed": 12,
  "sites_skipped": 3,
  "total_new_pages": 45,
  "total_submitted_google": 38,
  "total_submitted_bing": 45,
  "total_404s": 7,
  "errors": ["site_id 5: token expired"],
  "duration_seconds": 34
}
```

---

### Step 3: Daily Reports Storage

**Create `daily_reports` table:**
- `id` (primary key)
- `site_id` (foreign key → sites)
- `user_id` (foreign key → users)
- `report_date` (date)
- `new_pages_found` (integer)
- `changed_pages_found` (integer)
- `removed_pages_found` (integer)
- `submitted_google` (integer)
- `submitted_google_failed` (integer)
- `submitted_bing` (integer)
- `submitted_bing_failed` (integer)
- `pages_404` (integer)
- `total_indexed` (integer — current count of indexed URLs)
- `total_urls` (integer — current total URLs)
- `credits_used` (integer)
- `credits_remaining` (integer — after this run)
- `details` (JSON — full breakdown: list of new URLs, failed URLs, 404 URLs, error messages)
- `created_at`

Unique constraint on `(site_id, report_date)` — one report per site per day.

This is what the dashboard's report view (Task 2.3, Step 9) reads from via `GET /api/indexing/sites/{site_id}/report`.

---

### Step 4: Email Alerts

Send emails after the daily job completes. Use the existing email setup if one exists. If not, set up a simple email sender (SMTP or a transactional email service like Resend/Postmark — check what's available).

**Email types:**

**A) Daily indexing report (sent after each auto-index run):**
- Subject: "Indexing Report for {domain} — {date}"
- Content:
  - New pages found: X
  - Submitted to Google: X (Y failed)
  - Submitted to Bing: X (Y failed)
  - 404s detected: X
  - Index coverage: X/Y pages indexed (Z%)
  - Credits remaining: X
  - Link to dashboard for details
- Only send if there's something to report (skip if no new pages, no submissions, no errors)
- Respect user preference: `email_reports` boolean on user profile

**B) Low credits alert:**
- Trigger: credits drop below 10 after a submission
- Subject: "Low indexing credits — {X} remaining"
- Content: current balance, link to buy more, brief note about what happens at 0
- Only send once per low-credit event (use `credit_low_warning_sent` flag, reset when credits are purchased)

**C) 404 alert:**
- Trigger: new 404s detected during daily job
- Subject: "{X} broken pages detected on {domain}"
- Content: list of 404 URLs (max 20, link to dashboard for full list)
- Send as part of the daily report OR as a separate email if 404 count exceeds a threshold (e.g., 5+)

**D) Token expired alert:**
- Trigger: user's Google OAuth token fails to refresh
- Subject: "Google Search Console disconnected — action needed"
- Content: explain that their GSC connection needs re-authorization, link to reconnect
- Critical: auto-indexing can't work without valid tokens

**Email template:**
- Simple, clean HTML email
- Match the app's branding (colors, logo)
- Always include an unsubscribe/manage preferences link
- Always include a "View in dashboard" CTA button

---

### Step 5: Re-sync Index Status (Weekly)

Separate from the daily auto-index job — periodically re-check which URLs are now indexed.

**Endpoint:** `POST /api/cron/weekly-resync`
**Schedule:** Weekly, Sunday at 3:00 AM UTC

**Job logic per site:**
1. Pull fresh data from Search Analytics API (indexed URLs)
2. Compare against stored `gsc_status` values
3. Update URLs that changed status (e.g., "submitted" → "indexed", or "indexed" → "not indexed")
4. Update `last_synced_at` on each URL
5. Log changes

This lets users see when their submitted URLs actually get indexed without manually clicking sync.

---

### Step 6: Retry Failed Submissions

**Endpoint:** `POST /api/cron/retry-failed`
**Schedule:** Daily at 12:00 PM UTC (6 hours after main job)

**Job logic:**
- Find all URLs with `indexing_status = failed` and `error_message` indicating a retryable error (500, timeout, rate limit)
- Skip permanent failures (403 permission, 404)
- Retry submission (Google or IndexNow depending on original method)
- Max 3 retries per URL (add `retry_count` field to `indexed_urls` if not present)
- Deduct credits for successful Google retries (don't double-charge — only if original was refunded)

---

### Step 7: System Crontab Setup

Document the crontab entries needed:

```bash
# Daily auto-indexing (6 AM UTC)
0 6 * * * curl -s -X POST http://localhost:{PORT}/api/cron/daily-indexing -H "Authorization: Bearer ${CRON_SECRET}" >> /var/log/indexing-cron.log 2>&1

# Retry failed submissions (12 PM UTC)
0 12 * * * curl -s -X POST http://localhost:{PORT}/api/cron/retry-failed -H "Authorization: Bearer ${CRON_SECRET}" >> /var/log/indexing-cron.log 2>&1

# Weekly index status resync (Sunday 3 AM UTC)
0 3 * * 0 curl -s -X POST http://localhost:{PORT}/api/cron/weekly-resync -H "Authorization: Bearer ${CRON_SECRET}" >> /var/log/indexing-cron.log 2>&1
```

Add these to the project README or deployment docs.

---

### Step 8: Monitoring & Logging

- Log every cron job run: start time, end time, sites processed, errors
- If the daily job fails entirely (crash, timeout): send an alert email to the admin (your email, env var `ADMIN_EMAIL`)
- Add a `GET /api/cron/status` endpoint (admin only) that returns:
  - Last run time for each job
  - Last run result (success/fail)
  - Next scheduled run

---

### Environment Variables

```
CRON_SECRET=<random-secret-for-cron-auth>
ADMIN_EMAIL=<your-email-for-error-alerts>
SMTP_HOST=<if-using-smtp>
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=noreply@seo-audit.online
```

Or if using a transactional email API:
```
RESEND_API_KEY=<or-postmark-or-whatever>
```

---

**Work file by file. Build each step in order, verify it works, then move to the next. Don't scaffold everything at once.**
