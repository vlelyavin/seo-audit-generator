# SEO Audit UI Tasks

All changes are in `frontend` folder

After completing all tasks, commit and push:

```
git add -A
git commit -m "ui: tab overflow, branding redesign, urls layout, indexnow fix, pricing icons"
git push
```

---

## 1. Fix vertical overflow on all tab panels

On the indexing page, site card tab panels use `overflow-hidden` on the tab content wrapper to prevent a spurious vertical scrollbar from appearing beside the tab strip. Apply the same fix across the entire project — every component or page that renders tab panels where a vertical scrollbar can appear to the right of the tab content area.

Reference: `src/app/[locale]/(dashboard)/dashboard/indexing/page.tsx` around line 1372 — `overflow-hidden` on the tab wrapper div.

---

## 2. Rename "General" settings tab to "Profile"

File: `src/app/[locale]/(dashboard)/dashboard/settings/layout.tsx`

- The nav tab uses `t("tabGeneral")`. Keep the key name, just change the translated values.

Files: `messages/en.json`, `messages/ru.json`, `messages/uk.json` — in the `settings` namespace:

- en: `"tabGeneral": "Profile"`
- ru: `"tabGeneral": "Профиль"`
- uk: `"tabGeneral": "Профіль"`

---

## 3. Branding page redesign

File: `src/app/[locale]/(dashboard)/dashboard/settings/branding/page.tsx`

### 3a. Remove the description paragraph

Remove this block from the JSX:

```tsx
<p className="text-sm text-gray-400">{t("description")}</p>
```

Also remove the `"description"` key from the `branding` namespace in all three translation files.

### 3b. Add "Branding" heading inside the form

Add `<h2>` as the first child of `<form>`, matching the pattern from `src/app/[locale]/(dashboard)/dashboard/settings/page.tsx`:

```tsx
<h2 className="mb-4 text-lg font-semibold text-white">{t("title")}</h2>
```

Add `"title"` to the `branding` namespace in all translation files:

- en: `"title": "Branding"`
- ru: `"title": "Брендинг"`
- uk: `"title": "Брендинг"`

### 3c. Add field descriptions

Under each field's `<label>`, add a `<p>` with description text before the input.

**Company Name** — add after the `<label>`:

```tsx
<p className="mb-2 text-xs text-gray-500">{t("companyNameDescription")}</p>
```

Translations:

- en: `"companyNameDescription": "Your company name will appear in the header of exported PDF, HTML, and DOCX reports."`
- ru: `"companyNameDescription": "Название компании будет отображаться в заголовке экспортированных отчётов (PDF, HTML, DOCX)."`
- uk: `"companyNameDescription": "Назва компанії відображатиметься у заголовку експортованих звітів (PDF, HTML, DOCX)."`

**Logo** — add after the `<label>`:

```tsx
<p className="mb-2 text-xs text-gray-500">{t("logoDescription")}</p>
```

Translations:

- en: `"logoDescription": "Your logo will appear at the top of exported reports. Recommended size: 250×80px, PNG or SVG."`
- ru: `"logoDescription": "Логотип будет отображаться в верхней части экспортированных отчётов. Рекомендуемый размер: 250×80px, PNG или SVG."`
- uk: `"logoDescription": "Логотип відображатиметься у верхній частині експортованих звітів. Рекомендований розмір: 250×80px, PNG або SVG."`

### 3d. Redesign the logo upload area

Replace the entire current logo upload UI (image preview + Upload button row) with a single drop zone.

**No separate Upload button** — all interaction happens through the drop zone.

Requirements:

- Width: `250px`, height: `~180px`
- `bg-gray-900`, `rounded-xl`, border: `border border-gray-700` by default
- On hover and on `dragover`: highlight with `border-copper ring-2 ring-copper/20` (add `isDragOver` state)
- Handle `onDragOver` / `onDragLeave` / `onDrop` events to accept dropped files
- The entire area is a `<label>` wrapping the hidden file input — clicking anywhere opens file picker
- Accept: `.png,.jpg,.jpeg,.gif,.webp,.svg,image/*`

**When no logo uploaded** — centered layout inside the drop zone:

- `ImageIcon` from lucide-react (h-8 w-8 text-gray-500)
- Title text: `{t("uploadPrompt")}` — en: `"Upload your company logo"`, ru: `"Загрузите логотип компании"`, uk: `"Завантажте логотип компанії"`
- Instruction text below: `{t("uploadInstruction")}` — en: `"Click to upload or drag & drop"`, ru: `"Нажмите или перетащите файл"`, uk: `"Натисніть або перетягніть файл"` (text-xs text-gray-500)

**When logo is uploaded** — show logo image centered (`object-contain`, padding 12px), with "Replace" overlay button (`{t("replaceLogo")}`) at the bottom center, visible on hover only (opacity-0 group-hover:opacity-100)

**During upload** — show spinner overlay (same semi-transparent dark overlay as before)

Show `uploadError` below the drop zone if present.

---

## 4. URLs tab — desktop layout

File: `src/app/[locale]/(dashboard)/dashboard/indexing/page.tsx`, URLs tab section (~line 1652).

**Desktop only (md+):** Put filter tabs and search input on one row — tabs on the left, search + refresh button on the right.

**Mobile:** Keep current stacked layout (unchanged).

Implementation:

```tsx
{
  /* Filter tabs + search row */
}
<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
  <div className="flex flex-wrap gap-1">{/* filter tab buttons */}</div>
  <div className="flex items-center gap-2">{/* search input + refresh button */}</div>
</div>;
```

---

## 5. Active URL filter tab — gradient + remove min-height

In the same URLs tab section (~line 1660), the active filter tab button uses `bg-copper text-white`.

Changes:

1. Replace `bg-copper` with `bg-gradient-to-r from-copper to-copper-light` on the active tab
2. Remove `min-h-[36px]` from the button className entirely

---

## 6. Pricing page — add icons to plan cards

File: `src/components/landing/pricing-section.tsx` (and/or `src/app/[locale]/(marketing)/pricing/page.tsx` if that's where plan cards are rendered).

Add a lucide-react icon to each plan card header. Pick the most fitting icon per tier — use your judgment. Suggested:

- Free / Starter: `Zap`
- Pro / Growth: `Rocket`
- Agency / Business: `Building2`

Place icon above or beside the plan name. Size: `h-6 w-6`. Color: `text-copper` for the highlighted plan, `text-gray-400` for others.

For plan action buttons:

- Button showing "Current plan" (or its translation equivalent): add `<Check className="h-4 w-4" />` before the text
- Button showing "Select plan" / "Get started": add `<ArrowRight className="h-4 w-4" />` before the text

---

## 7. IndexNow key file — download + fix verification logic

### 7a. Create download API endpoint

Create `src/app/api/indexing/sites/[siteId]/download-key/route.ts`:

```ts
// GET /api/indexing/sites/[siteId]/download-key
// Returns the IndexNow key file as a downloadable .txt file
```

Implementation:

- Auth check (same pattern as verify-key route)
- Look up site by siteId, verify ownership
- If no `indexnowKey`: return 400
- Return `new NextResponse(site.indexnowKey, { headers: { "Content-Type": "text/plain", "Content-Disposition": `attachment; filename="${site.indexnowKey}.txt"` } })`

### 7b. Update IndexNowVerifyModal — replace manual key copy with download button

File: `src/app/[locale]/(dashboard)/dashboard/indexing/page.tsx`, function `IndexNowVerifyModal` (~line 2637).

Replace Step 1 (the "copy the key value" block) with:

**Step 1: Download the file**

- A download button: `<a href={`/api/indexing/sites/${site.id}/download-key`} download>` styled as an orange CTA button
- Text: `{t("downloadKeyFile")}` — en: `"Download key file"`, ru: `"Скачать файл ключа"`, uk: `"Завантажити файл ключа"`
- Icon: `Download` from lucide-react

**Step 2: Upload to site root** — keep the instruction showing the expected URL:

```
Upload the file to your website root so it's accessible at:
{keyFileUrl}
```

Translation key `"verifyStep2"` stays, just make sure the instruction text is clear.

Keep the **Verify** button in the modal (Step 3 stays as is).

### 7c. Fix the race condition / stale state bug

**Bug:** After clicking "Re-verify" when the file is missing, the UI briefly shows the failure toast, then flips back to showing the file as verified.

**Root cause:** Some background effect or polling re-reads the site data from the server (which may still have `indexnowKeyVerified: true` from a previous successful verification) and overwrites the local state set by `handleVerifyFail`.

**Fix:**

1. In `reVerify()` (~line 1275): on failure, call `onVerifyFail()` **and** open the IndexNow modal (set `indexNowModal` state) instead of just showing a toast. This way the user sees the upload instructions instead of a disappearing toast.
2. Find any `useEffect` or polling that re-fetches site data from the API. After a failed verification, ensure the re-fetched data reflects the updated DB value (the `verify-key` endpoint already writes `indexnowKeyVerified: false` to DB on failure, so the re-fetched data should be correct — just make sure there's no stale cache or optimistic state overriding it).
3. If there's an optimistic update that sets `indexnowKeyVerified: true` before the verify call resolves, remove it.

### 7d. Guard "Submit All Not Indexed (Bing)" and other IndexNow actions

The existing `withIndexNowGuard` function (~line 1247) already does a live pre-check before executing the action. Make sure this guard is applied to **every** button/action that uses IndexNow, including:

- "Submit All Not Indexed (Bing)"
- Per-URL "Submit to Bing" actions
- "Enable Auto-index via Bing" toggle
- Any bulk submit that uses IndexNow

If `withIndexNowGuard` is not applied to any of these, add it. The guard should open the IndexNowVerifyModal (with file download instructions) when verification fails, instead of showing a toast.
