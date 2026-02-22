**Task 2.5 — Indexing Landing Page**

You're building a marketing landing page for the indexing product at `/indexing`. It uses the marketing layout (no sidebar, public access) created in Task 1.5. The design must match the main landing page (`/`) and https://lvdev.co exactly — same fonts, colors, button styles, spacing.

**Before you start:** Read through the existing marketing layout and the main landing page (`/`). Understand the component structure, how sections are built, how responsive breakpoints work, and what shared components exist (header, footer, buttons, pricing cards). Reuse everything you can — don't create duplicate components.

---

### Step 1: Page Setup

- Create the page at the `/indexing` route inside the `(marketing)` route group
- It should use the same marketing layout as `/` (header + footer, no sidebar)
- SEO: set proper `<title>`, `<meta description>`, and Open Graph tags
  - Title: "Get Your Pages Indexed by Google in Hours — SEO Audit Online"
  - Description: "Submit your URLs to Google, Bing, and Yandex for faster indexing. Monitor your index coverage with Google Search Console integration. Credit-based pricing, no subscription required."

---

### Step 2: Hero Section

**Layout:** Same 50/50 split as the main landing page hero.

**Left side:**
- Heading: "Get Your Pages Indexed by Google in Hours, Not Weeks"
- Subheading: "Connect Google Search Console, see which pages aren't indexed, and submit them to Google, Bing, and Yandex with one click. Monitor everything automatically."
- CTA buttons:
  - Primary: "Start Indexing — Free" → links to `/dashboard/indexing` (will prompt login/signup if not authenticated)
  - Secondary: "View Pricing" → scrolls to pricing section on the same page

**Right side:**
- Screenshot/mockup of the indexing dashboard showing the URL table with status badges, stats bar, and auto-indexing toggles
- If you don't have a real screenshot yet, create a clean placeholder or use the actual dashboard layout as a static image component

---

### Step 3: How It Works Section

3-step visual flow (match the style of the main landing page's "how it works" if it exists):

**Step 1: Connect Google Search Console**
- Icon: Google/GSC logo or a link/connect icon
- Description: "Sign in with Google and connect your Search Console. We'll automatically pull your sites and index data."

**Step 2: See What's Not Indexed**
- Icon: Search/magnifying glass or chart icon
- Description: "View which pages Google has indexed, which ones it hasn't, and why. Get actionable tips to fix indexing issues."

**Step 3: Submit & Monitor**
- Icon: Rocket/send icon
- Description: "Submit pages to Google, Bing, and Yandex with one click. Enable auto-indexing and get daily reports — we handle the rest."

---

### Step 4: Features Section

Grid of feature cards (4-6 features). Each card: icon + title + short description.

**Features:**

1. **Google Search Console Integration**
   "Connect your GSC account and pull real index data. See exactly what Google sees — no guessing."

2. **One-Click Indexing**
   "Submit URLs to Google's Indexing API, Bing, Yandex, and DuckDuckGo via IndexNow. Uses your own Google quota — 200 submissions/day included free."

3. **Auto-Indexing**
   "Turn it on and forget about it. We monitor your sitemap daily, detect new pages, and submit them automatically."

4. **404 & Error Detection**
   "We check every URL before submitting. Broken pages, redirects, and noindex tags are flagged so you don't waste credits."

5. **Daily Email Reports**
   "Get a summary every morning: new pages found, URLs submitted, indexing progress, and any issues detected."

6. **Actionable Tips**
   "Not just data — we tell you why pages aren't indexed and what to do about it. Blocked by robots.txt? Noindex tag? Thin content? We'll flag it."

---

### Step 5: Pricing Section

**Heading:** "Simple Credit-Based Pricing"
**Subheading:** "No monthly subscription for indexing. Buy credits when you need them. Each credit = 1 URL submitted to Google. IndexNow submissions (Bing, Yandex, DuckDuckGo) are always free."

**3 pricing cards (match the style of the main landing page's pricing cards):**

**Starter — $5**
- 50 credits
- ~$0.10 per URL
- "Buy Starter" button → Lemon Squeezy checkout (or login prompt if not authenticated)

**Growth — $15**
- 200 credits
- ~$0.075 per URL
- "Most Popular" badge
- "Buy Growth" button

**Scale — $39**
- 1,000 credits
- ~$0.039 per URL
- "Best Value" badge
- "Buy Scale" button

**Below the cards:**
- "IndexNow submissions to Bing, Yandex, and DuckDuckGo are always free — no credits needed."
- "Your Google quota (200/day) is included with your Google Search Console connection — credits are only for our submission service."

---

### Step 6: FAQ Section

**Q: How does the Google Indexing API work?**
A: When you submit a URL through our tool, we use Google's official Indexing API to notify Google that your page needs to be crawled and indexed. This is significantly faster than waiting for Google to discover your page naturally.

**Q: What's the difference between Google indexing and IndexNow?**
A: Google Indexing API submits to Google specifically and costs 1 credit per URL. IndexNow submits to Bing, Yandex, and DuckDuckGo simultaneously and is completely free — no credits needed.

**Q: Do I need a Google Search Console account?**
A: Yes. We pull your site data and index status directly from GSC. You'll connect it via Google OAuth when you sign up — takes about 10 seconds.

**Q: What's the daily limit?**
A: Google allows 200 Indexing API submissions per day per account. This limit is on Google's side, not ours. IndexNow has no practical daily limit.

**Q: Will this guarantee my pages get indexed?**
A: Submitting a URL tells Google to look at it, but Google still decides whether to index it. Pages with thin content, noindex tags, or other issues may not be indexed even after submission. We show you exactly why and how to fix it.

**Q: What happens when I run out of credits?**
A: You can still use all monitoring and GSC features for free. You just can't submit new URLs to Google until you buy more credits. IndexNow submissions remain free.

**Q: Can I use this with multiple websites?**
A: Yes. Any site verified in your Google Search Console is available. Credits are shared across all your sites.

---

### Step 7: CTA / Bottom Section

**Before the footer, add a final CTA block:**
- Heading: "Stop Waiting for Google to Find Your Pages"
- Subheading: "Connect your Search Console and start indexing in under a minute."
- Button: "Get Started Free" → `/dashboard/indexing`

---

### Step 8: Responsive

- Hero: stack vertically on mobile (text on top, image below)
- How it works: vertical stack on mobile
- Features grid: 2 columns on tablet, 1 column on mobile
- Pricing cards: horizontal scroll or stack on mobile
- FAQ: full-width accordion on all sizes
- Test on 320px, 768px, 1024px, 1440px widths

---

### Step 9: Navigation Integration

- Add "Indexing" to the marketing header navigation (between existing nav items)
- On the main landing page (`/`), add a brief mention/link to the indexing product if appropriate (e.g., in features section or as a banner)
- On the `/pricing` page (if it exists), include the indexing credit packs alongside the subscription plans

---

**Reuse existing components wherever possible — don't duplicate the header, footer, pricing card, FAQ accordion, or button components. Match the main landing page pixel-for-pixel in terms of spacing, typography, and colors. Work section by section.**
