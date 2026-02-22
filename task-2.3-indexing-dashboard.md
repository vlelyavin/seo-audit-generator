**Task 2.3 — Indexing Dashboard (Frontend)**

You're building the frontend for the indexing product in Next.js. The backend APIs already exist from Tasks 2.1 and 2.2. This is purely UI work — connecting to those endpoints and displaying the data.

**Before you start:** Read through the existing frontend codebase. Understand the component patterns, styling approach (CSS modules? Tailwind? styled-components?), how API calls are made, how auth state is accessed, and how other dashboard pages are structured. Match everything exactly.

---

### Step 1: Replace Indexing Placeholder

Task 1.3 added an "Indexing" sidebar item pointing to a placeholder. Replace it with the real page at `/dashboard/indexing`.

---

### Step 2: GSC Connection State

The first thing a user sees on the Indexing page depends on whether they've connected Google Search Console.

**Not connected:**
- Show a clean empty state: icon, heading "Connect Google Search Console", description explaining what it does
- Big CTA button: "Connect GSC" → triggers the OAuth flow (`GET /api/indexing/gsc/connect`)
- Below: brief explanation of what permissions are needed and why

**Connected:**
- Show connected email and a "Disconnect" option (small, not prominent)
- Proceed to show their sites (Step 3)

Use `GET /api/indexing/gsc/status` to check connection state on page load.

---

### Step 3: Site Selector

Once connected, show the user's sites from GSC.

**Implementation:**
- On first visit after connecting: auto-trigger `POST /api/indexing/sites/sync` to pull sites
- Show sites as a list or dropdown selector
- Each site shows: domain, permission level, last synced time
- "Refresh sites" button → re-syncs from GSC
- If user has multiple sites: let them select which one to view
- If only one site: auto-select it

---

### Step 4: Site Dashboard (Main View)

Once a site is selected, show the indexing dashboard. This is the core of the page.

**Layout — top stats bar:**
- Total URLs (from sitemap/GSC)
- Indexed (green)
- Not Indexed (red/orange)
- Submitted by us (blue)
- Failed (red)
- 404s detected (gray)

Pull from `GET /api/indexing/sites/{site_id}/stats`.

**Auto-indexing toggles:**
- Google Index: ON/OFF toggle with info tooltip explaining what it does
- Bing Index: ON/OFF toggle with info tooltip
- Use `PATCH /api/indexing/sites/{site_id}/auto-index` to update

**IndexNow setup notice:**
- If Bing auto-index is ON, show a notice: "Place your IndexNow key file at `{domain}/{key}.txt`" with the key value and a copy button
- Show a "Verify" button that checks if the key file is accessible

---

### Step 5: URL Table

The main content area — a table of all URLs for the selected site.

**Columns:**
- Checkbox (for bulk selection)
- URL (truncate long URLs, full URL on hover/tooltip)
- GSC Status (color-coded badge: "Indexed" green, "Crawled - not indexed" orange, "Discovered" yellow, "Unknown" gray, "Blocked" red)
- Our Status (badge: "Not submitted" gray, "Submitted" blue, "Failed" red)
- Last Synced (relative time: "2 hours ago", "3 days ago")
- Actions (inspect button, submit button)

**Features:**
- Filter by status: All | Indexed | Not Indexed | Submitted | Failed | 404
- Search/filter by URL string
- Pagination (50 per page)
- "Select all on this page" checkbox in header
- Bulk actions bar (appears when items selected): "Submit to Google", "Submit to Bing", "Inspect"

Pull from `GET /api/indexing/sites/{site_id}/urls?status=...&page=...`.

**Actionable tips:**
- When a URL has a GSC status with a tip (from Step 12 of Task 2.1), show it as a small info icon next to the status badge
- On click/hover: show the tip text in a tooltip or expandable row

---

### Step 6: Sync & Submit Actions

**Sync button (top right of URL table):**
- "Sync URLs" → calls `POST /api/indexing/sites/{site_id}/sync-urls`
- Show loading spinner during sync
- On complete: refresh the table and stats
- Show toast: "Synced 342 URLs. 15 new pages found."

**Submit buttons:**
- Single URL: click "Submit" in the row actions → submit that one URL
- Bulk: select URLs → click "Submit to Google" or "Submit to Bing" in the bulk action bar
- Before submitting to Google: show confirmation with credit cost: "Submit 15 URLs to Google? This will use 15 credits. You have 47 remaining."
- Before submitting to Bing: no credit warning (it's free), just confirm
- On submit: call `POST /api/indexing/sites/{site_id}/submit`
- Show progress/results: "Submitted 15 to Google, 15 to Bing. 2 skipped (404). Credits remaining: 32"

**Inspect button:**
- Single URL: click "Inspect" → calls `POST /api/indexing/sites/{site_id}/inspect` with that URL
- Show loading, then update the row with fresh GSC status + tip
- If daily inspection quota exhausted: show message with remaining count

---

### Step 7: Credits Display

**Credits indicator — always visible in the indexing page header:**
- Show current credits: "47 credits remaining"
- If low (< 10): show in orange/red
- If zero: show in red with "Buy credits" link
- Click → opens credit purchase modal or navigates to plans page

**Credit purchase section (can be a modal or section on the page):**
- Show 3 packs from `GET /api/indexing/credits/packs`
- Each pack: name, credits, price, "Buy" button
- Buy button → calls `POST /api/indexing/credits/checkout` → opens Lemon Squeezy overlay
- After purchase: refresh credits display (poll or webhook-triggered)

---

### Step 8: Quota Display

**Google API quota — show near the submit actions:**
- "Google submissions today: 15/200"
- Progress bar visual
- If approaching limit: orange warning
- If exhausted: red, disable Google submit buttons

Pull from `GET /api/indexing/sites/{site_id}/quota`.

---

### Step 9: Daily Report View

A tab or section showing the latest auto-indexing report.

**Layout:**
- Date of last auto-index run
- New pages detected (count + expandable list)
- Submitted to Google (count, success/fail breakdown)
- Submitted to Bing (count, success/fail breakdown)
- 404s found (count + expandable list)
- Overall index coverage: "285/342 pages indexed (83%)" with progress bar

Pull from `GET /api/indexing/sites/{site_id}/report`.

---

### Step 10: Loading & Empty States

Every section needs proper states:

- **Loading:** Skeleton loaders matching the layout (not just a spinner)
- **Empty (no sites):** "Connect GSC to get started" CTA
- **Empty (no URLs):** "Sync your sitemap to discover pages" CTA
- **Empty (no report):** "Enable auto-indexing to receive daily reports"
- **Error:** Clear error message with retry button

---

### Step 11: Responsive

- On mobile: URL table becomes a card list (each URL is a card with status badges)
- Stats bar: 2 columns on tablet, stacked on mobile
- Sidebar collapses as per existing app behavior
- Toggles and bulk actions remain usable on mobile

---

**Match the existing app's design system exactly — colors, fonts, spacing, component patterns. Don't introduce new UI libraries or patterns. Work page by page, component by component.**
