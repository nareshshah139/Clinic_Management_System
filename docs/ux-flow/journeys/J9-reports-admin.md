# J9 — Reports & admin: the month-end picture, plus onboarding a staff member

Critique pass (not a test pass) over STORY-110 (admin assembles the month-end picture) and STORY-111
(admin onboards a pharmacist and issues a reset code), with STORY-105/106/108/112 as supporting
context. Driven live on 13 Nov 2026 at 1440×900 as `admin`, `accountant`, `pharmacist` and the user
created for this pass ("Jnine Tester", PHARMACIST).

**Verdict: convoluted.** The individual pharmacy table reports and the reset-code dialog are close to
minimal. The journey is convoluted because the month-end picture is spread over three report surfaces
with five filter-bar designs and no shared period, and because the Users screen has four controls that
do nothing or do the wrong thing.

How to read the evidence tags: **measured** = clicked or seen live (screenshot, DOM text or API
response); **suspected** = read from the code only.

Seed-data note: all seeded and critic-created money is in November 2026, so the live replay used
"this month" (1–13 Nov) where the story uses October. The October figures in the scorecard are the
live replay plus the extra date inputs each screen would need; every one of those controls was seen live.

## Friction Scorecard

| Measure | STORY-110 month-end picture | STORY-111 onboard + reset | Journey total |
|---|---|---|---|
| Steps, ideal (from the stories) | 6 | 11 (9 create + 2 reset) | 17 |
| Steps, actual | 23 for month-to-date (measured), 33 for October | 16 (10 create + 2 wasted in Role & Permissions + 4 reset) | 39 / 49 |
| Screens / dialogs visited | 11 screen states over 3 surfaces; the Pharmacy Report landing page is revisited 4 times just to switch report | 1 page, 4 dialogs, 2 browser alerts | — |
| Decisions the user must make | 9 | 6 | 15 |
| …of which a default or a merge could carry | 6 | 4 | **10** |
| Re-entry of known data | 5 (the same month, on 5 more screens, about 11 inputs) | 1 (role shown again with `Apply Role`) | **6** |
| Confirmations guarding nothing | 0 dialogs, but 1 redundant commit button (`Generate Report`) | 2 success `alert()`s that need an OK click | **2** (+1 redundant button) |
| Dead ends | 2 | 3 | **5** (+1 off-path) |
| Hesitation points | 10 | 5 | **15** |

### Steps — where the 23 / 33 go (STORY-110)

Month-to-date replay (measured unless marked):

1. Sidebar › `Reports` — 1
2. "From date" → report regenerates by itself — 1 (October: +1 for "To date")
3. `Export` ▸ "Excel" — 2 (fails silently, see Dead ends)
4. Cards "Payment Analytics", "Doctor Performance", "Inventory Report" — 3
5. Sidebar › `Pharmacy Report` — 1
6. Card "Sales Register" (opens on last month, empty) → Period "This month" → `Go` — 3 (October: 1)
7. Breadcrumb "← Pharmacy Report" → menu "Daily Sales Summary – Doctorwise" — 2 (October: +2, Period and `Go`)
8. Breadcrumb → menu "GST Summary & Monthly P&L" → `Export all source rows` (seen, not clicked) — 3 (October: +3, two dates and a month)
9. Breadcrumb → card "Item Wise Margin Report" — 2 (October: +3, From, To, `Go`)
10. Breadcrumb → menu "Expiring Stock" — 2
11. Sidebar › `Daily Collection` → `Download` ▸ "PDF" (menu opened on Sales Register; not saved here) — 3 (October: +1, type the day)

Ten of the 23 actions are navigation between reports (5 breadcrumb clicks + 5 re-picks), because the
report menu is hidden while a report is open below 1536 px (`PharmacyReportWorkspace.tsx:126`;
measured: absent at 1440 px, present at 1600 px).

### Steps — STORY-111 (measured)

Users (1) → `New User` (1) → First Name, Last Name, Email, Phone (4) → Role open + "Pharmacist" (2) →
Password (1) → `Create` (1) = **10**. `Role & Permissions` open + close = **2 wasted** (the dialog is
empty, see bugs). `Reset password` (1) → `I have confirmed who is asking. Create code` (1) →
`Copy code` (1) → close (1) = **4**. A blank phone or a short password each add one browser alert and
an OK click (both measured: "Phone number is required", "Password must be 8-20 characters").

### Decisions

| # | Decision | Needed? |
|---|---|---|
| 1 | Which sidebar entry has the money: `Reports`, `Pharmacy Report` or `Daily Collection` | No — one catalog would remove it |
| 2 | Date range on Reports & Analytics (opens on "last 30 days", which is no accounting period) | No — default to a month |
| 3 | Which of six cards | Yes |
| 4 | Export format: JSON / CSV / PDF / Excel | Partly — JSON is not an office format |
| 5 | Which report holds "pharmacy sales": Sales Register, Sales Bills, Day wise Summary, Doctorwise, Monthly Report "Sales", Item margin "Total Sale Amount" (all showed ₹2,990.40, measured) | No |
| 6 | Which report holds the GST position: GSTR-3B "Payable in cash" or GST Summary "Net payable" (both ₹410.40, measured) | No |
| 7 | Which report holds profit: Item margin "Total Profit ₹400.00 (15.50%)" or Monthly Report "Gross profit ₹400.00 / Margin 15.5%" (measured) | No |
| 8 | Period on each pharmacy report | Yes once; re-asked on every screen (see Re-entry) |
| 9 | Download format: Excel / CSV / PDF | Yes |
| 10 | Role for the new user | Yes |
| 11 | Status at creation: Active / Inactive / Suspended / Pending | No — a new account is Active |
| 12 | What password to invent for someone else | No — a one-time code already exists for this |
| 13 | Change role in `Edit` or in `Role & Permissions` | No |
| 14 | `Apply Role` or `Save Permissions` (two primary buttons, [13](J9-reports-admin-screens/13-role-permissions-dialog.jpg)) | No |
| 15 | Deactivate: "Inactive" or "Suspended" | Partly — one "Active" switch would do |

### Re-entry

- The month is asked for again on Reports & Analytics (2 date inputs), Doctorwise (Period + `Go`), GST
  Summary (2 dates), Monthly Report (month picker), Item margin (From, To, `Go`) and Daily Collection
  (day). Only the GST-return reports and Sales Register open on last month by themselves
  (`report-catalog.ts`, `defaultPeriod: "last-month"`). Day wise Summary does not keep its dates in the
  address bar at all (measured: URL stays `?report=day-wise-summary`).
- `Role & Permissions` opens with the role just chosen at creation and a primary `Apply Role` button beside it.

### Confirmations

- Guard nothing: `alert("Permissions updated successfully!")` (measured) and
  `alert("Role updated to … successfully!")` (suspected, `UsersManagement.tsx:397`; live it showed the
  failure alert instead). `Generate Report` is not a dialog but is a commit step that repeats what the
  date change already did (measured: the report reloaded on the date change alone).
- Earn their place: the reset-code step. It is one button that both confirms and creates
  ("I have confirmed who is asking. Create code"), on an action that hands out account access. Keep it.
  `confirm("Delete user?")` guards a destructive action, but does not name the user.

### Dead ends

1. Reports & Analytics `Export` ▸ "Excel": request refused (400), nothing on screen, the control now reads "Excel" (measured).
2. `Create`: the dialog closes with no message; the admin scans the table to find out whether it worked (measured: no toast, new row appears first of 8).
3. `Role & Permissions`: an empty panel reading "Permissions — Selected: 0" with no explanation ([13](J9-reports-admin-screens/13-role-permissions-dialog.jpg), measured).
4. `Edit` › Status "Inactive" › `Save`: dialog closes, the row still reads ACTIVE, no message (measured).
5. Accountant on Daily Collection: banner says "…then enter them below" and there is nothing to enter ([10](J9-reports-admin-screens/10-daily-collection-accountant.jpg), measured).
6. Off-path: an accountant or pharmacist who opens `/dashboard/reports` gets the full page with "No data available for the selected period" instead of "you do not have access" (measured).

### Hesitations

1. Three sidebar entries with "report"/"collection" in them, in three groups (Overview, Pharmacy, Admin) ([01](J9-reports-admin-screens/01-reports-analytics-revenue.jpg)).
2. "Total Revenue ₹5,600.00" — is the pharmacy in it? It is not: Daily Collection for the same day shows Whole day ₹8,590.40 = Clinic ₹5,600.00 + Pharmacy ₹2,990.40 ([03](J9-reports-admin-screens/03-reports-analytics-export-menu.jpg) vs [08](J9-reports-admin-screens/08-daily-collection-admin.jpg), measured).
3. `Generate Report` is the only dark button on the page; the report is already there.
4. Sales Register opens on October and looks empty; Doctorwise, Margin and Day wise open on November.
5. Changing Period does nothing until `Go` (measured: URL unchanged).
6. `More filters` opens a panel that is cut off at the left edge ([04](J9-reports-admin-screens/04-sales-register-more-filters-clipped.jpg)).
7. With a report open the report menu is gone; the only way to another report is the small "← Pharmacy Report" breadcrumb.
8. "GST Summary & Monthly P&L" opens under a second, larger-looking heading "Pharmacy Compliance", with no `Print`/`Download` and two `Export all source rows` buttons ([05](J9-reports-admin-screens/05-gst-summary-monthly-pl.jpg)).
9. Margin and Sales Register: the column the reader came for ("Profit ₹ (%)", "Total") is off the right edge at 1440 px ([06](J9-reports-admin-screens/06-item-margin-report.jpg), [04](J9-reports-admin-screens/04-sales-register-more-filters-clipped.jpg)).
10. Daily Collection as admin: the page is about 3,300 px tall in an 836 px pane and `Save count` sits about 2,180 px down, two and a half screens below the title (measured; [09](J9-reports-admin-screens/09-daily-collection-admin-count.jpg) is scrolled).
11. "Password (8-20 chars)": what should an admin type for someone else, and how is it passed on? No show/hide control ([12](J9-reports-admin-screens/12-create-user-dialog.jpg)).
12. After `Create`: did it work?
13. `Apply Role` vs `Save Permissions`, and why is the list empty?
14. Inactive vs Suspended vs Pending.
15. `Copy code`: no "Copied" feedback (measured: dialog text unchanged).

## Take-away Pass

### Reports & Analytics — [01](J9-reports-admin-screens/01-reports-analytics-revenue.jpg), [03](J9-reports-admin-screens/03-reports-analytics-export-menu.jpg)

- **Remove** the "System Alerts" strip. It is the loudest block on the page (orange, first), is a copy of
  the dashboard card, and showed "Low Stock 0" while the Inventory Report card on the same page listed
  4 low-stock items, and "Pending Payments 0" while Daily Collection showed "Clinic still due ₹700.00" (measured).
- **Remove** `Generate Report`. Selecting a card or changing a date already loads the report.
- **Replace** the `Export` select with the same `Download` menu Pharmacy Report uses; drop "JSON". A
  select that fires on change cannot repeat the same format and keeps showing "Excel" afterwards.
- **Demote** the six cards to a compact tab row. They take 330 px, so at 900 px the first figure is
  below the fold and the date range sits between the cards and the result.
- **State once**: "Payment Mode Breakdown" appears in Revenue Report and again in Payment Analytics with
  the same three figures (Cash ₹200, Card ₹3,000, UPI ₹2,400, measured). Keep it in one.
- **Hierarchy**: four tiles in four colours of equal weight; "GST Amount ₹0.00" and "Net Revenue" (equal
  to Total Revenue) add nothing for a clinic whose consultation bills carry no GST. One headline figure,
  labelled "Clinic revenue", is enough.
- **Move** "Inventory Report" out: it is pharmacy stock on a page whose money is clinic-only, and its
  "Total Value ₹4,08,925.00" matches neither "Stock at cost ₹3,29,390.00" nor "Stock at MRP
  ₹4,37,965.00" in the Monthly Report (measured, same hour).
- Primary action: wrong one (`Generate Report`). After the changes above the page needs none.

### Pharmacy Report landing — [02](J9-reports-admin-screens/02-pharmacy-report-landing.jpg)

- **Collapse** the amber notice to one line or an (i): it is a standing caveat, not news, and it is the
  most prominent element on every visit.
- **Deferrable**: the card descriptions are 2–6 lines each and push the grid to 500 px; the title's (i)
  already carries the same sentence on the report page.
- "Daily Collection" is reachable four ways from this screen and its sidebar (sidebar item, card, menu,
  search). The sidebar item is a deliberate shortcut for the pharmacist; the card is the removable one.
- The search narrows the menu but not the cards (measured with "gstr") — acceptable, but the cards then
  contradict the search.
- Nothing else to remove: search + five categories + six cards is a sound catalog.

### Table reports (Sales Register, Doctorwise, GSTR-3B, Expiring Stock) — [04](J9-reports-admin-screens/04-sales-register-more-filters-clipped.jpg)

- One primary action (`Go`), `Print`/`Download` secondary: correct.
- **Default-carry**: Period should apply on selection; `Go` is only needed for typed dates and the search box.
- **Collapse** "Type" and "GST" into `More filters` on Sales Register: the story's admin never touches
  them and they push `More filters` and `Go` onto a second row.
- **Fix** the `More filters` panel position (it opens leftwards, off the content area).
- **Freeze** the last column or reorder so "Total" is visible without horizontal scroll; "CESS" (0.00
  on every row) sits before it.
- Headline "Total for the period" appears once, top right: good.

### GST Summary & Monthly P&L — [05](J9-reports-admin-screens/05-gst-summary-monthly-pl.jpg)

- **Remove** the heading "Pharmacy Compliance" and its subtitle: third title in 120 px, and a name used nowhere else.
- **Remove** both `Refresh` buttons: every input change already reloads.
- **Merge** the two period controls (date range for GST, month for P&L) into the standard Period picker; a month is a range.
- **Collapse** "GST source records" and "Monthly source records": the same two bills are listed twice on
  one page (measured: PHI-2026-001, PHI-2026-002 in both tables).
- **Rewrite** the caption "2026-11-01T00:00:00.000Z to 2026-11-13T23:59:59.999Z · current branch · 2 records".
- Overlap: Input/Output/Net payable repeats GSTR-3B; Sales/Gross profit/Margin repeats the margin
  report's tiles. What is unique here is Procurement, Stock at cost/MRP and Write-off.

### Item Wise Margin Report and Day wise Summary — [06](J9-reports-admin-screens/06-item-margin-report.jpg), [07](J9-reports-admin-screens/07-day-wise-summary.jpg)

- **Remove** the inner card title and description ("Item-wise Margin", "Day-wise Summary"): the page
  heading directly above says the same thing in a different spelling.
- **Defer** "Tags", "Search in" and "Search" on the margin report into `More Filters`; seven controls in
  two rows precede four tiles.
- **Replace** the native From/To pickers with the Period picker used by the other 12 reports.
- Day wise: **hide slab bands with no value** by default. At 1440 px the first ten numeric columns are
  CESS and 0% and are all 0.00; "Total" needs a long horizontal scroll. Twelve of thirteen rows read
  "No bills" — offer "hide days with no bills".
- Neither has `Print`; every other report does.

### Daily Collection — [08](J9-reports-admin-screens/08-daily-collection-admin.jpg), [09](J9-reports-admin-screens/09-daily-collection-admin-count.jpg), [10](J9-reports-admin-screens/10-daily-collection-accountant.jpg)

- "Whole day" is stated three times in 150 px: section heading, first tile, table caption. Drop the heading.
- "Clinic received ₹5,600.00" (third block) repeats the "Clinic" tile and the Clinic column total (first block).
- "Pharmacy billed today" appears as a tile, as "Today's bills" total and as "Total billed" in the next
  table (₹2,990.40 three times in one screen, [09](J9-reports-admin-screens/09-daily-collection-admin-count.jpg)).
- **Collapse** "Pharmacy bills raised today" (six derived rows) behind a disclosure; it restates the reconciliation table.
- For admin, **collapse** the "Clinic bills" list by default; it grows with every bill and sits between the summary and the count.
- "Pharmacy count difference — Not counted" tile repeats the amber banner directly above it.
- One primary action (`Save count`): correct. Day stepper with no `Go`: correct.

### Users list — [11](J9-reports-admin-screens/11-users-list.jpg)

- **Remove** two of the three titles ("Users Management" / "Users" / "All Users") and two of the three
  subtitles ("Manage clinic staff and user accounts" / "Manage users, roles, and statuses" / "Manage system users and roles").
- **Collapse** row actions. Each row carries 4–6 equal-weight outline buttons on two or three lines;
  `Delete` sits between `Edit` and `Reset password` with the same weight. Keep `Edit` and
  `Reset password`; put `Role & Permissions`, `Working Hours`, `WhatsApp Settings`, `Delete` in a "More" menu.
- **Move** `Clinic Holidays` off this page's header: it is not about users and shares the row with the primary `New User`.
- `New User` is the single primary action: correct.

### Create / Edit User dialog — [12](J9-reports-admin-screens/12-create-user-dialog.jpg), [15](J9-reports-admin-screens/15-new-user-shows-stale-edit.jpg)

- **Remove** "Status" from Create.
- **Replace** "Password (8-20 chars)" with a one-time code issued on create (the reset-code mechanism).
- **Remove** "Status" from Edit as it stands: it has no effect (see bugs). Replace with a row switch.
- Everything else (two names, e-mail, phone, role) is needed.

### Role & Permissions dialog — [13](J9-reports-admin-screens/13-role-permissions-dialog.jpg)

- **Remove** the Role select, `Apply Role` and `Clear All`: role belongs in Edit. That leaves one primary action.
- For a Pharmacist the whole dialog is removable from the onboarding path: the account created here, with
  no grants edited, opened Pharmacy Report and had the count boxes and `Save count` (measured as Jnine Tester).

### Reset password dialog — [14](J9-reports-admin-screens/14-reset-code-issued.jpg)

- Nothing to remove. Add "Copied" feedback; consider copying automatically when the code appears.

## The Simpler Version

### Month-end picture (STORY-110) — 6 steps

1. Sidebar › `Reports` (one entry; today's `Pharmacy Report` catalog with a "Clinic" category added).
2. "Month summary" opens first, on last month. One page: Clinic received, Pharmacy sales, Whole total;
   by payment mode (Clinic / Pharmacy / Total — the table Daily Collection already draws for a day);
   GST output, input, net payable; pharmacy gross profit and margin; stock at cost; value expiring.
3. Click "Pharmacy sales" → Sales Register, already on that month.
4. Back; click "Gross profit" → Item margin, already on that month.
5. `Download` → one workbook with a sheet per block.
6. Click a day in the summary's day strip → Daily Collection for that day.

### Onboard + reset (STORY-111) — 9 + 2 steps

1. Sidebar › `Users`. 2. `New User`. 3–6. First name, last name, phone, e-mail. 7. Role "Pharmacist".
8. `Create` → the dialog turns into "Account created. Give Farhan this one-time code" with the code
   copied. 9. Close; the new row is highlighted.
Later: `Reset password` → `I have confirmed who is asking. Create code` (code copied automatically).

### Changes to get there

| # | Change | Effort | Files |
|---|---|---|---|
| 1 | Carry the applied period from report to report (put `from`/`to` on the menu and card links; make Margin, Day wise and GST Summary read them) | M | `frontend/src/components/pharmacy/reports/report-catalog.ts` (`reportHref`), `PharmacyReportWorkspace.tsx`, `ItemMarginReport.tsx`, `DayWiseSummaryReport.tsx`, `ComplianceCenter.tsx` |
| 2 | Keep a way to switch report while one is open at laptop widths (show the menu from `xl`, or a "Switch report" select in the breadcrumb) | S | `PharmacyReportWorkspace.tsx:126` |
| 3 | Apply a Period preset on selection; keep `Go` for typed dates and search | S | `ReportToolbar.tsx` (`PeriodPicker` → `onApply`) |
| 4 | Give Margin, Day wise and GST Summary the shared toolbar (Period presets, `Print`, `Download`); drop their inner titles, `Refresh` buttons and the "Pharmacy Compliance" heading | M | `ItemMarginReport.tsx:235-290`, `DayWiseSummaryReport.tsx:90-120`, `ComplianceCenter.tsx:269, 315-324, 408` |
| 5 | Reports & Analytics: remove `Generate Report`, swap `Export` select for a `Download` menu without JSON, show request errors on the page | S | `frontend/src/app/dashboard/reports/page.tsx:1251-1264, 319, 353` |
| 6 | Reports & Analytics: remove the System Alerts strip; rename "Revenue Report" figures to "Clinic revenue" with a line "Pharmacy sales are in Pharmacy Report › Sales Register" | S | `reports/page.tsx:1162-1200`, revenue section |
| 7 | Month summary: extend the Daily Collection "Whole day" block to a date range and add the GST / profit / stock tiles that already exist in other reports | L | `backend/src/modules/pharmacy/pharmacy-daily-collection.ts`, `DailyCollectionReport.tsx`, `report-catalog.ts` |
| 8 | Fold Reports & Analytics into the catalog as a "Clinic" category (Revenue, Doctors, Appointments, Patients); retire Payment Analytics' duplicate mode split and the Inventory Report card | L | `reports/page.tsx`, `report-catalog.ts`, `frontend/src/components/layout/sidebar.tsx:132-138` |
| 9 | Fix the `More filters` panel so it opens inside the content area | S | `frontend/src/components/register/RegisterFilters.tsx` (`panelClass`) |
| 10 | Day wise: hide empty slab bands and offer "hide days with no bills"; Sales Register / Margin: keep the total column in view | M | `DayWiseSummaryReport.tsx`, `ReportTable.tsx`, `ItemMarginReport.tsx` |
| 11 | Daily Collection: drop the repeated "Whole day" heading, collapse "Pharmacy bills raised today" and the bill lists for non-counting viewers, and use a read-only banner text when `canRecordCount` is false | S | `DailyCollectionReport.tsx:196-293`, `collection-model.ts:60` |
| 12 | Users: reset the form when `New User` is pressed; show a toast and highlight the row on success; show server errors in the dialog; replace `alert()` validation with inline messages | S | `frontend/src/components/users/UsersManagement.tsx:107-136, 432` |
| 13 | Users: drop Status from Create; make Active a row switch that calls the status endpoint | S–M | `UsersManagement.tsx:467-477, 523-527`, `frontend/src/lib/api.ts` (`PATCH /users/:id/status`) |
| 14 | Users: issue a one-time code on create instead of asking the admin for a password | M | `UsersManagement.tsx:479-484`, `ResetCodeButton.tsx`, `backend/src/modules/users/users.service.ts` (create without password) |
| 15 | Users: make the roles / permissions lists load (route order), then reduce `Role & Permissions` to "Extra permissions" showing the user's own grants with readable names; role changes only in Edit | S (route) + M (dialog) | `backend/src/modules/users/users.controller.ts:96 vs 181, 210`, `UsersManagement.tsx:360-413, 544-620` |
| 16 | Users: row actions into Edit / Reset password / More; one page title; show "Pharmacist", "Active" instead of codes; add Accountant to the role list | S | `UsersManagement.tsx:419, 458-463, 497-498, 523-545, 557-562`, `frontend/src/app/dashboard/users/page.tsx:10` |
| 17 | Reset dialog: "Copied" feedback (or auto-copy) | S | `ResetCodeButton.tsx:42` |

Changes 1–6, 9 and 12–13 are small and remove about half the measured friction (10 navigation clicks,
5 period re-entries, 3 of the dead ends) without building anything new. 7–8 are the structural fix.

Steps that earn their place and should stay: `Go` for typed date ranges and the in-report search (a
half-typed date must not fire a request); the combined confirm-and-create button for reset codes; the
separate Daily Collection day view (a drawer count is a per-day act, not a month figure).

## Clarity Issues

- **"Total Revenue" / "Net Revenue" / "Revenue Report"** on a page titled "Reports & Analytics" — means
  clinic consultation and procedure payments only. Nothing says so. Same money is "Clinic received" on Daily Collection.
- **Seven names for pharmacy sales** (all ₹2,990.40 today, measured): "Total for the period" (Sales
  Register), "Total sales" (Doctorwise), "Total for the range" (Day wise), "Sales" (Monthly Report),
  "Total Sale Amount" (Margin), "Pharmacy" and "Pharmacy billed today" (Daily Collection).
- **"Net payable" vs "Payable in cash"**, **"Output GST" vs "Output tax"**, **"Gross profit" vs "Total
  Profit"** — same figures today, different names, on different screens.
- **"Total Net GST ₹62.40"** on the margin report sits one screen away from "Output GST ₹410.40"; the
  difference (GST on the margin vs GST on the sale) is only in an (i) tip.
- **Sidebar**: "Reports" → page "Reports & Analytics"; "Pharmacy Report" (singular) is a catalog of 16
  reports; "Daily Collection" under Overview opens a page whose breadcrumb says "Pharmacy Report / Accounting Reports".
- **"Daily Sales Summary – Doctorwise"** covers any period and is not daily; it lists "No doctor
  recorded" at 48% with no hint that this means counter sales (measured).
- **"Item Wise Margin Report" / "Item-wise Margin"**, **"Day wise Summary" / "Day-wise Summary"**: two
  spellings stacked on the same screen.
- **"Days are Asia/Kolkata calendar days"**, **"2026-11-01T00:00:00.000Z to …"**, **"CONFIRMED"**,
  **"current branch"**: system vocabulary shown to office staff.
- **"Pharmacy not counted yet … then enter them below"** shown to an accountant who cannot enter anything.
- **"Low Stock"**: 0 in System Alerts, 4 in Inventory Report, same page.
- **Dates**: native pickers (Reports & Analytics, Margin, Day wise, GST Summary) follow the browser
  locale and showed mm/dd/yyyy in the test browser, while the Period picker and Daily Collection are
  fixed at dd/mm/yyyy. On a clinic PC set to English (US), consecutive screens would disagree (suspected for real devices).
- **Role and Status codes**: table shows `PHARMACIST`, `RECEPTION`, `ACTIVE`; dialogs say "Pharmacist", "Receptionist", "Active".
- **`New User` → "Create User" → `Create`**; the Quick Guide says "Click 'Add User'", offers roles
  "Therapist" and "Owner", and says "Edit user information by clicking on a user row" — none of it matches the screen (measured).
- **"Password (8-20 chars)"** here; "At least 8 characters." on the reset page.
- **Inactive / Suspended / Pending**: no explanation of the difference anywhere.
- **Accountant** exists as a role in the table (Meena Iyer, ACCOUNTANT) but is not offered in either role list.
- **Dashboard** for admin, accountant and pharmacist alike leads with "Total Users", "Active Users",
  "Total Branches", "System Status" — nothing about money or stock for the people whose job is money or stock (measured).
- **Accessible names** built from field keys: "How the onTodaysBills column is calculated", "How the counterSales column is calculated" (measured in the DOM).
- **Reports Quick Guide** tells the user to "Click 'Generate Report' to create the report", which is not needed.

## Already Minimal

- **Pharmacy Report catalog**: search across titles and keywords ("gstr" → the four returns), five
  categories, six common cards, report and filters in the address bar. No simplification found.
- **Shared report toolbar** on the 12 table reports: Period presets with month names, one `Go`,
  `Print`, `Download` with three formats, a single headline figure. GST returns and Sales Register
  opening on last month is the right default for their job.
- **Daily Collection for the pharmacist** (STORY-105): one sidebar click, opens on today, no `Go`, the
  three count boxes and `Save count` are above the fold; 5 actions = the story's ideal 5 (controls seen
  live; no count was saved so as not to disturb the shared day).
- **Daily Collection "Whole day by payment mode"** table (Clinic / Pharmacy / Total): the clearest money
  view in the app and the model for a month summary.
- **Day stepper**: typing `31/10/2026` + Enter loads the day and a `Today` button appears (measured).
- **Reset-code flow**: two clicks to a code; one combined confirm-and-create button; plain instructions;
  expiry shown ("14 Nov 2026, 02:08 pm"). The staff member's side is three fields and an automatic
  return to sign-in (measured). Only the copy feedback is missing.
- **Default access for a new Pharmacist**: no permission editing is needed to open Pharmacy Report or
  record the count (measured). The onboarding path can skip `Role & Permissions` entirely.
- **Reports & Analytics auto-loading** on card or date change is the right behaviour; only the button beside it is redundant.
- **Create User dialog size**: seven fields in one small dialog, tab order top to bottom. Apart from
  Status and Password it asks only for what is needed.

## Functional bugs tripped over (not verified further)

1. `GET /api/users/roles` and `/api/users/permissions` return 404 (`@Get(':id')` at
   `users.controller.ts:96` is declared before `permissions` :181 and `roles` :210). Result: the
   `Role & Permissions` dialog lists no permissions; `Apply Role` saves the role (PATCH 200) and then
   alerts "Failed to update role. Please try again."; `Save Permissions` saves an empty list and alerts "Permissions updated successfully!".
2. `Edit` › Status "Inactive" › `Save`: the request carries `status: "INACTIVE"`, the response is 200
   with `status: "ACTIVE"`, the row does not change. A user cannot be deactivated from the screen.
3. `New User` pressed after cancelling an `Edit` opens "Edit User" filled with the previous user
   ([15](J9-reports-admin-screens/15-new-user-shows-stale-edit.jpg)); `Save` would overwrite that user.
4. Reports & Analytics `Export` ▸ "Excel" on Revenue Report: `POST /api/reports/export` → 400
   "Unsupported report type: undefined"; nothing is shown.
5. Sales Register `More filters` panel opens off the left edge at 1440 px (the "Source" select is at x = −309).
6. Daily Collection Total row shows "-0.00" under Refunds.
7. System Alerts strip shows "Low Stock 0" beside an Inventory Report listing 4 low-stock items.
8. `/dashboard/reports` renders for ACCOUNTANT and PHARMACIST (403 underneath, shown as "No data available for the selected period").

Housekeeping: "Jnine Tester" (jnine.tester@clinic.test, PHARMACIST) was created for this pass and is
still ACTIVE because of bug 2. The reset code visible in screenshot 14 was redeemed and no longer works.
No other user was edited, reset, deactivated or deleted, and `Create Backup` was not pressed.
