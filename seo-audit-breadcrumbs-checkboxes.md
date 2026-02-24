# SEO Audit — Breadcrumbs + Checkbox Hover Fixes

## 1. Indexing page breadcrumbs — reduce bottom spacing

The breadcrumbs on the indexing page have larger bottom spacing than on other pages. Change the bottom margin to `mb-4` to match the rest of the app. Check if this is set inline on the indexing page or via a shared breadcrumb component — fix at the source so it's consistent everywhere.

## 2. Audit page breadcrumbs — clean URL display

Currently the audit page breadcrumbs show the full URL with protocol and slashes (e.g., `https://kxd-studio.com/`). Strip it down to just the domain.

**Required format:**
```
Dashboard / Website audit: kxd-studio.com
```

- Remove `https://`, `http://`, `www.`, and trailing slashes from the displayed URL
- Just show the bare domain: `kxd-studio.com`
- Update the breadcrumb logic that generates this text — find where the audit URL is inserted into the breadcrumb and strip the protocol/slashes there
- Update any translation strings if the breadcrumb format is defined in translation files

## 3. Audit start page — fix checkbox hover effect

Currently, hovering over a checkbox row on the audit start page highlights the entire row (background change + extra padding around the row). This looks heavy and inconsistent with the rest of the app.

**Fix:**
- Remove the row-level hover effect entirely (no background color change on the full row)
- Remove any extra padding on the checkbox rows that exists just to support the hover area
- The hover effect should be on **the checkbox itself only** — just a subtle border color change, matching exactly how checkboxes behave on the indexing page in the URLs tab
- Reference the URLs tab checkbox styling and replicate it here

Commit when done.
