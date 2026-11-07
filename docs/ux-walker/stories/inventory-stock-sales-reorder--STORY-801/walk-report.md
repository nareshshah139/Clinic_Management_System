# Walk report: STORY-801, morning triage from the Inventory "Today" queues

- **Topic**: inventory-stock-sales-reorder
- **Result**:
  - **PASS for the ADMIN persona named in the story**, with findings.
  - The PHARMACIST variant is blocked by RBAC (D-2).
  - The `?tab=` deep links are broken, as the story says.
- **Walked**: 2026-11-07 with Playwright Chromium at 1280x800, plus a mobile check at 390x844
- **Personas**: pharmacist@clinic.test first, then admin@clinic.test
- **Screenshots**: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/inventory-stock-sales-reorder--STORY-801/`
- **Scripts**: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/scripts/pharmacy/s801*.js`

## Pass 1: PHARMACIST

| Step | Screenshot | What the screen shows | Geometry / network |
|---|---|---|---|
| 1 Sidebar "Inventory" | `p01-loading.png`, `p02-today.png` | The first compile takes about 6s. My capture at 1.2s still showed the dashboard, so the skeletons were not captured. | n/a |
| 2 Today queue | `p04-low-stock.png` (the Low stock click did not navigate) | "What needs attention" shows "0 / Price/stock edits awaiting approval (0)". **Low stock and Expiring show "—"** with no explanation. **The Low stock row is not clickable for this role**: Playwright found no button or link, and nothing happened. | uneven button widths in the action row (intentional) |
| Alt (a) "Check low stock" | `p05-check-low-stock.png` | The URL becomes `?area=stock&view=list&stock=LOW`. A red banner shows the raw permission string **"This action requires inventory:item:read (Reference: …) Retry"**, followed by "Stock results unavailable" and an empty table. Retry cannot succeed. `GET /inventory/workspace/stock` returns 403 twice (D-2 confirmed). | n/a |

## Pass 2: ADMIN

| Step | Screenshot | What the screen shows | Geometry |
|---|---|---|---|
| 1–2 Inventory → Today | `a01-loading.png`, `a02-today.png` | The header reads "Inventory / Receive, review and manage pharmacy stock." with Today active. Rows: 0 approvals, 0 overdue bills, **4 Low stock**, 0 expiring, 0 purchase invoices, 0 files, 0 counts, 0 returns, 0 orders. Below them: "Check low stock", "Check next 3 months' expiry" and "Check overdue supplier balances". | clean (only intentional button-width differences) |
| 2b Hover Low stock | `a03-hover.png` | The title tooltip reads "Available quantity is at or below this batch's saved minimum." This matches the story. | n/a |
| 3 Duplicate count | `a02-today.png` | "0" in the count column and "(0)" in the label. **The claim is confirmed.** | n/a |
| 4 Click "Low stock" | `a04-low-stock.png`, `a04b-low-stock-table.png` | The URL is `?area=stock&view=list&stock=LOW`. The Stock tab is active, the Stock level shows "Low stock", the chip reads "stock: LOW ×", and the list says "4 matching batches". This matches the story. **The whole first viewport is filters.** The table starts below the fold. In it, **"Edit price" and "Edit stock" wrap one letter per line**, and each row is about 220px tall. The rows mix equipment (Dermatoscope, Cryo Spray, Electrocautery Tips) with medicines. Every row reads "Batch missing / On hand, expiry unverified", and the units are uppercase ("5 PACKS", "60 STRIPS"). | wrapped controls: Filters, Reset, Edit price ×N, Edit stock ×N, product names |
| Var. Expiring row | `a05-expiry.png` | `?area=stock&view=list&expiryMonths=3`, with the chip "expiryMonths: 3 ×". The chip shows the raw parameter name. | n/a |
| 5 Today → Recent activity → `SHORTBOOK-2026-11-07` | `a06-recent-activity.png`, `a09-recent-doc.png`, `a10-after-back.png` | The shortbook draft opens in the workflow editor (`?area=reorder&view=SHORTBOOK&document=…`). **The URL has no `return=` parameter.** I returned with the "Today" area tab (`?area=today`). I did not exercise the editor's own back arrow (←). This only partly matches the story's claim. | n/a |
| Alt (c) `?tab=low-stock` / `?tab=expiry` | `a07-tab-low-stock.png`, `a07-tab-expiry.png` | Both **land on Today** with no filter applied. **The claim is confirmed.** | n/a |
| Bell | `a08-bell.png` | The notifications list shows only "7 upcoming appointments". **There is no low-stock entry, although Today shows 4–6 low-stock batches**, so the broken low-stock link was not even shown this session. | n/a |
| Mobile 390x844 | `mobile-check.png` | The area tabs wrap to two rows (Today/Purchases/Stock, then Sales/Reorder) with uneven spacing. The queue rows stay one per line, and the label "Price/stock edits awaiting approval (0)" wraps. The Low stock count was 6 by this time (stock moved during STORY-603). | clean |

## Mapped defects checked live

| Defect | Verdict |
|---|---|
| D-2: wildcard grants mean PHARMACIST has no inventory read | **CONFIRMED.** Low stock and Expiring show "—", the row is not clickable, and the stock list returns 403 with the raw permission text. |
| Story claim: `?tab=low-stock` / `?tab=expiry` land on Today | **CONFIRMED** |
| Story claim: approvals count shown twice | **CONFIRMED** |
| Story claim: `return=` preserved from Recent activity | **REFUTED / not observed.** The opened document URL had no `return=`. |
| D-3: "Orders awaiting receipt" counts drafts | Not testable (0 orders) |

## Flow log

- Story path: 5 steps. Ideal path: 2 (open Inventory, click Low stock).
- Actual path for ADMIN: 2 clicks reach the filtered list, which matches the ideal. Reading any result then needs about one screen of scrolling past the filters, and the rows are hard to scan because their action buttons are crushed.
- PHARMACIST: 2 steps to a dead end (raw permission error).
- Hesitations:
  - (a) "—" counts give no reason.
  - (b) The tooltip-only explanation is invisible on touch screens.
  - (c) The low-stock list shows devices with "Batch missing", so I was unsure whether these are real low-stock items or data-quality noise.
- Redundancy: low stock can be reached from the Today row, the "Check low stock" button, the Stock list filter, the (broken) bell link, and the Desk "Stock … low" tile. That is 5 entry points.
