# Walk report: STORY-608, evening reconciliation in Pharmacy Invoices (filter unpaid UPI bills, collect, try to delete a mistake)

- **Topic**: pharmacy-counter-billing
- **Result**: **FAIL**
  - The PHARMACIST persona sees an empty list.
  - As ADMIN, filtering and collecting work, but Delete always fails, as the story predicts.
- **Walked**: 2026-11-07 with Playwright Chromium at 1280x800, plus a mobile check at 390x844
- **Personas**: pharmacist@clinic.test, then admin@clinic.test
- **Data**: 2 invoices today. PHI-2026-001 (Kavya, UPI, already paid in STORY-603) and PHI-2026-004 (Vikram, UPI, Pending). The story's 14-invoice day could not be built because of D-1 and the stock limits, so I used the steps on these two.
- **Screenshots**: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/pharmacy-counter-billing--STORY-608/`
- **Script**: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/scripts/pharmacy/s608.js`

## Pass 1: PHARMACIST

| Step | Screenshot | What the screen shows | Geometry / network |
|---|---|---|---|
| 1 Desk → "Invoices" | `p01-invoices.png` | All stat cards read 0 / ₹0.00, followed by "Invoices (0) — No invoices found — Try a different search or adjust the filters." **`GET /pharmacy/invoices` returns 403 twice.** The screen blames the user's filters when the real cause is permissions (mapped #11 confirmed). Steps 2–8 are impossible for this persona. | clean |

## Pass 2: ADMIN

| Step | Screenshot | What the screen shows | Geometry |
|---|---|---|---|
| 1 Desk → "Invoices" | `a01-invoices.png` | "Pharmacy Invoices" appears twice (h2 and PageHeader). Stat cards: Total 2, ₹1081.92, Completed 1, Pending ₹123.20. "Invoices (2)". The filter selects wrap their values over two lines ("All / statuses", "All / payments", "All / methods"), and the search placeholder is cut to "Invoice nu". The sidebar highlights **Pharmacy Billing**, not the page the user is on. | clean |
| 2 Payment Status "Pending" | `a02-filter-pending.png` | 1 row. **The stat cards now describe only the filtered rows** ("Total Invoices 1", "Total Amount ₹123.20") but keep the "Total" labels (mapped #10 confirmed). The options include "Completed", while the action is called "Mark as Paid": two words for the same state. | n/a |
| 3 Payment Method "UPI" | `a03-filter-upi.png` | 1 row, with raw uppercase badges "CONFIRMED" and "PENDING". **The method filter offers Wallet and Insurance, which the builder cannot record** (it offers Cash/Card/UPI/Net Banking). | n/a |
| 4 Mark as Paid (green check) | `a04-marked-paid.png` | Native `confirm()` "Mark invoice PHI-2026-004 as paid? Remaining payment: ₹123.20", then native `alert()` "Invoice marked as paid successfully". The row drops out of the filter, and the stat cards go to 0. Full-balance only. | n/a |
| 5 (timeout/retry) | n/a | Not reproducible without network fault injection. Not tested. | n/a |
| 6 "Clear" | `a05-cleared.png` | All filters reset and **Date Range jumps to "All dates"**, not back to "Today" (claim confirmed). | n/a |
| 7 Search "PHI-2026-004", then Delete (trash), then OK | `a06-delete-attempt.png` | Native confirm "Are you sure you want to delete this invoice?", then alert **"Failed to delete invoice. Please try again."** The server's actual reason is 400 "Only draft invoices can be deleted". The stat card reads "Total Invoices 1" for the search result. | n/a |
| 8 Retry Delete | n/a | Same failure (claim and mapped #8 confirmed). The row offers only View / Download / Delete: **no Cancel or Void**. | n/a |
| View | `a07-view-window.png` | Opens a popup print window (6.5 KB of HTML). | n/a |
| Mobile 390x844 | `mobile-check.png` | The "Back" button breaks per letter ("B / ac / k"), and the title "Pharmacy Invoices" wraps. Geometry shows the invoice row content spilling 35–76px. | 6 spills (invoice row, up to 76px) |

## Mapped defects checked live

| Defect | Verdict |
|---|---|
| #8 Delete is shown on every row and always fails for builder invoices | **CONFIRMED** (400 "Only draft invoices can be deleted" → generic alert) |
| #10 Stat cards are page/filter-scoped but labelled as totals | **CONFIRMED** (filters and search change "Total Invoices") |
| #11 Load failures look like "no results" | **CONFIRMED** (PHARMACIST 403 → "Try a different search") |
| #14 Duplicate page titles | **CONFIRMED** |
| #15 Payment-mode mismatch | **CONFIRMED** (the list filter has Wallet/Insurance, the builder does not) |
| "Clear resets to All dates" | **CONFIRMED** |
| #9 Dead "Edit Invoice" and "Confirm" on drafts | Not testable: no DRAFT invoices exist, and no screen creates one |

## Flow log

- Story path: 8 steps. Ideal path: 6, needing a Void action the UI lacks.
- Actual path:
  - ADMIN: 7 steps. Filter ×2 and Mark as Paid work. The cleanup of the wrong invoice is impossible.
  - PHARMACIST: blocked at step 1.
- Hesitations:
  - Icon-only row actions (eye/download/check/trash) have only title tooltips.
  - The "Completed" vs "Paid" wording.
  - After Clear, the list silently widened to all dates.
  - Delete's error gives no reason and no alternative.
- Redundancy: the page title appears twice. The invoice list is also reachable through Inventory → Sales → Patient invoice history (not walked).
- Native browser dialogs are used for every confirmation and result.
