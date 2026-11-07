# UX Visual Report — 2026-11-07

**No implementation.** Run as `--no-implement --no-second-opinion`, stopped after Phase 5 (decisions). Phases 3–5 were compressed into one agent: the three proposal strategies and three judging lenses were written and scored in a single pass, with no external reviewers or judges. Treat the scores as a structured argument, not independent votes. No code changed, so there are no after-screenshots, test results or commits.

## Summary
| Metric | Value |
|--------|-------|
| Surfaces audited | 6 pages (dashboard, patients + detail, appointments, visits, pharmacy desk/counter/billing, inventory today/stock/reorder) × ~4–30 states × 3 viewports (1440×900, 768×1024, 375×812); roles reception, doctor, manager, admin, pharmacist |
| Coverage gaps | 13 routes not audited (billing, inventory-updates, pharmacy/drugs, pharmacy/invoices, prescriptions, procedures, reports, rooms, stock-predictions, users, login, reset-password, test-transcribe); no 1920×1080; no dark/branded/high-contrast modes; no nurse/accountant/owner roles; no multi-user states; Phase 1 inventory skipped |
| Findings | P0 11 · P1 49 · P2 71 · P3 17 (148 total; 10 cross-page duplicates merged; 8 handed off as functional) |
| Clusters | 15 found · 6 carried to decisions · 0 implemented · 9 deferred |

Full register: [`problems.md`](problems.md). Decisions: [`decisions/`](decisions/). Per-page findings: [`pages/`](pages/).

## Decided, not implemented

### VX-01 — Design-system controls break labels mid-word (P0, reach 6/6)
- **Problem:** `button.tsx:8`, `badge.tsx:8`, `select.tsx:45`, `tabs.tsx:122`, `page-header.tsx:17` use `min-w-0 whitespace-normal [overflow-wrap:anywhere]`; inside tables and flex rows controls shrink to about one glyph. Patient rows are 783px, Stock rows 190px; "Vi/e/w", "FEM/ALE", "Avai/labl/e".
- **Decision:** one-line controls by default (`whitespace-nowrap shrink-0`); explicit `wrap` prop using `overflow-wrap:break-word`; select values truncate; tab rows scroll horizontally. Rewrites the `@cc wrapping-*` contracts — **needs owner approval**.
- **Acceptance:** no word split across lines in any control; patient rows ≤120px (≤56 after VX-08); Stock rows ≤64px; no new horizontal overflow.

### VX-02 — Dialog primitive not contained by the viewport (P0, reach 5)
- **Problem:** `dialog.tsx:63` has no `max-h`, and its `sm:max-w-lg` overrides unprefixed consumer widths via `twMerge`. Create Patient is 985px tall in a 900px window and can't be completed on a phone; booking dialog is 512px instead of 896px with Confirm below the fold.
- **Decision:** fixed header, scrolling `DialogBody`, pinned footer; `size` token prop replaces ad-hoc widths; `lg`+ dialogs full-screen below 640px; 36px (44px touch) close target.
- **Acceptance:** every dialog inside the viewport at all 3 viewports; primary action visible without scrolling; requested widths honoured.

### VX-03 — Nested layouts follow viewport breakpoints, not their own width (P0, reach 5)
- **Problem:** Desk's Manual Daily Entry crushed to ~165px by window-keyed `xl:`/`md:` rules (`pharmacy/page.tsx:385`, `PartnerDailySync.tsx:370,378`); visit form 1408px in a 1184px `main`, footer clipped; Stock 15,092px tall at 375.
- **Decision:** container queries as the design-system rule (`@container` on Card and the Table wrapper, `@`-variants, `priority="secondary"` columns), a `min-w-0` chain for the visit form, and a source guard against new viewport-keyed grids.
- **Acceptance:** `main.scrollWidth ≤ clientWidth` everywhere audited; Desk inputs ≥120px; visit footer in view; Stock at 375 ≤4,000px.

### VX-04 — Load and permission failures shown as empty, zero or "operational" (P0, reach 4)
- **Problem:** dashboard always says "All systems operational" (`dashboard/page.tsx:120-145`) and renders failures as "No appointments scheduled"; pharmacist 403s appear as ₹0 / 0 stock (`pharmacy/page.tsx:131-137`); inventory 403s offer a useless Retry.
- **Decision:** new `DataState` primitive (`components/ui/data-state.tsx`) with distinct error (Retry), forbidden (no Retry; who can grant access) and empty (next action) outcomes from `ApiError.status`; unknown metrics render "—"; delete the permanent "operational" alert.
- **Acceptance:** with 500/403 fixtures, no fake zeros or "operational" text; a role=alert or permission state in every affected section.

### VX-05 — Day grid hides appointments outside working hours (P0, core journey)
- **Problem:** `DoctorDayCalendar.tsx:405-411` drops bookings outside the working-hours window (default 09–18 when none configured), so Dr Shravya's 18:30–19:45 bookings are invisible in Calendar and Slots.
- **Decision:** pure `computeGridWindow()` grows the grid to include every booking; hatched, labelled off-hours rows; "N outside working hours" chip; empty-day note; hour-label contrast fix. Booking rules unchanged.
- **Acceptance:** all fixture bookings render in both tabs at 1440 and 375; property test.

### VX-06 — App shell: document scroll leak and tablet breakpoint (P1, reach 6/6)
- **Problem:** `main` isn't positioned, so absolute `.sr-only` descendants (`tabs.tsx:179`, `WorkflowDocumentEditor.tsx:1084`) extend the document, which scrolls 476–1380px on top of main's own scroll. At 768 the persistent `w-64` sidebar leaves 504px; search shrinks to 56px; "Start Tour" wraps. Below 768, search, bell and settings vanish.
- **Decision:** shell root `h-dvh overflow-hidden`, `main` `relative`; persistent sidebar only ≥1024 (Sheet overlay below); one responsive header (search icon below `md`, Branded + tour in a "More" menu below `xl`, bell and settings always visible); skip link; labelled bell.
- **Acceptance:** document `scrollTop` stays 0 on every route and viewport; `main` ≥720px at 768; single-row header.

**Suggested order:** VX-06 containment → VX-01 → VX-03 → VX-02 → VX-04 → VX-05.

## Deferred
| Cluster | Sev | Why deferred |
|---|---|---|
| VX-07 Work object buried under chrome; facts stated 2–3× (23 findings) | P1 | L effort; after VX-03/VX-06 |
| VX-11 Raw enums, DB ids, jargon (`status-badge.tsx:6` falls back to raw status) | P1 | Next in line, M effort |
| VX-08 No action hierarchy (6 equal row buttons, loud destructive actions) | P1 | Completes VX-01 row-height target |
| VX-09 Validation far from the field | P1 | — |
| VX-10 Keyboard/touch reachability (untabbable slots, hover-only actions) | P1 | — |
| VX-12 Type/spacing/colour token drift (incl. Desk H1 ~1:1) | P1 | Dense-type ask conflicts with `@cc app-screen-text-increase`; owner decision |
| VX-15 Empty states without an action | P2 | — |
| VX-13 Layout shift on load/search | P2 | — |
| VX-14 Native vs Radix controls; mm/dd dates | P2 | — |

No GitHub issues filed (report-only run).

Handed off as functional: APT-02, VIS-01/VIS-04, VIS-08 (re-measure on a production build), PH-05, plus three new functional defects: VIS-02 (printed prescription has no prescriber name, `PrescriptionBuilder.tsx:2397`), PH-12 ("No inventory match" beside an in-stock item), INV-08 (a failed "Create PO" still saves a draft).

## Unverified
- VIS-03's exact overflow ancestor chain; D13 (9px shift) sharing VX-06's cause; PH-04 (invisible Desk H1) coming from `.branded` overrides in `globals.css:285-289`.
- Scores come from one agent applying three lenses.

## Excellent as is
Visible focus rings; Escape closes dialogs and returns focus where the opener is a real button; booking dialog summary and per-slot room availability; medicine search with stock and Best Match; 1-0-1 / 7d presets; clean printed prescription; dermatology examination chips; Billing auto-fills from patient; Desk navigation cards; Rx status listbox; Inventory Edit price dialog; URL-persisted Today filters; pinned table header; helpful empty states.
