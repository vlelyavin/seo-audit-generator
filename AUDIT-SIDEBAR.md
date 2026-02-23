# Sidebar Animation Audit

## Desktop Behavior
- **Sidebar element**: `fixed inset-y-0 left-0 top-14 z-50 w-56`
- **Animation**: `transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]`
- **Open**: `translate-x-0` (sidebar visible)
- **Closed**: `-translate-x-full` (sidebar off-screen left)
- **Content shift**: `padding-left` transitions from `0` to `14rem` (content reflows/shrinks)
- **No overlay/backdrop** on desktop
- **Header**: full-width, stays in place

## Mobile Behavior (Before Fix)
- **Sidebar element**: same animation as desktop (identical classes, identical transition)
- **Content shift**: `translateX(0)` to `translateX(14rem)` — content slides right **as a rigid block** (no reflow)
- **Overlay**: dark backdrop (`bg-black/35`) fades in with same duration/easing
- **Header**: stays in place (does NOT translate with content)
- **Clipping**: parent `overflow-hidden` clips content that slides past right viewport edge

## Differences Found
1. **Content mechanism**: Desktop uses `padding-left` (content reflows/shrinks gracefully). Mobile uses `translateX` (content slides as a block, right edge gets clipped).
2. **Visual feel**: Desktop feels like sidebar "pushes" content. Mobile feels like the whole page slides right.
3. **Content loss**: On mobile, content on the right side is clipped off-screen by `overflow-hidden` when sidebar opens.
4. **Overlay**: Mobile has a dark backdrop overlay; desktop does not (expected responsive difference).
5. **Header disconnect**: On mobile, header stays put while content translates — creating a visual disconnect between header and content.

## Changes Made

### `frontend/src/app/[locale]/(dashboard)/layout.tsx`
- **Removed** `SIDEBAR_WIDTH_MOBILE_CLASS` constant (`translate-x-56`) — no longer needed
- **Removed** mobile content `translateX` — content no longer slides right on mobile
- **Simplified** content div transition from `transition-[padding-left,transform]` to `transition-[padding-left]`
- **Simplified** content div classes: only `lg:pl-56` / `lg:pl-0` for desktop padding behavior

### Result
- **Mobile**: Sidebar slides in from left **over** the content (overlay pattern). Content stays in place. Dark backdrop provides tap-to-close. This matches the sidebar's slide animation exactly as on desktop.
- **Desktop**: Unchanged. Sidebar slides in, content shrinks via `padding-left`.
- **Sidebar animation itself**: Identical on both (same element, same transition, same duration, same easing).
