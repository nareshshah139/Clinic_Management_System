# ux-visual — Problem register (Phase 3)

Run: 2026-11-07 · mode `--no-implement --no-second-opinion` · Phases 3–5 compressed into a single agent.
Inputs: `pages/dashboard-and-patients-findings.md`, `pages/appointments-and-visits-findings.md`, `pages/pharmacy-and-inventory-findings.md`, `pages/*/audit.json`. Functional defects from `docs/ux-paths/defects.md` are cross-referenced but not re-litigated here.

## 1. Totals and dedupe

| | Count |
|---|---|
| Page findings in (6 pages, 3 viewports) | **148**: P0 11 · P1 49 · P2 71 · P3 17 |
| By level (dashboard, patients, appointments, visits only; the pharmacy and inventory findings have no level) | component 48 · group 15 · page 26 · layout 7 |
| Cross-page duplicates merged | 10 (wrap rule ×3 → 1; double scroll ×2 → 1; 16px dialog close ×2 → 1; 768 header/sidebar ×3 → 1; focus not returned ×2 → 1; raw patient DB id ×2 → 1; mm/dd date inputs ×3 → 1) |
| Purely functional findings handed off (§5) | 8 |
| Visual/interaction findings clustered | 140 finding-slots (VIS-07 split across two clusters) in **15 clusters** |

All Phase 2 findings were "own" (no external reviewers this run). If a problem shows up on more than one page, it counts as agreement and raises that cluster's reach.

## 2. Ranking method

`score = severity × reach × centrality ÷ effort`, with P0 clusters first regardless of score (SKILL Phase 3).
- severity: highest finding in the cluster (P0=4, P1=3, P2=2, P3=1)
- reach: audited pages affected (of 6: dashboard, patients, appointments, visits, pharmacy, inventory)
- centrality: 3 = app shell or a core daily journey (register patient, book, consult, bill); 2 = core page but secondary task; 1 = polish/secondary
- effort: S=1 (≤5 files, primitives only), M=2 (primitive + call-site sweep), L=3 (page re-composition)

## 3. Clusters (ranked)

| Rank | ID | Cluster | Sev | Reach | Cent | Effort | Score | Findings | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **VX-01** | Design-system controls break labels mid-word | P0 | 6 | 3 | S | 72 | 13 | **carried forward** |
| 2 | **VX-02** | Dialog primitive isn't contained by the viewport | P0 | 5 | 3 | M | 30 | 8 | **carried forward** |
| 3 | **VX-03** | Nested layouts follow viewport breakpoints, not their own width | P0 | 5 | 3 | M | 30 | 9 | **carried forward** |
| 4 | **VX-04** | Load and permission failures shown as empty, zero or "operational" | P0 | 4 | 2 | M | 16 | 7 | **carried forward** |
| 5 | **VX-05** | Day grid silently hides appointments outside working hours | P0 | 1 | 3 | S | 12 | 4 | **carried forward** |
| 6 | **VX-06** | App shell: document scroll leak and tablet breakpoint | P1 | 6 | 3 | M | 27 | 8 | **carried forward** |
| 7 | VX-07 | Work object buried under chrome; facts stated 2–3× | P1 | 6 | 3 | L | 18 | 23 | deferred |
| 8 | VX-11 | Raw enums, DB ids and system jargon in the UI | P1 | 6 | 2 | M | 18 | 11 | deferred |
| 9 | VX-08 | No action hierarchy: row/toolbar actions flat and loud | P1 | 5 | 2 | M | 15 | 15 | deferred |
| 10 | VX-09 | Validation far from the field; no field-level states | P1 | 5 | 2 | M | 15 | 12 | deferred |
| 11 | VX-10 | Keyboard and touch reachability gaps | P1 | 5 | 2 | M | 15 | 9 | deferred |
| 12 | VX-12 | Type, spacing and colour token drift | P1 | 5 | 1 | M | 7.5 | 12 | deferred |
| 13 | VX-15 | Empty states without a next action | P2 | 4 | 1 | S | 8 | 4 | deferred |
| 14 | VX-13 | Layout shift on load and on search | P2 | 2 | 1 | S | 4 | 2 | deferred |
| 15 | VX-14 | Native vs Radix controls; US date format | P2 | 4 | 1 | M | 4 | 4 | deferred |

VX-02 and VX-03 tie on score. VX-02 ranks first because VX-03's fix depends on VX-01, which will expose squeezed layouts as overflow instead of letter stacks.

**Recommended implementation order:** VX-06 (shell containment) → VX-01 → VX-03 → VX-02 → VX-04 → VX-05. VX-01 and VX-06 interact: "Start Tour" at 768 needs both fixes. VX-01 and VX-03 also interact: nowrap controls will show squeezed columns as overflow, and VX-03 then removes that overflow.

---

## 4. Cluster detail

### VX-01 — Design-system controls break labels mid-word · P0 · reach 6 · carried forward

**Root cause (verified in source).** Shared primitives carry `min-w-0 … whitespace-normal [overflow-wrap:anywhere]`:
- `frontend/src/components/ui/button.tsx:8` (base of `buttonVariants`)
- `frontend/src/components/ui/badge.tsx:8`
- `frontend/src/components/ui/select.tsx:45` (`SelectTrigger`)
- `frontend/src/components/ui/tabs.tsx:122` (`TabsTrigger`, plus `flex-wrap` on `TabsList` at :101)
- `frontend/src/components/ui/page-header.tsx:17`

Commit `c8bbe35` (2026-11-05, #33, "Let shared controls wrap long labels") added these rules, together with the `@cc` contracts `wrapping-button-label` (button.tsx:40-43), `wrapping-badge-label` (badge.tsx:36-37) and `wrapping-select-value` (select.tsx:28-30).

`overflow-wrap:anywhere` differs from `break-word` in one important way: it adds break opportunities **when the browser computes min-content width**. That shrinks each control's minimum width to about one glyph, and `min-w-0` removes the flex minimum too. Table auto-layout and flex rows then shrink the control to that width. Measured examples:
- the patients Actions column is 96px, and its 64px-wide buttons are 71–162px tall (`pages/patients/audit.json → notes.table-1440.actionButtons`)
- every patient row is 783px tall at all three viewports (`notes.table-1440.rowHeights`)

**Findings:** P01, P02, D10, APT-05, VIS-05, VIS-06, VIS-16, PH-10, PH-11 (stepper), PH-14, PH-27, INV-02, INV-14. The same rule contributes to D09, APT-16, PH-02, PH-09 and P21.

**Surfaces:** every page. The worst are the patients table, inventory Stock rows (190px; 445px at 375), the Rx queue, the visit medicine table, the 768 header, and tabs and segmented controls.

**Acceptance criteria**
1. No text inside `[data-slot=button|badge|tabs-trigger|select-trigger]` breaks inside a word, on any audited page × state × viewport. Measured: each word's `Range.getClientRects().length === 1`.
2. At 1440 and 768, controls without an opt-in `wrap` render on one line: height ≤ the `min-h` of their size + 2px.
3. Patients Actions buttons are each one line. Row height is ≤ 120px at 1440 now, and ≤ 56px once VX-08 lands. Inventory Stock rows are ≤ 64px at 1440 (from 190).
4. No new document- or main-level horizontal overflow. Wide content scrolls only inside designated `overflow-x-auto` regions (tables, `TabsList`).
5. The `@cc wrapping-*` contracts are amended and the owner signs off.

### VX-02 — Dialog primitive isn't contained by the viewport · P0 · reach 5 · carried forward

**Root cause (verified).** `frontend/src/components/ui/dialog.tsx:63`: `DialogContent` is `fixed top-[50%] … grid w-full max-w-[calc(100%-2rem)] … sm:max-w-lg`. This causes four problems:
- **No max height or overflow.** 25 of 40 `DialogContent` call sites set no `max-h`. The 13 that do scroll the whole dialog, header and footer included, so the primary action scrolls away.
- **Width overrides are lost.** `cn()` is `twMerge` (`frontend/src/lib/utils.ts:5-7`). A consumer's unprefixed `max-w-4xl` replaces `max-w-[calc(100%-2rem)]` but leaves `sm:max-w-lg` in place, so at ≥640px the dialog is capped at 512px, and below 640px it loses its 1rem side margin. 12 call sites are affected, including `AppointmentBookingDialog.tsx:253`, `PharmacyPackageManager.tsx:566,871`, `PackageBrowser.tsx:267`, `DrugManagement.tsx:570`, `QuickGuide.tsx:61`, `MedicalVisitForm.tsx:1920`, `PrescriptionBuilder.tsx:4536`, `app/dashboard/{appointments:104, pharmacy:652, visits:435}`, and `PrescriptionInventoryLink.tsx:108`. Consumers asking for `max-w-sm`/`max-w-md` get widened to 512px.
- **Small close button.** It is a bare 16×16 icon (`dialog.tsx:70-76`).
- **Footer not pinned.** `DialogFooter` (`dialog.tsx:93-103`) is ordinary flow content.

**Findings:** P03, APT-03, APT-04, APT-20 (the reason Confirm is disabled sits below the fold), APT-21, VIS-23, PH-09 (footer off-screen at 375), VIS-07a (Print below the fold).

**Evidence:** Create Patient top −42, height 985 at 1440×900, `overflowY: visible`, `maxHeight: none` (`pages/patients/audit.json → notes.dialog-geom-1440`); height 1301 at 375; `reception-375-createReachable: false`. The booking dialog is 512px wide and Confirm is below the fold at every viewport (`pages/appointments/audit.json → extra.dialog`).

**Acceptance criteria**
1. Every dialog fits the viewport at 1440×900, 768×1024 and 375×812: `rect.top ≥ 0` and `rect.bottom ≤ innerHeight`.
2. In form dialogs, the primary footer button is inside the viewport without scrolling the dialog: Create/Edit Patient, Book Appointment, Create Package, Add Item.
3. A requested width renders at ≥1024 (booking dialog 896px ±1, from 512).
4. At 375, large dialogs fill the screen and small confirm dialogs keep ≥16px side margins.
5. The close target is ≥36×36 (≥44×44 on a coarse pointer).
6. No `DialogContent` className contains `max-w-*` or `max-h-*` (enforced by a source test).

### VX-03 — Nested layouts follow viewport breakpoints, not their own width · P0 · reach 5 · carried forward

**Root cause (verified for PH-02; suspected chain for VIS-03).** Components nested inside fractional columns use viewport variants (`md:`, `xl:`), which fire on the window width rather than the component's own box:
- `app/dashboard/pharmacy/page.tsx:385` puts `PartnerDailySync` in half of `main` (`xl:grid-cols-2`, about 580px at 1440).
- Inside it, `components/pharmacy/PartnerDailySync.tsx:370` reserves `minmax(360px,0.75fr)` for the summary at `xl:`, leaving about 165px for "Manual Daily Entry".
- `PartnerDailySync.tsx:378` then fits `md:grid-cols-4` inputs into those 165px, so labels overprint and buttons stack one letter per line (made worse by VX-01).
- **VIS-03:** the medicine table is `min-w-[1080px]` inside its own `overflow-x-auto` (`components/visits/PrescriptionBuilder.tsx:5071-5073`), yet `main` overflows (scrollWidth 1408 vs 1184 at 1440; 1400 vs 375 on mobile). This points to a flex or grid ancestor without `min-w-0` that passes the table's min-content width up. *Suspected: walk ancestors for the first one where `scrollWidth > clientWidth`.*

The design system already uses container queries in one place (`card.tsx:22`, `@container/card-header`), but not for content.

**Findings:** PH-02, VIS-03, VIS-21, PH-13 (Counter +82px at 375), PH-24, PH-18 (KPI "₹…" collides with icons), INV-05 (Stock table 15,092px tall plus sideways scroll at 375), P15 (table 1124 in 1084), D21.

**Acceptance criteria**
1. `main.scrollWidth ≤ main.clientWidth` on visits (overview, rx), pharmacy (desk, counter, billing), inventory (stock) and patients at all three viewports.
2. On Desk, inputs are ≥120px wide, labels don't overlap their inputs (geometry overlaps = 0), and Add Item/Submit are one line.
3. Visit footer actions (Create Prescription, Complete Visit) are fully inside the viewport at 1440 and 375.
4. Wide tables scroll only inside their wrapper. At 375 the inventory Stock page is ≤ 4,000px tall for 32 rows.
5. A source test finds no viewport `sm:/md:/lg:/xl:grid-cols-*` in `components/{pharmacy,inventory,visits,patients}`, apart from an allowlist.

### VX-04 — Load and permission failures shown as empty, zero or "operational" · P0 · reach 4 · carried forward

**Root cause (verified).** The design system has no error or permission state: only `EmptyState` (`components/ui/empty-state.tsx:6`) exists. Load functions catch failures and render fallbacks:
- `app/dashboard/page.tsx:120-128` always appends a "System Status · All systems operational" item, severity LOW.
- `page.tsx:133-145`: when the alerts request fails, the same "operational" item is the fallback.
- `page.tsx:150-165`: failed appointment loads become `[]`, which renders "No appointments scheduled for today" (:407).
- `page.tsx:169-178` falls back to zero statistics.
- `app/dashboard/pharmacy/page.tsx:131-137`: any error becomes `setDash(null)`, so Desk renders ₹0 and 0 stock.
- Inventory shows a raw permission string and an "Access denied" message with a Retry button that can't help (INV-09).

Functional overlap: MIS-02, MIS-04, BRK-27, BRK-47 and SEC-08 (why the pharmacist gets 403) in `docs/ux-paths/defects.md`. This cluster owns only **what the failure looks like and what the user can do**.

**Findings:** D01, D04, PH-03, INV-09, P09, PH-19, PH-21 (the dock says "unavailable" but its composer is enabled).

**Acceptance criteria**
1. When a section's endpoint returns 500, that section shows a visible `role="alert"` naming what failed, plus a Retry, within 1s. "All systems operational", a "0" metric and "No appointments scheduled" do not appear for it.
2. On 403, the section shows a permission state naming the missing access, with no Retry and no ₹0 tiles.
3. On 200 with an empty list, the section shows `EmptyState` with a next action.
4. Metrics that are unknown render as "—", never 0.
5. The string "All systems operational" exists only behind a real health check.

### VX-05 — Day grid silently hides appointments outside working hours · P0 · reach 1 · carried forward

**Root cause (verified).** `components/appointments/DoctorDayCalendar.tsx:405-411` clamps each appointment to `[startHour, endHour]` and `return null`s any appointment that falls entirely outside. The window comes from the doctor's working hours (`AppointmentsCalendar.tsx:120-131` via `gridHoursFor`) or the 09:00–18:00 default (`DoctorDayCalendar.tsx:67-72`). The backend accepts out-of-hours bookings, so Dr Shravya's three bookings from 18:30 to 19:45 are invisible in both Calendar and Slots (`pages/appointments/audit.json → extra.scheduleToday`). The same view also has no empty-day state (APT-15), labels spill at 375 (APT-17), and 12px hour labels have 2.20:1 contrast (APT-18).

**Findings:** APT-01, APT-15, APT-17, APT-18. Related functional items: MIN-03 (RoomCalendar is hard-coded to 9–18) and BRK-17 (APT-02).

**Acceptance criteria**
1. With working hours 09–18 and appointments at 10:00, 18:30–19:00 and 19:15–19:45, all three tiles render in Calendar and in Slots, at 1440 and 375.
2. Rows outside working hours are visibly distinct and labelled.
3. The header shows "2 outside working hours".
4. A property test shows every appointment's interval ⊂ the grid window.
5. An empty day shows guidance, and hour labels have ≥4.5:1 contrast.

### VX-06 — App shell: document scroll leak and tablet breakpoint · P1 · reach 6 · carried forward

**Root cause (verified).**
1. **Scroll leak.** The shell root `h-screen flex` (`components/layout/dashboard-layout.tsx:116`) doesn't clip, and `main` (`:159`) is `overflow-auto` but **not positioned**. An absolutely positioned descendant with no positioned ancestor therefore takes the initial containing block, sits at its static position below the fold, and extends the *document's* scroll range, which main's scroller neither clips nor scrolls. Two such descendants were found:
   - the `.sr-only` live region in `TabsFontSizeControls` (`components/ui/tabs.tsx:179`), on Billing
   - `caption.sr-only` (`components/inventory/WorkflowDocumentEditor.tsx:1084`), on Reorder

   Measured document scroll on top of main's own: 476px (Billing 1440), 642 (768), 864 (375), 1380 (Reorder 375) (`pages/pharmacy|inventory/audit.json → layout.viewport.pageScrollY`; the `_meta.note` confirms the document should stay at 0). *Suspected same cause:* D13, where opening notifications shifts the page by 9px.
2. **Breakpoint.** The sidebar is persistent from `md` (768) at a fixed `w-64` (`dashboard-layout.tsx:118`, `sidebar.tsx:220`), leaving `main` 504px at 768. The header is one rigid row (`header.tsx:493`): the search is `flex-1 max-w-md` (:496) and shrinks to 56px, and the right cluster (Start Tour, the "Branded" switch with its label, bell, settings; `header.tsx:597-620`) never collapses. Below 768 the mobile bar drops search, bell and settings (functional side: BRK-41). The nav sheet is `w-72` (`dashboard-layout.tsx:147`) but the sidebar inside is `w-64`, so the close X floats 32px outside the visible panel (D17).

**Findings:** PH-08, INV-10, D13, D09, APT-16, PH-25, D17, D18 (footer name wraps).

**Acceptance criteria**
1. On every dashboard route, state and viewport, the document never scrolls: `scrollingElement.scrollHeight === innerHeight`, and `scrollTop` stays 0 after `window.scrollTo(0,1e6)`.
2. At 768: no persistent sidebar, `main` ≥ 720px wide, and the header is one 64px row with every control on one line; search, bell and settings are reachable.
3. At 1024–1279: the sidebar is persistent and no header item wraps.
4. At 375: the header has menu, search, bell and settings, and the nav close control sits inside the sheet.
5. Opening notifications moves nothing (main's top y is unchanged).
6. A skip link is the first tab stop.

---

### Deferred clusters (summary)

**VX-07 — Work object buried under chrome; facts stated 2–3× (P1, 23 findings).** Pages stack full-width cards in this order: title, description, filters, metrics, work. The work object starts at y≈705 on Appointments (APT-06), 736–1130 on Billing (PH-06) and ≥830 on Stock (INV-03). The doctor's day sits below admin telemetry (D02, D03, D11), and visits open on "Role & Permissions" cards (VIS-09). The same facts are repeated: three titles (P10, MIN-06), section names (PH-16), counters (PH-30, INV-12) and visit progress shown three times (VIS-12). Also: D05, D08, D19, P17, P19, P22, APT-07, APT-08, VIS-11, PH-17, INV-23. *Decision needed:* a page template where the work area starts ≤200px from the top of main, a role-aware dashboard, and one header per page using `components/ui/page-header.tsx`. Effort L: page re-composition.

**VX-11 — Raw enums, DB ids and system jargon (P1, 11).** `StatusBadge` renders `children ?? status` (`components/ui/status-badge.tsx:6`), and `lib/status-variants.ts` maps status to colour but not to a label. The result is "IN_PROGRESS", "TABLET ONCE_DAILY", "stock: LOW", "NORMAL", raw `cmw6…` ids, a UUID plus a raw JSON `<pre>` (INV-07) and "drug master" (PH-01 copy). Also: D07, P18, P25, VIS-15, VIS-22, PH-20 (Quick Guide copy; see DEAD-01), INV-17, INV-21. *Decision needed:* a `statusLabel(domain, status)` map that `StatusBadge` uses by default, and an id policy (show the patient code, never the DB id).

**VX-08 — No action hierarchy (P1, 15).** Rows show six equal buttons with Archive next to Edit (P13; `PatientsManagement.tsx:1169-1182`). "Reset to default" is a loud red button beside Undo (VIS-13). The print preview has 9 buttons, two of them primary (VIS-07b). The header is crowded (VIS-10). Also: P11, P21, P24, P26, D06, PH-07, PH-22, PH-29, INV-15, INV-18, INV-22. *Decision needed:* a row-actions pattern of one primary action plus a `DropdownMenu` overflow, and destructive actions only in menus. This also finishes VX-01 acceptance criterion 3.

**VX-09 — Validation far from the field (P1, 12).** Errors appear only as a form-level banner out of view (P04), a toast (APT-09, PH-15) or native "Please fill out this field" (INV-06). Buttons are disabled with no reason given (VIS-18), labels sit flush on inputs (P06, PH-26), Gender defaults to "Other" (P05), and phone fields have no `type=tel` (P07). Also: P08, APT-10, VIS-19. `components/ui/form.tsx` exists, but the audited forms don't use it.

**VX-10 — Keyboard and touch reachability (P1, 9).** Empty slots can't be reached with Tab (APT-11). Actions are hover-only at 27px (APT-12). Focus goes back to `body` after a dialog closes (APT-22, VIS-20, D15), because the opener isn't focusable, so Radix has no element to return focus to. The bell's accessible name is "3" (D14), there's no skip link (D16, addressed in VX-06), checkboxes are 13px (INV-20), and targets are 19px (P14).

**VX-12 — Token drift (P1, 12).**
- Type: 7–8 font sizes per screen, including an off-scale 17px (APT-23, INV-19, D22).
- Spacing: 3/6/10px gaps (APT-25).
- Colour: the Desk H1 is about 1:1 against its background (PH-04, *suspected* `.branded` overrides in `globals.css:285-289`), amber on all 79 rows (INV-04), zero counts as bold as non-zero ones (INV-11), and a green "-₹0.00" (PH-23).
- Also: P20, APT-13, APT-14, APT-19.

Constraint: the `@cc app-screen-text-increase` contract (`frontend/src/app/CONTRACTS`) requires +0.125rem screen text, so D22's request for 13–14px dense type has to be argued with the owner rather than simply applied.

**VX-15 — Empty states without a next action (P2, 4).** D20, P16, VIS-14 (an empty suggestions panel is the heaviest element on screen), INV-13.

**VX-13 — Layout shift (P2, 2).** The loading skeleton doesn't match the final layout (D12), and "Did you mean" chips push the table down (P12).

**VX-14 — Control-type and locale consistency (P2, 4).** Native and Radix selects are mixed (INV-16, P23), and dates use mm/dd/yyyy in an Indian clinic (VIS-17, APT-24).

## 5. Handed off as functional (not clustered)

| Finding | Why functional | Defect ref |
|---|---|---|
| APT-02 Slots tab swaps to the first doctor | state bug | BRK-17 |
| VIS-01 Doctor picker `limit:1` | data loading | DAT-01 |
| VIS-04 "Patient: Unknown • Doctor: Dr." | same `limit:1` lookup | DAT-01 |
| VIS-02 Printed Rx shows "Doctor cmw6d9" and a nameless "Dr." signature (`PrescriptionBuilder.tsx:2397`) | data binding | **new — add to defects.md** |
| VIS-08 642ms per keystroke (dev build) | performance; re-measure on a production build | — |
| PH-05 Desk "0 low" vs Inventory "4 Low stock" | two data sources | MIS-12 family |
| PH-12 "No inventory match" beside IN STOCK | matching logic | — (new) |
| INV-08 Failed "Create PO" still saves a draft | data integrity | — (new) |

Split findings: PH-01, PH-03, PH-09, D01, D04 and D18 have a functional root in defects.md, and only their visual or interaction part is clustered above.

## 6. Coverage check

There is no `inventory.md` (Phase 1 was skipped), so coverage is checked against the routes in `frontend/src/app`.

**Not audited:** `/dashboard/billing`, `/dashboard/inventory-updates`, `/dashboard/pharmacy/drugs`, `/dashboard/pharmacy/invoices`, `/dashboard/prescriptions`, `/dashboard/procedures`, `/dashboard/reports`, `/dashboard/rooms`, `/dashboard/stock-predictions`, `/dashboard/users`, `/login`, `/reset-password`, `/test-transcribe`.

**States and viewports not covered:**
- the 1920×1080 viewport (a SKILL default)
- dark, branded and high-contrast modes, apart from incidental branded views
- the NURSE, ACCOUNTANT and OWNER roles
- multi-user states

Every carried-forward cluster fixes a shared primitive or the shell, so its fix will also reach most of the unaudited routes. Phase 7 verification should include at least `/dashboard/rooms`, `/dashboard/users` and `/dashboard/pharmacy/invoices`.
