# ux-visual — /dashboard/pharmacy and /dashboard/inventory findings

Phase 2 inspection (report-only; `--no-implement --no-second-opinion`). Surfaces: pharmacy `section=desk|counter|billing`, inventory `area=today|stock|reorder`. Viewports 1440x900, 768x1024, 375x812; admin@ plus one pharmacist@ set. Measurements in `pages/pharmacy/audit.json` and `pages/inventory/audit.json` (keys `{viewport}-{state}`; `layout.lowContrast` gives false positives on this app's oklch colours). Screenshots were kept out of the repo (session scratchpad).

Counts — Pharmacy: 30 (P0 3 · P1 11 · P2 12 · P3 4). Inventory: 22 (P0 0 · P1 8 · P2 12 · P3 2).

## Worst five
1. **PH-01 P0** — invoice-builder drug search can't find stocked items: "Acyclovir" (30 strips on hand) → "No matching drugs found in the drug master", because the drug master (`/api/drugs`) is empty while inventory holds 79 batches. *Caveat: our local seed populates inventory but not the drug master; the repo ships `backend` script `backfill:drug-master` for this gap, so any install without that backfill hits it. The UI offers no fallback and "drug master" is jargon.*
2. **PH-02 P0** — Desk "Manual Daily Entry" card squeezed into a ~165px column at 1440: labels overprint, "Add Item"/"Submit" render one letter per line.
3. **PH-03 P0** — pharmacist role: 403s are swallowed; Desk shows ₹0 / 0 stock as if real, no permission message (root cause is the RBAC wildcard bug in `docs/ux-paths/defects.md`).
4. **PH-08 / INV-10 P1** — the document scrolls as well as `main` (476px on Billing at 1440, 1380px on Reorder at 375), so the shell slides away into a white void. Cause: an absolutely positioned `.sr-only` span escapes the overflow container.
5. **INV-02 P1** — Stock row "Edit price"/"Edit stock" buttons wrap to 3 lines; rows 190px (445px at 375); 32 rows scroll 6,035px.

## Pharmacy
| id | sev | finding |
|---|---|---|
| PH-01 | P0 | Drug search empty while stock exists (worst #1) |
| PH-02 | P0 | Manual Daily Entry crushed (worst #2) |
| PH-03 | P0 | Pharmacist 403s shown as zeros (worst #3) |
| PH-04 | P1 | Desk H1 text colour equals background (~1:1) — invisible title |
| PH-05 | P1 | Desk "Stock · 0 low" disagrees with Inventory Today "4 Low stock" (drug master vs batches) |
| PH-06 | P1 | Invoice builder starts at y≈736–1130 below a duplicate of the Counter queue |
| PH-07 | P1 | No "Create invoice" verb; only action (Print Preview) disabled without reason; bad phone/blank name accepted silently |
| PH-08 | P1 | Document + main double scroll (worst #4) |
| PH-09 | P1 | Create Package footer buttons wrap into fragments; Create stays disabled after a name is entered; footer off-screen at 375 |
| PH-10 | P1 | Rx queue badges/buttons wrap ("Pen/ding", "Bi/ll"); uneven row heights |
| PH-11 | P1 | Active Dispense stepper reads vertically; line table spills 390px |
| PH-12 | P1 | "No inventory match" next to "IN STOCK Qty 30" |
| PH-13 | P1 | Counter at 375 overflows right edge by 82px |
| PH-15 | P1 | Daily Entry validation only as a toast covering the header |
| PH-14 | P2 | Segmented control labels break mid-word at 375 |
| PH-16 | P2 | Section name stated 2–3 times; Counter repeats the full Rx queue below |
| PH-17 | P2 | Desk has four unrelated purposes, no focal point |
| PH-18 | P2 | KPI tiles truncate to "₹…", text collides with icons |
| PH-19 | P2 | Empty package catalogue offers "Retry Loading" |
| PH-20 | P2 | Quick Guide references a "Billing & GST tab" and "Inventory > Pharmacy Control" that don't exist |
| PH-21 | P2 | AI dock says "unavailable" but composer is enabled; pushes page down 492px |
| PH-24 | P2 | Cards nested three deep; ~185px inputs at 375 |
| PH-25 | P2 | At 768 the sidebar persists and search shows "Sea" |
| PH-28 | P2 | "TABLET ONCE_DAILY" under a gel — raw enums and wrong dosage form |
| PH-29 | P2 | Progress checklist styled as buttons |
| PH-30 | P2 | Queue tiles duplicate header counters |
| PH-22 | P3 | Non-standard per-card A-/100%/A+ zoom |
| PH-23 | P3 | Green highlight on "-₹0.00" discount |
| PH-26 | P3 | Inconsistent label-to-input gaps (0–2px vs 8px) |
| PH-27 | P3 | "Validate before adding stock" pill becomes a 4-line blob at 768 |

Excellent as is: picking a patient auto-fills billing name/phone; Desk navigation cards; 768 Counter queue cards; Escape closes every dialog with labelled close buttons; Rx status filter is a proper listbox with an actionable empty state.

## Inventory
| id | sev | finding |
|---|---|---|
| INV-02 | P1 | Stock rows 190px from wrapped Edit buttons (worst #5) |
| INV-03 | P1 | Filters + valuation table fill the first screen; results start below y≈830 |
| INV-05 | P1 | Stock table at 375 doesn't reflow — 15,092px tall, sideways scroll |
| INV-06 | P1 | "Add batch" opens an item-master form with no batch/expiry fields; native "Please fill out this field" validation |
| INV-07 | P1 | Manual reorder request shows system copy, a UUID, raw JSON `<pre>` and an ID-filled "Recovery handoff" textarea |
| INV-08 | P1 | Failed "Create purchase order" still saves a server draft (left two empty SHORTBOOK drafts locally) |
| INV-09 | P1 | Pharmacist sees "This action requires inventory:item:read (Reference: uuid) Retry" — Retry can't fix a 403 |
| INV-10 | P1 | Document double-scroll on Reorder (same cause as PH-08) |
| INV-04 | P2 | All 79/79 rows amber "expiry unverified · Batch missing" — highlight on everything |
| INV-11 | P2 | Today list: zero counts as bold as non-zero; not sorted by urgency |
| INV-12 | P2 | Today repeats counts and actions |
| INV-13 | P2 | "Recent activity" heading with nothing beneath |
| INV-14 | P2 | Fixed-width tabs; "Reorder" wraps alone at 768 |
| INV-15 | P2 | 70px buttons beside a 40px input; "Filters" toggle beside visible filters |
| INV-16 | P2 | Native and Radix selects mixed, sometimes in one dialog |
| INV-17 | P2 | Filter chips show raw keys ("stock: LOW") |
| INV-18 | P2 | Reorder filter grid misaligned; icon-only orphan export |
| INV-19 | P2 | 8 font sizes incl. off-scale 17px |
| INV-20 | P2 | 13×13px row checkboxes |
| INV-23 | P2 | Accounting valuation precedes the operational list regardless of "Show cost" |
| INV-21 | P3 | Raw "NORMAL" priority enum |
| INV-22 | P3 | Orphaned refresh icon and inconsistent task select at 375 |

Excellent as is: Edit price dialog (shows current price, explains approval, asks why with an example); Today rows deep-link with URL-persisted filters; logical tab order with visible focus; pinned table header; empty states that say what to do.
