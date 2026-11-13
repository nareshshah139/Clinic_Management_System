# Reports, users & clinic administration

> Topic slug: `reports-admin`. Written from a read of the code only (nothing was run). Labels in
> `code font` or "quotes" are strings found in the source. "(label unverified)" marks a label that
> comes from the server payload or a component that was not read line by line.
> Today's date in the examples is Friday 13 November 2026, so "Last month" is October 2026.

## STORY-105: Pharmacist counts the pharmacy drawer at closing time

**Type**: medium
**Topic**: Reports, users & clinic administration
**Persona**: Imran Sheikh, pharmacist, 8:45 pm, shutters half down, wants to go home
**Goal**: Record what is physically in the pharmacy drawer and on the UPI / card settlements for today, and see any shortfall the same day
**Preconditions**: Signed in as PHARMACIST with the `pharmacy:compliance:read` and `pharmacy:compliance:audit` grants; pharmacy bills and at least one counter sale were confirmed today; nobody has counted yet
**Ideal path**: 5 — open the day's collection (1), type three counted amounts (3), save (1). The code needs exactly this when nothing goes wrong.
**Alternate paths**:
- Sidebar › Overview › `Daily Collection` (direct link to `/dashboard/pharmacy/reports?report=daily-collection`).
- Sidebar › Pharmacy › `Pharmacy Report` → landing page "Common reports" card "Daily Collection".
- `Pharmacy Report` → left menu › "Accounting Reports" › "Daily Collection".
- `Pharmacy Report` → search box "Search reports, e.g. GSTR" with any of: collection, daily, cash, upi, card, payment, reconciliation, takings, consultation, procedure, clinic.
- Not a path, but looks like one: the Pharmacy Counter cockpit button `Daily close` opens the Pharmacy Desk, not this count (per `docs/ux-paths/discovery.md`, naming drift C).

### Steps
1. Click `Daily Collection` in the sidebar (Overview group) → Page opens with breadcrumb "← Pharmacy Report / Accounting Reports", heading "Daily Collection" with an (i) tip, and a skeleton "Loading the day's collection…". The toolbar shows `Previous day` (chevron), a "Day" text box showing today as dd/mm/yyyy, `Next day` (disabled, because the day is today), `Print` and `Download`. There is no `Go` button on this report.
2. Read the amber status banner → "Pharmacy not counted yet. Count the pharmacy cash drawer and check its UPI and card settlements, then enter them below." Tiles below it: "Pharmacy billed today", "Pharmacy expected in hand", "Pharmacy still due".
3. Scroll to "Pharmacy reconciliation by payment mode" → A table with columns Mode, Today's bills, Earlier bills, Counter, Refunds, Expected, Counted, Difference. Rows Cash, UPI and Card are always present (other modes appear only if money moved in them). Expected reads Cash 18,450.00, UPI 27,310.00, Card 6,200.00.
4. Type `18250` in the "Cash counted" box → The Difference cell for Cash turns red and shows -200.00 as he types. The Total row immediately shows Counted 18,250.00 and Difference -33,710.00, because blank modes count as nothing in hand once anything is entered; the alarming total only settles after the other boxes are filled.
5. Type `27,310` in "UPI counted" → Difference for UPI shows 0.00 (commas and a leading ₹ are accepted).
6. Type `6200` in "Card counted" → Total Difference settles at -200.00.
7. Hesitates over the ₹200 gap, then types `₹200 given to front desk as change` in "Note (optional)" (placeholder "For example: ₹500 kept aside for change") → `Save count` is enabled.
8. Click `Save count` → Button reads "Saving…", then a green line: "Count saved. Pharmacy short by ₹200.00. Check the drawer, pending UPI settlements and any refunds paid in cash." The banner turns red with the same "Pharmacy short by…" text, a fourth tile "Pharmacy count difference" appears, the button is relabelled `Save recount` (disabled until a box changes), and a collapsed line "Counted by Imran Sheikh at …" appears under the table.
9. Finds the ₹200 under the coin tray; changes "Cash counted" to `18450` and clears the note → `Save recount` becomes enabled.
10. Click `Save recount` → "Count saved. Pharmacy balanced: what was counted matches what the system expected." Banner turns green; the history line now ends "· 1 earlier count" and expands to list both counts with who, when, amounts and note (counts are append-only).
11. Click `Print` → The report PDF is fetched and the browser print dialog opens from a hidden frame (if the frame cannot print, the PDF opens in a new tab instead).

### Variations
- **Accountant (read-only)**: Lakshmi (ACCOUNTANT) opens the same page; `canRecordCount` is false for her role, so the Counted column shows the saved figure or "—", and there is no Note box and no `Save count`. She uses `Download` → "Excel (.xlsx)" / "CSV" / "PDF".
- **Owner / admin / doctor**: viewers who can read clinic bills also get two sections above the pharmacy part: "Whole day" (tiles Whole day / Clinic / Pharmacy) and "Clinic: consultations and procedures" (tiles "Clinic received", "Clinic billed today", "Clinic still due"). The count still reconciles the pharmacy drawer only.
- **Yesterday's count**: click `Previous day` (one click per day, reloads immediately) or type a date into "Day"; a `Today` button appears to jump back.
- **Phone / narrow screen**: below `md` the table is replaced by one card per mode with a larger "Counted" box.

### Edge Cases
- **Unreadable amount** (e.g. `18k`): the box gets a red border, "Enter amounts as numbers, for example 18250 or 18,250.50." appears, and `Save count` stays disabled.
- **Two people count at once**: the second save gets a 409 → "Someone else saved a count for this day while you were entering yours. Their count is shown below; your figures are still in the boxes. Check them and save again."
- **Role without the grant**: the report fails with "Your role cannot open pharmacy reports. Ask the clinic owner or an admin for pharmacy compliance access."
- **Over, not short**: "Pharmacy over by ₹…. Check for a payment taken without a bill, or a bill not yet confirmed." (amber).
- **Future day**: `Next day` is disabled at today; a bad `from=` in the address bar falls back to today.
- **Same figures, other surfaces**: "Pharmacy billed today" is the same money as the Pharmacy Desk header metric `Sales` (today's sales), the Sales Register report "Total for the period" when the period is today, and today's row in Day wise Summary; each is computed by a different endpoint.

## STORY-106: Accountant pulls the month's GST return figures

**Type**: medium
**Topic**: Reports, users & clinic administration
**Persona**: Lakshmi Iyer, visiting accountant (ACCOUNTANT role), preparing October's GSTR-1 and GSTR-3B on 13 November
**Goal**: Download GSTR-1, GSTR-3B, the GSTR-2B ITC statement and the HSN summary for October 2026
**Preconditions**: Signed in as ACCOUNTANT with `pharmacy:compliance:read`; October sales and purchase bills are posted
**Ideal path**: 6 — open Pharmacy Report (1), tick the four returns for "Last month" (4), one download (1). Today each report is opened, exported and backed out of separately.
**Alternate paths**:
- Landing page "Common reports" cards for "GSTR-1" and "GSTR-3B" (GSTR-2A, GSTR-2B, HSN wise GST and Composition are not on the cards; menu or search only).
- Left menu › "GST Reports" lists all eleven GST reports.
- Search box: "gstr" finds the four returns; "gstr3b", "3b", "itc", "filing", "hsn", "cmp" also match.
- A bookmarked URL such as `/dashboard/pharmacy/reports?report=gstr-1&from=2026-10-01&to=2026-10-31` (report and filters live in the address bar).
- Overlapping figures elsewhere: "GST Summary & Monthly P&L" (Accounting Reports) shows Input GST / Output GST / "Net payable" for a date range; old Inventory links `?area=purchases&view=reports` forward there ("This report is now under Pharmacy Report. Opening it…").

### Steps
1. Click `Pharmacy Report` in the sidebar (Pharmacy group) → Landing page "Pharmacy Report" with an amber notice ("Every figure comes from the stock and purchase records behind it. Until the stock take and medicine-name clean-up are done, check margins and GST totals against the bills before filing."), six "Common reports" cards, and the left menu grouped GST Reports / Margin Reports / Stock Reports / Accounting Reports / Others.
2. Type `gstr` in "Search reports, e.g. GSTR" → The menu narrows to GSTR-1, GSTR-3B, GSTR-2A, GSTR-2B. (The "Common reports" cards do not filter.)
3. Click "GSTR-1" → Report opens with Period already "Last month (October 2026)", tiles Taxable value / CGST / SGST / Total tax, and sections "B2C small, rate-wise (Table 7)", "HSN summary (Table 12)" and "Documents issued (Table 13)". On screens narrower than `2xl` the left menu disappears once a report is open.
4. Click `Download` → Menu: "Excel (.xlsx)", "CSV", "PDF".
5. Click "Excel (.xlsx)" → File downloads with the same sections, rows and totals as the screen.
6. Click the breadcrumb "← Pharmacy Report" → Back on the landing page; the search box still holds "gstr" (it is component state, expected to persist).
7. Click "GSTR-3B" → Sections "3.1 Outward supplies and 4 Eligible ITC" and "6.1 Payment of tax"; tiles Output tax / Eligible ITC / Payable in cash (plus "ITC carried forward" when applicable).
8. Expand "How these figures are worked out" → Bulleted notes, including a "Not claimed: n supplier document(s) without a valid GSTIN" line when relevant.
9. Click `Print` → Print dialog with the paper-layout PDF.
10. Breadcrumb back, click "GSTR-2B" → Section "Supplier-wise ITC"; suppliers without a valid GSTIN are flagged.
11. Click `Download` → "CSV" → File downloads for matching against the portal.
12. Breadcrumb back, replace the search text with `hsn`, click "HSN wise GST" → Opens for last month with Type "Sales".
13. Change Type to "Purchase" and waits → Nothing reloads; filters are only a draft until `Go`. She notices and clicks `Go` → table reloads, URL gains `type=PURCHASE`.
14. Click `Download` → "Excel (.xlsx)".

### Variations
- **Composition-scheme pharmacy**: "Composition GST Report" adds a "Composition rate" select — "1% (trader)", "2% (manufacturer)", "5% (restaurant)", "6% (services)" — and a "Composition tax" headline.
- **Quarterly filer**: Period › "Last quarter" (financial-year quarters), then `Go`.
- **Odd range**: Period › "Choose dates…" reveals "From" and "To" text boxes (dd/mm/yyyy), then `Go`.
- **ITC cross-check**: "GSTR-2A" lays supplier invoices out as "B2B invoices" and "Credit / debit notes (supplier returns and credit notes)"; "Purchase Register" lists the same supplier bills one row each; "Purchase Bills" splits them by slab. Four reports over the same purchase documents.

### Edge Cases
- **From after To**: "The start date must be on or before the end date." and `Go` is disabled.
- **Range over 400 days**: the server rejects it; the error is shown with "Check the dates and press Go to try again."
- **Nothing posted**: single-table reports show "Nothing in this period. Choose another period and press Go."
- **Bad `?report=`**: "That report is not available. Choose one from the list." above the landing page.
- **Two HSN tables**: "HSN wise GST" (Type Sales) and GSTR-1's "HSN summary (Table 12)" are the same summary in two reports; the accountant has to decide which one to trust.
- **Two "payable" numbers**: GSTR-3B "Payable in cash" (after statutory set-off) vs GST Summary "Net payable" (output minus input) are different calculations with similar names.

## STORY-107: Admin answers a patient's billing query from the Sales Register

**Type**: medium
**Topic**: Reports, users & clinic administration
**Persona**: Kavitha Nair, clinic administrator (ADMIN), patient Mrs. Padmaja Rao (98480 12345) on the phone disputing her October pharmacy spend
**Goal**: List every discounted pharmacy bill for one patient in October, then pull a slab-wise copy for the accountant
**Preconditions**: Signed in as ADMIN; the patient has several confirmed pharmacy bills in October 2026
**Ideal path**: 4 — open Sales Register (1), type the mobile number and apply (1), tick "Discounted only" (1), download (1).
**Alternate paths**:
- Sidebar › `Sales` register (`/dashboard/pharmacy/sales`): date range, search by Bill No / Patient / Mobile, payment-mode filter, more filters (per discovery) — a second "sales register" with its own filters and footer totals, and row actions the report lacks.
- Pharmacy Desk › `Invoices` (`/dashboard/pharmacy/invoices`) and Inventory › Sales › "Patient invoice history" (same invoice list component, per discovery).
- Pharmacy Report landing card "Sales Register", or menu › GST Reports › "Sales Register", or search "sales" / "customer" / "outward".
- "Sales Bills" report with the same search box gives the slab split of the same bills.
- "Purchase Bills" with Type switched to "Sales" is the identical report to "Sales Bills" (and "Sales Bills" with Type "Purchase" is "Purchase Bills"): one server branch serves both ids.

### Steps
1. Click `Pharmacy Report` in the sidebar → Landing page.
2. Click the "Sales Register" card → Report opens for "Last month (October 2026)" with Type "Sales", GST "All bills", "Search this report" (placeholder "Customer, bill no. or mobile"), `More filters`, `Go`, `Print`, `Download`, and a headline "Total for the period".
3. Type `9848012345` in "Search this report" → Nothing changes yet (draft).
4. Press Enter → Table reloads with only her bills; URL gains `q=9848012345`; headline and the totals row under the header now cover just these rows.
5. Click `More filters` → Panel with "Source" (All sources / Prescription bills / Counter sales), "Doctor" (All doctors + the doctors present in the report) and "Discount" (All bills / Discounted only), plus `Clear`.
6. Choose Discount "Discounted only" → The `More filters` button shows a count badge "1"; still a draft.
7. Click `Go` → Only discounted bills remain.
8. Click the "Total" column heading (label unverified) → Rows sort ascending; click again for descending. The totals row stays pinned under the header.
9. Change Type to "Sales net of returns" and click `Go` → Customer returns appear as negative rows (red).
10. Click `Download` → "PDF" → File downloads to read out / forward.
11. Click breadcrumb "← Pharmacy Report", then menu › GST Reports › "Sales Bills" → Slab-banded table (Base / SGST / CGST / IGST per GST slab), Type "Sales", GST "All bills", and an extra `Show columns` button.
12. Click `Show columns` and untick the slabs with no sales → Columns hide; the button shows a badge with the number hidden; the choice is remembered in this browser per report. Footer text: "Print and Download always include every column."
13. Click `Download` → "Excel (.xlsx)" → The file still contains every column.

### Variations
- **By doctor**: in `More filters`, "Doctor" lists only doctors who appear in the loaded period.
- **Returns only**: Type "Returns".
- **Non-GST items**: GST select "Without GST".
- **Doctor-wise totals instead of bills**: Others › "Daily Sales Summary – Doctorwise" ("Sales by doctor", headline "Total sales").

### Edge Cases
- **Changing a filter without `Go`**: Type, GST, search and More filters are all drafts; `Print` and `Download` export the last applied filters, not what is currently selected on screen.
- **Hidden columns and export**: hiding columns never changes the download — stated only inside the `Show columns` menu.
- **"Sales Bills" showing purchases**: switching Type to "Purchase" keeps the page title "Sales Bills" and the search placeholder "Customer, bill no. or mobile" while the rows are supplier bills.
- **Naming**: the same person is "Customer" (search placeholder), "Patient / customer" (Daily Collection bill table) and "Patient" (Sales register page).

## STORY-108: Owner reviews item margins and the day-wise summary for October

**Type**: medium
**Topic**: Reports, users & clinic administration
**Persona**: Dr. Meenakshi Rao, owner-dermatologist, Sunday evening review on a laptop
**Goal**: See which products made or lost money in October, then check the daily sales pattern and any gaps in bill numbering
**Preconditions**: Signed in as OWNER; October sales posted; some stock has no recorded purchase cost
**Ideal path**: 5 — open margin report (1), choose "Last month" (1), sort by profit (1), switch to day-wise keeping the same month (1), download (1). Today the month has to be re-entered by hand in each report.
**Alternate paths**:
- Landing cards "Item Wise Margin Report" and "Day wise Summary"; menu › Margin Reports / GST Reports; search "margin", "profit", "daily", "bill range".
- Old Inventory links `/dashboard/inventory?area=purchases&view=margin` and `view=daywise` forward here ("This report is now under Pharmacy Report. Opening it…").
- Month-level profit without item detail: Accounting Reports › "GST Summary & Monthly P&L" → "Monthly Report" card ("Gross profit", "Margin").
- Top sellers without margin: Admin › Reports › "Inventory Report" → "Top Selling Items".
- Supplier-side cost analysis stays in Inventory › Purchases › `Purchase costs` ("Distributor Analytics").

### Steps
1. Click `Pharmacy Report` in the sidebar → Landing page.
2. Click the "Item Wise Margin Report" card → Page heading "Item Wise Margin Report", and directly beneath it a card titled "Item-wise Margin" with its own controls: "From" and "To" (native date pickers, defaulting to 1 November – today), "Type", "Tags", "Search in", "Search", `Go`, `More Filters`, `Download`. No Period preset list and no `Print` here.
3. Set "From" to 01-10-2026 → Draft only.
4. Set "To" to 31-10-2026 and click `Go` → URL gains `from`/`to`; tiles "Total Sale Amount", "Total Purchase", "Total Net GST", "Total Profit" update; an amber line reads "… lines without recorded cost … is in Total Sale Amount but not in Purchase, Net GST or Profit. Add the purchase price on the item to include future sales."
5. Click `More Filters` → A panel opens with "Category", "Manufacturer", "Item type", "Cost status" and `Clear filters`.
6. Choose Manufacturer "Galderma" and click `Go` → Rows narrow; button reads "More Filters (1)".
7. Click the column heading "Profit ₹ (%)" → Sorted by percentage, lowest first; a negative profit shows in red.
8. Click the item name "Cetaphil Gentle Skin Cleanser 125 ml" → Leaves the report for the Inventory item page (`/dashboard/inventory?area=stock&view=list&item=…&return=…`).
9. Click `Back to stock list` → Returns to the margin report with dates and filters intact (the button name says stock list, but the `return=` link sends her back to the report).
10. Click `Download` → "Excel (.xlsx)".
11. Click breadcrumb "← Pharmacy Report", then the "Day wise Summary" card → Heading "Day wise Summary" over a card titled "Day-wise Summary"; "From" is back to 1 November and "To" today — the October range was not carried over and is not written to the URL.
12. Set "From" 01-10-2026 and "To" 31-10-2026, click `Go` → One row per day with "Bill Date", "Bill No." (range), slab bands and "Total for the range" top right. A summary line reads e.g. "412 bills over 31 days; 4 days with no bills are shown as ₹0 rows; 2 bill numbers are missing from the sequence. Amounts in ₹."
13. Hover an amber gap chip in the "Bill No." column → A tooltip gives detail on the gap (tooltip content unverified; the column's (i) tip says a gap lists the missing numbers and the status of the bill if it exists, e.g. a draft never confirmed).
14. Change Type to "Purchase" → Reloads immediately without `Go` (dates need `Go`, Type does not).
15. Click `Download` → "CSV".

### Variations
- **Search by a specific field**: "Search in" chooses which field the Search box matches (options from `MARGIN_SEARCH_FIELD_LABELS`, labels unverified).
- **Returns only / sales only**: margin "Type" select (net, sales, returns).
- **Items with unknown cost only**: `More Filters` › "Cost status".

### Edge Cases
- **No sales in range**: "No items sold in this range" / with filters "No items match these filters … Change the range or filters and press Go."
- **Refresh on Day wise Summary**: dates and Type are component state, so a browser refresh returns to this month / Sales; the margin report keeps its state because it is in the URL.
- **Download vs screen source**: both reports draw the screen from `/pharmacy/compliance/…` but `Download` calls `/pharmacy/reports/{id}` — two code paths for the same figures.
- **Three spellings**: "Item Wise Margin Report" (menu, heading), "Item-wise Margin" (card), "Item Wise Margin" (export section); "Day wise Summary" vs "Day-wise Summary".
- **Stock column**: "Stock" is current stock now, not at period end (explained only in the column's (i) tip).

## STORY-109: Pharmacist prints the near-expiry list

**Type**: short
**Topic**: Reports, users & clinic administration
**Persona**: Imran Sheikh, pharmacist, quiet Tuesday afternoon before the distributor's rep visits
**Goal**: Print the batches expiring within a month so they can be pulled and returned
**Preconditions**: Signed in as PHARMACIST with report access; stock has batches expiring in December 2026
**Ideal path**: 3 — open Expiring Stock (1), pick "Within 1 month" (1), print (1).
**Alternate paths**:
- Pharmacy Report menu › Stock Reports › "Expiring Stock" (not on the "Common reports" cards).
- Inventory › Today queue "expiring in 3 months"; Inventory › Stock › `Stock list` expiry filter; Stock › `Stock optimization` (per discovery).
- Counts only: Dashboard "System Alerts", header bell, and Admin › Reports "System Alerts" strip "Expiry Alerts" (a 30-day window, at most 10 counted).
- Admin › Reports › "Inventory Report" (its expiry alerts are fetched but not rendered on the page).

### Steps
1. Click `Pharmacy Report` in the sidebar → Landing page.
2. Type `expiry` in "Search reports, e.g. GSTR" and click "Expiring Stock" under Stock Reports → Report opens with no Period control, an "Expiry" select on "Within 3 months", headline "Value at cost", and columns Item Name, Batch, Expiry, Supplier, Stock, Value at cost, Value at MRP, Action.
3. Change "Expiry" to "Within 1 month" → Draft only.
4. Click `Go` → Table reloads; URL gains `window=1m`.
5. Click `Print` → Print dialog with the PDF.

### Variations
- **Already expired**: "Already expired"; also "Within 2 months", "Within 6 months".
- **Send to the distributor**: `Download` → "Excel (.xlsx)" instead of printing.

### Edge Cases
- **Three definitions of "expiring"**: this report defaults to 3 months; the alert counts use 30 days; Inventory Today uses 3 months. The numbers will not agree.
- **Supplier vs Distributor**: this table's column is "Supplier", while the purchase reports' search box says "Distributor, bill no. or GSTIN".
- **Nothing expiring**: the section's own empty text is shown with "Choose another period and press Go." even though this report has no period.

## STORY-110: Admin assembles the October month-end picture across both report centres

**Type**: long
**Topic**: Reports, users & clinic administration
**Persona**: Kavitha Nair, clinic administrator (ADMIN), Friday 13 November, owner wants "October numbers" by evening
**Goal**: Collect October's clinic revenue, pharmacy sales, doctor-wise split, GST position, pharmacy profit and stock risk, and sanity-check them against one day's Daily Collection
**Preconditions**: Signed in as ADMIN; October has clinic bills with payments, pharmacy bills, purchases; today has some activity
**Ideal path**: 6 — one "month-end" view: pick October (1), read clinic + pharmacy + GST + profit on one page (0), drill into two figures (2), export once (1), spot-check one day (2). The code spreads this across two report pages with five different filter bars.
**Alternate paths**:
- Clinic revenue: only Admin › `Reports` (the header bell's `View reports & alerts` lands on the same page).
- Pharmacy sales total: Pharmacy Report › Sales Register / Sales Bills / Day wise Summary / Daily Sales Summary – Doctorwise; Sales page footer totals; GST Summary & Monthly P&L "Sales"; Pharmacy Desk `Sales` metric (today only).
- GST position: GSTR-3B or GST Summary & Monthly P&L.
- Profit: Item Wise Margin Report "Total Profit" or Monthly Report "Gross profit".
- One day's money: sidebar `Daily Collection` or Pharmacy Report › Daily Collection.

### Steps
1. Open `Dashboard` → Stat cards "Total Users", "Active Users", "Total Branches", "System Status"; "Admin Controls"; "System Alerts"; "Today's Appointments". No money figure anywhere on the dashboard.
2. Click `Reports` in the sidebar (Admin group) → Page "Reports & Analytics" (sidebar says "Reports"). An orange "System Alerts" strip shows Overdue Invoices / Low Stock / Expiry Alerts / Pending Payments / Upcoming Appointments — the same alerts as the dashboard card and the bell. Six cards; "Revenue Report" is preselected and already generated for the last 30 days.
3. Set the first date ("From date") to 01-10-2026 → The report regenerates immediately; no button press needed.
4. Set the second date ("To date") to 31-10-2026 → Regenerates again. Card subtitle: "Report for 1 Oct 2026 to 31 Oct 2026" (date format unverified).
5. Read "Total Revenue", "GST Amount", "Net Revenue", "Total Invoices", then "Payment Mode Breakdown" and "Top Performing Doctors" → She pauses: is pharmacy included? Nothing on screen says. (In code this report sums completed payments on clinic bills only; pharmacy sales are not in it.)
6. Click `Generate Report` to be sure → Button reads "Generating..." and the same figures return (the button repeats what the date change already did).
7. Open the `Export` dropdown and choose "Excel" → A file downloads. The dropdown now displays "Excel".
8. Click the "Payment Analytics" card → Loads "Total Payments", "Total Amount", "Successful", "Failed", a second "Payment Mode Breakdown" and "Reconciliation Summary" (Total Transactions / Reconciled / Pending / Rate). The mode split repeats the Revenue Report's.
9. Click the "Doctor Performance" card → "Total Doctors", "Active Doctors", "Departments", and a "Doctor Performance" list with completion rate per doctor.
10. Click the "Inventory Report" card → "Total Items", "Total Value", "Low Stock", "Out of Stock", "Top Selling Items", "Low Stock Alerts". This card is pharmacy stock, on a page whose revenue card is clinic-only.
11. Click `Pharmacy Report` in the sidebar → Landing page.
12. Click the "Sales Register" card → Opens already on "Last month (October 2026)"; reads the headline "Total for the period" and notes it down as pharmacy sales.
13. Click breadcrumb "← Pharmacy Report", then menu › Others › "Daily Sales Summary – Doctorwise" → Opens on "This month (November 2026)" — unlike the GST reports, this one does not default to last month.
14. Change Period to "Last month (October 2026)" and click `Go` → "Sales by doctor" with each doctor's share; headline "Total sales". This is pharmacy sales by prescriber; step 5's "Top Performing Doctors" was clinic revenue by doctor. Two doctor-wise money tables, different money.
15. Breadcrumb back, menu › Accounting Reports › "GST Summary & Monthly P&L" → Heading "GST Summary & Monthly P&L", then a second heading "Pharmacy Compliance" ("Posted GST and monthly reports for the current branch"), then cards "GST Summary" and "Monthly Report". No Period presets, no `Go`, no `Print`/`Download`; each card has `Refresh`.
16. In "GST Summary" set "Start date" to 01-10-2026 → Both cards blank to "Loading…" and reload at once (changing one date re-runs every loader on the page).
17. Set "End date" to 31-10-2026 → Reloads again. Reads "Input GST", "Output GST", "Net payable", the "Purchase Slabs" and "Sales Slabs" tables and "GST source records".
18. In "Monthly Report" set "Month" to October 2026 → Reloads. Reads "Procurement", "Sales", "Gross profit", "Stock at cost", "Write-off", "Stock at MRP", "Margin", and the caveat "Stock valuation is the current snapshot. Historical cost is unknown for n movements / adjustments…".
19. Click `Export all source rows` beside "Monthly source records" → A CSV downloads (the only export on this page).
20. Breadcrumb back, click the "Item Wise Margin Report" card → Defaults to 1 November – today.
21. Set "From" 01-10-2026, "To" 31-10-2026, click `Go` → Reads "Total Profit" and compares with step 18's "Gross profit"; they are computed differently (item-level sale minus cost vs monthly P&L with write-offs), and nothing on either screen links the two.
22. Breadcrumb back, menu › Stock Reports › "Expiring Stock" → "Within 3 months" list with "Value at cost"; compares with the "Expiry Alerts" count from step 2 (a 30-day window capped at 10) and "Low Stock" (which there means out of stock with a minimum set).
23. Click `Daily Collection` in the sidebar → Today's collection. "Whole day" tiles: Whole day / Clinic / Pharmacy; "Clinic: consultations and procedures" tiles; "Pharmacy" section.
24. Type `31/10/2026` in the "Day" box → Loads 31 October (stepping back with `Previous day` would take 13 clicks). `Today` button appears.
25. Compare "Clinic received" with what the Revenue Report would show for that single day, and "Pharmacy billed today" with Sales Register for that day → Same money, three screens, three labels ("Total Revenue", "Clinic received", "Total for the period").
26. Click `Download` → "PDF" → Day sheet saved for the owner.

### Variations
- **Manager (MANAGER)**: same route; sees Reports and Pharmacy Report, and with the audit grant can record a pharmacy count.
- **Owner**: has no Pharmacy Desk in the sidebar, so the desk `Sales` metric is not available as a cross-check.
- **Doctor**: the server admits DOCTOR to `/reports/*`, but the sidebar has no Reports entry; the bell's `View reports & alerts` is the only way in.
- **Appointment and patient numbers**: "Appointment Analytics" (Completed / Cancelled / No Show, "Peak Hours", "Room Utilization") and "Patient Analytics" (New / Returning, "Gender Distribution", "Most Frequent Patients") on the same page.

### Edge Cases
- **Export of the same format twice**: the `Export` control is a select that fires on change, so choosing "Excel" again right after an Excel export does nothing (as read from the code).
- **Report or export fails**: errors are only written to the console; the page shows "No data available for the selected period" or simply no download.
- **Alert counts stop at 10**: the alerts endpoint returns at most ten items of each kind and the strip shows the list length.
- **"JSON" export** is offered to office staff alongside CSV / PDF / Excel.
- **Date pickers**: this journey used four kinds — native date inputs (Reports, Margin, GST Summary), a month picker (Monthly Report), Period presets with dd/mm/yyyy text boxes (Sales Register, Doctorwise), and the day stepper (Daily Collection).

## STORY-111: Admin onboards a new pharmacist and later issues him a reset code

**Type**: long
**Topic**: Reports, users & clinic administration
**Persona**: Kavitha Nair, clinic administrator (ADMIN); new hire Farhan Qureshi joins Monday
**Goal**: Create Farhan's account as Pharmacist, make sure he can open Pharmacy Report and record the daily count, and two days later get him back in after he forgets his password
**Preconditions**: Kavitha is signed in as ADMIN (user writes are OWNER / ADMIN on the server, plus DOCTOR which passes every role gate but has no Users entry; a MANAGER sees the same buttons but the server refuses); Farhan's phone 90001 23456 and e-mail are not already in use
**Ideal path**: 9 — open Users (1), `New User` (1), six fields (6), `Create` (1), with the role's default grants applied automatically; reset = 2 more (open, create code).
**Alternate paths**:
- Change a role: "Edit User" dialog › Role select, or "Role & Permissions" dialog › Role select + `Apply Role` (two places, different option order).
- Reset a password: only Users › `Reset password` (no e-mail self-service; the API `POST /users/:id/change-password` has no UI).
- Reach a user: header search "Staff" results link to `/dashboard/users?search=<id>`, which the Users page ignores (per discovery) — the list is unfiltered.

### Steps
1. Click `Users` in the sidebar (Admin group) → Page header "Users Management", then a second heading "Users" ("Manage users, roles, and statuses"), buttons `Clinic Holidays` and `New User`, and a card "All Users" with columns Name, Email, Role, Status, Actions. No search box or filter; up to 100 users are listed.
2. Click `New User` → Dialog "Create User".
3. Type `Farhan` in "First Name".
4. Type `Qureshi` in "Last Name".
5. Type `farhan.q@linaeclinic.in` in "Email".
6. Type `9000123456` in "Phone".
7. Open "Role" (defaults to "Receptionist") and choose "Pharmacist" → Options are Admin, Doctor, Nurse, Receptionist, Manager, Pharmacist; there is no Owner, Accountant or Lab tech.
8. Leave "Status" on "Active" (other options: Inactive, Suspended, Pending).
9. Type `Linae1` in "Password (8-20 chars)" and click `Create` → A browser `alert()`: "Password must be 8-20 characters". Click OK; the dialog is still open with the fields kept.
10. Retype the password as `Linae@2026` and click `Create` → Dialog closes, the form resets and the table reloads. No success message; she scans the table for "Farhan Qureshi … PHARMACIST … ACTIVE" (role and status are shown as raw codes).
11. In Farhan's row click `Role & Permissions` → Dialog "Role & Permissions": left, a "Role" select showing "Pharmacist" with `Apply Role` and `Clear All`, and "Permissions — Selected: n"; right, permission checkboxes grouped by resource (e.g. "pharmacy", "inventory", "billing"), each group with `Select all` / `Clear`. The ticks shown are the Pharmacist role's defaults, not what is saved on Farhan's own record.
12. Scroll to the "pharmacy" group, look for `pharmacy:compliance:read` (needed to open Pharmacy Report) and tick `pharmacy:compliance:audit` so he can save the daily count (names as used by the report controller; their presence in the list is unverified) → "Selected" count goes up. Permission names are raw `resource:action` strings, truncated with a tooltip.
13. Click `Save Permissions` → Browser `alert()`: "Permissions updated successfully!". Click OK.
14. Close the dialog (X or Esc) → Back on the table. She did not need `Apply Role` (the role was set at creation) but hesitated over it because it sits above the permissions.
15. Tell Farhan his sign-in (phone or e-mail + the password) in person.
16. Wednesday: Farhan is locked out. Kavitha opens `Users` again and finds his row by eye.
17. Click `Reset password` in his row → Dialog "Reset password for Farhan Qureshi": "Only issue a code to Farhan Qureshi after confirming in person that they are asking. Anyone with the code can set this account's password." and "Issuing a code cancels any earlier code for them. It is recorded in the audit log."
18. Click `I have confirmed who is asking. Create code` → Button reads "Creating code…", then an 8-character code in large type with "Give this code to Farhan Qureshi in person. It works once and expires …" and "This code is shown only once. Closing this window does not cancel it; issuing another code does."
19. Click `Copy code` → Code is on the clipboard (no "Copied" feedback), and she reads it out to him.
20. Close the dialog.
21. Farhan, on the sign-in page, clicks "enter your reset code" → `/reset-password`, "Set a new password".
22. He types the code in "Reset code", a new password in "New password" and again in "Confirm new password", and clicks `Set new password` → Success message, then automatic return to `/login` (per discovery); he signs in.

### Variations
- **New doctor**: Role "Doctor" adds two row buttons, `Working Hours` (dialog "Availability: Dr. …") and `WhatsApp Settings`. `Clinic Holidays` (top of the page) opens a dialog listing upcoming holidays with a From / To / All day / "Reason (optional)" form and an `Add clinic holiday` button.
- **Promote later**: `Edit` → Role "Manager" → `Save`; or `Role & Permissions` → Role "Manager" → `Apply Role` → `alert("Role updated to MANAGER successfully!")`, which also swaps the ticks to the Manager defaults (still to be saved with `Save Permissions`).
- **Accountant**: cannot be created here — "Accountant" is not in either role list although the role exists and has sidebar entries.

### Edge Cases
- **Blank phone**: `alert("Phone number is required")`.
- **Duplicate e-mail / phone or other server refusal on create**: the request fails with no message in the dialog (the submit handler has no error branch); the dialog just stays open.
- **Manager clicks any of these buttons**: the server returns 403; create/edit/delete show nothing, role and permission saves show "Failed to update role. Please try again." / "Failed to update permissions. Please try again.", and Reset password shows the error text in its dialog.
- **Resetting a peer or senior**: "You cannot reset the password of a user at or above your role."
- **Password rules differ**: 8–20 characters here, 8–72 on the reset page.
- **Guide vs screen**: the page's Quick Guide says "Click 'Add User'", lists roles "Therapist" and "Owner", says "Edit user information by clicking on a user row" and "View user activity" — none of which match the screen.
- **Empty list text**: "No users found — Try a different search or add a user using the form above." (there is no search and no form above).

## STORY-112: Admin deactivates a receptionist who has left

**Type**: short
**Topic**: Reports, users & clinic administration
**Persona**: Kavitha Nair, clinic administrator (ADMIN), last working day of receptionist Anjali Verma
**Goal**: Stop Anjali's account from being used while keeping her name on past records
**Preconditions**: Signed in as ADMIN; Anjali Verma exists with Status ACTIVE
**Ideal path**: 2 — a status switch on the row (1) and a confirmation (1).
**Alternate paths**:
- `Delete` on the row → browser `confirm("Delete user?")` → permanent removal (refused by the server for a user with appointments or visits as the doctor).
- `Role & Permissions` → `Clear All` → `Save Permissions` (removes extra grants but leaves the account active).
- The API has `PATCH /users/:id/status`; the screen does not use it (status goes through Edit).

### Steps
1. Click `Users` in the sidebar and find "Anjali Verma" by scanning the table → No search to narrow the list.
2. Click `Edit` in her row → Dialog "Edit User" with her details; there is no password field in edit mode.
3. Open "Status" and choose "Inactive" → She hesitates between "Inactive" and "Suspended"; nothing explains the difference.
4. Click `Save` → Dialog closes, table reloads, her Status cell reads "INACTIVE". No confirmation message.

### Variations
- **Temporary block**: Status "Suspended" by the same route.
- **Remove a mistaken account**: `Delete` → OK in the confirm → row disappears.

### Edge Cases
- **Deleting a doctor with history**: server answers "Cannot delete user with existing appointments or visits"; the page shows nothing and the row stays (the delete handler has no error message).
- **Cancel**: `Cancel` closes the dialog, but the form keeps the edited values until another row's `Edit` or a successful save resets it — clicking `New User` straight after shows "Edit User" with Anjali's details still loaded (as read from the code: the form is only reset after a successful submit).
- **Raw codes**: Role and Status columns show `RECEPTION`, `INACTIVE` while the dialogs say "Receptionist", "Inactive".

## STORY-113: Admin sets up a doctor's WhatsApp confirmations and a message template

**Type**: long
**Topic**: Reports, users & clinic administration
**Persona**: Kavitha Nair, clinic administrator (ADMIN), setting up automatic appointment confirmations for Dr. Meenakshi Rao before Monday's OPD
**Goal**: Turn on WhatsApp confirmation for the doctor's appointments, create a clinic-wide confirmation template, test it on her own phone, and point the doctor's settings at it
**Preconditions**: Signed in as ADMIN; Dr. Meenakshi Rao exists with role DOCTOR; WhatsApp Cloud API credentials and `OPENAI_API_KEY` are configured on the server; Kavitha's phone is +91 98480 12345
**Ideal path**: 8 — open a WhatsApp settings page (1), switch confirmations on (1), `New template` (1), generate draft (1), save (1), send test (2: number + send), choose the template from a list for the doctor (1).
**Alternate paths**:
- The doctor herself: header cog › "My Settings" → the same two switches ("Send WhatsApp on appointment creation", "Use WhatsApp Template") plus an "Approved Templates" dropdown of saved appointment-confirmation templates; it has no phone-number-ID / token fields and no link to the template editor.
- Template editor: reachable only through Users › a doctor row › `WhatsApp Settings` › "Templates" `Manage`. No other entry found (doctors may manage templates on the server, but have no Users page).

### Steps
1. Click `Users` in the sidebar and find the row "Meenakshi Rao … DOCTOR" → Doctor rows have two extra buttons: `Working Hours` and `WhatsApp Settings`.
2. Click `WhatsApp Settings` → Dialog "Doctor WhatsApp Settings" with four boxed sections.
3. Switch on "Send WhatsApp on appointment creation" ("Automatic confirmation to patients when this doctor is assigned.") → Note beneath: "Requires backend WhatsApp credentials. Uses text messages by default."
4. Leave "Doctor WhatsApp Phone Number ID" and "Doctor WhatsApp Access Token" blank (both "Optional"; the token box is never prefilled — "Leave blank to keep existing").
5. Switch on "Use WhatsApp Template" ("Recommended for messages outside the 24h window.") → Two free-text boxes appear: "Template Name" (placeholder "e.g., appointment_confirm") and "Language Code" (placeholder "e.g., en, en_US, hi"). No list of saved templates to choose from in this dialog.
6. Realising there is no template yet, click `Manage` in the "Templates" box → A second dialog, "WhatsApp Template Editor", opens over the first: left "Existing Templates" ("No templates yet.") with `New`; right the form.
7. Type `appointment_confirm` in "Name" (placeholder "e.g., Appointment Confirmation").
8. Leave "Touchpoint" on "Appointment Confirmation" (others: Appointment Reminder, Invoice Share, Prescription Share) and "Language" on `en`.
9. Change "Ownership" from "My Template" to "Branch Template (Admin)" so every doctor can use it; leave "Active" on.
10. Type `Linaé Skin, Hair & Aesthetic Clinic, Hyderabad. Sign off as Team Linaé.` in "Generator Hints (optional)" and click `Generate` → Button shows "Generating…", then a toast "Template generated — Review and save if it looks good."; the "Designer (WYSIWYG)" box and "Plain Text (fallback)" fill with a draft containing `{{patient_name}}`, `{{appointment_date}}` and so on.
11. Click into the designer after the time and click the variable chip `{{queue_token}}` → The token is inserted at the cursor; plain text updates to match. (`B` / `I` / `U` buttons format the selection.)
12. Click `Save Template` → Browser `alert()`: "Template saved". Click OK → The template appears on the left as "appointment_confirm — appointment_confirmation • en • Branch".
13. Look at "Send Test" → The `Send Test` button is disabled: the form is still an unsaved "new" form. Click `Edit` on the new row in "Existing Templates" → The form reloads from the saved template and `Send Test` becomes enabled.
14. Type `+919848012345` in "Test Phone (E.164)" (placeholder "+15551234567") and click `Send Test` → Green text "Test sent (check your WhatsApp)". The side note warns "Variables will be sent blank unless you extend UI mapping; backend will still accept." — the test message arrives with empty placeholders.
15. Click `Close` in the editor → Back in "Doctor WhatsApp Settings", which was open underneath.
16. Type `appointment_confirm` in "Template Name" and leave "Language Code" as `en` → She has to retype the name exactly; nothing checks that it matches the template she just saved.
17. Click `Save` → Dialog closes, list reloads, toast "Saved — WhatsApp settings updated".

### Variations
- **Doctor does it herself**: cog › "My Settings" → switches → pick from "Approved Templates" ("Selecting from saved templates avoids name and language mismatches.") → `Save`. If none are active: "No active appointment templates were found. You can still enter the template name and language manually."
- **Per-doctor sender number**: fill "Doctor WhatsApp Phone Number ID" (e.g. `104857392018374`) and paste a token; only an admin can do this, only from Users.
- **Personal template**: Ownership "My Template" — listed as "• Mine".
- **Edit or remove later**: `Edit` / `Delete` on a row in "Existing Templates" (`confirm("Delete this template?")`).

### Edge Cases
- **Template mode on, name blank**: toast "WhatsApp settings incomplete — Choose a WhatsApp template or turn template mode off."
- **Bad language code**: "Use a valid WhatsApp language code, such as en, en_US, or hi."
- **Save with no name or text**: `alert("Name and Plain Text are required")`.
- **Placeholder not in the variable list**: `alert("Add these variables or remove placeholders: …")`.
- **Test before saving**: `alert("Save the template before sending a test")`; no number: `alert("Enter a phone number in E.164 format (e.g., +15551234567)")`. A failed send shows the server message in red.
- **`New` changes Ownership silently**: opening the editor defaults Ownership to "My Template", but clicking `New` resets it to "Branch Template (Admin)" (as read from the code).
- **Switches that do not stick**: "Active" is not sent when a template is first created (only on update), and "Ownership" is not sent on update, so neither can be changed at those points (as read from the code).
- **`Add` variable button**: the button reads the focused element, which after the click is usually the button itself, so it adds nothing; pressing Enter in the "Add variable (letters/numbers/underscore)" box is the route that works (as read from the code).
- **Generation unavailable**: toast "Generation failed" with the server message.
- **Two names for one thing**: "Template Name" here expects the approved WhatsApp template's technical name; the editor's "Name" suggests a human title ("Appointment Confirmation").

## STORY-114: Admin takes a database backup before the stock take

**Type**: short
**Topic**: Reports, users & clinic administration
**Persona**: Kavitha Nair, clinic administrator (ADMIN), Saturday evening before a full stock count
**Goal**: Make a full backup of the clinic database and know that it succeeded
**Preconditions**: Signed in as ADMIN or OWNER (the card is hidden for everyone else, and the server refuses DOCTOR too)
**Ideal path**: 2 — click `Create Backup` (1), read an on-page result with time and size (1).
**Alternate paths**: none found (no backup list, no download, no schedule in the UI; `GET /auth/backup/:jobId` exists on the server with no screen).

### Steps
1. Click `Dashboard` in the sidebar and scroll to the "Admin Controls" card ("Administrative tools and system management") → Row "Database Backup — Create a complete backup of the database" with `Create Backup`, and the warning "⚠️ Backups are stored locally on the server and contain sensitive data."
2. Click `Create Backup` → Button shows a spinner and "Creating...". The server queues a background job and answers straight away with a job id.
3. Read the browser `alert()` → The page expects a `backup` object with timestamp, directory and size ("✅ Database backup created successfully! … Backup saved to local server directory."), but the server reply contains only `success` and `jobId`; as read from the code, the alert that appears is "❌ Backup Failed" followed by a script error, even though the job was queued. Click OK.
4. Look for confirmation → Nothing on the page shows whether a dump was written, where, or when the last one was taken.

### Variations
- **Owner**: identical.
- **Guide**: the Dashboard `Quick Guide` has an "Admin Controls" section: "Create database backups from the admin controls section", "Backups are stored locally on the server", "Regular backups are recommended for data safety".

### Edge Cases
- **Not admin / owner**: the card is not rendered; a direct call returns "Insufficient permissions. Admin access required."
- **Dump fails later** (e.g. database container not reachable): the job file is marked FAILED on the server; the UI never learns of it.
- **Repeat clicks**: the button is disabled while the request is in flight, but each later click queues another full dump.

## Redundancy notes

**Duplicate paths**
- Two report centres with overlapping subjects: Admin › `Reports` → "Reports & Analytics" (`frontend/src/app/dashboard/reports/page.tsx`, `backend/src/modules/reports/reports.controller.ts`) and Pharmacy › `Pharmacy Report` (`frontend/src/components/pharmacy/reports/PharmacyReportWorkspace.tsx`, `backend/src/modules/pharmacy/pharmacy-reports.controller.ts`). "Revenue Report" is clinic-bill payments only (`backend/src/modules/reports/reports.service.ts` `generateRevenueReport`, `newPayment`), yet its neighbour "Inventory Report" is pharmacy stock; the screen never says which money is in scope.
- "Daily Collection" is a sidebar item, a "Common reports" card, a menu entry and a search hit, all to the same URL (`frontend/src/components/layout/sidebar.tsx`, `frontend/src/components/pharmacy/reports/report-catalog.ts`).
- "Sales Bills" and "Purchase Bills" are one report with a Type toggle exposed under two menu entries (`report-catalog.ts` `SALES_PURCHASE`; `backend/src/modules/pharmacy/pharmacy-reports.service.ts` `case 'sales-bills': case 'purchase-bills':`). Switching Type leaves the wrong title and search placeholder on screen.
- HSN summary twice: "HSN wise GST" and GSTR-1 "HSN summary (Table 12)" (`backend/src/modules/pharmacy/pharmacy-gst-reports.ts`).
- Supplier bills four ways: Purchase Register, Purchase Bills, GSTR-2A, GSTR-2B.
- GST position twice: GSTR-3B ("Payable in cash") and "GST Summary & Monthly P&L" ("Net payable") (`frontend/src/components/pharmacy/ComplianceCenter.tsx`).
- Pharmacy profit twice: Item Wise Margin Report "Total Profit" (`ItemMarginReport.tsx`) and Monthly Report "Gross profit" / "Margin" (`ComplianceCenter.tsx`).
- Doctor-wise money twice: "Daily Sales Summary – Doctorwise" (pharmacy) and Reports & Analytics "Top Performing Doctors" / "Doctor Performance" (clinic).
- A user's role can be changed in "Edit User" and in "Role & Permissions" › `Apply Role` (`frontend/src/components/users/UsersManagement.tsx`); the two role lists are ordered differently and both omit Owner / Accountant.
- Doctor WhatsApp settings live in Users › `WhatsApp Settings` (free-text template name, phone-number ID, token) and in header "My Settings" (dropdown of saved templates) (`UsersManagement.tsx`, `frontend/src/components/layout/header.tsx`, `frontend/src/lib/whatsapp-settings.ts`). The clinic-wide Template Editor is nested inside one doctor's settings dialog.
- `Generate Report` on Reports & Analytics repeats what selecting a card or changing a date already does (`reports/page.tsx` `useEffect` → `generateReport`).

**Duplicate information**
- Today's / a day's money: Daily Collection ("Whole day", "Clinic received", "Pharmacy billed today", "Pharmacy expected in hand" — `DailyCollectionReport.tsx`, `backend/src/modules/pharmacy/pharmacy-daily-collection.ts`), Pharmacy Desk `Sales` metric (`frontend/src/app/dashboard/pharmacy/pharmacy-workspace.tsx`), Sales Register "Total for the period", Day wise Summary row and "Total for the range", Doctorwise "Total sales", Reports & Analytics "Total Revenue" and Payment Analytics "Total Amount"; plus Sales page footer totals and invoice-list tiles (per discovery).
- Payment-mode split: Daily Collection reconciliation table, Revenue Report "Payment Mode Breakdown", Payment Analytics "Payment Mode Breakdown".
- "System Alerts": Dashboard card, Reports & Analytics strip, header bell — one endpoint (`/reports/alerts`) that returns at most 10 of each kind, so the counts cap at 10. "Low Stock" there means stock ≤ 0 with a minimum set, while Inventory Report "Low Stock" is stock ≤ minimum; "Expiry Alerts" is 30 days while Pharmacy Report "Expiring Stock" defaults to 3 months.
- Headings repeat: "Users Management" → "Users" → "All Users"; "Item Wise Margin Report" → "Item-wise Margin"; "Day wise Summary" → "Day-wise Summary"; "GST Summary & Monthly P&L" → "Pharmacy Compliance" → "GST Summary" / "Monthly Report".

**Naming drift**
- "Reports" (sidebar) / "Reports & Analytics" (page) / "Pharmacy Report" (singular) / "Pharmacy Compliance" (inside one report).
- Item Wise / Item-wise; Day wise / Day-wise / Daily ("Daily Sales Summary – Doctorwise" covers a range, not a day).
- Supplier / Distributor ("Distributor, bill no. or GSTIN" vs "Supplier" column vs "Supplier-wise ITC"); Customer / Patient / "Patient / customer"; Bill / Invoice ("Total Invoices", "Invoice value", "Bill No.").
- `Download` (Pharmacy Report) vs `Export` (Reports & Analytics) vs `Export all source rows` (GST Summary); `More filters` (toolbar) vs `More Filters` (margin).
- `New User` button → "Create User" dialog → `Create`; Quick Guide says 'Add User'. Roles shown as "Receptionist" in dialogs and `RECEPTION` in the table.
- "Template Name" (WhatsApp settings: technical name) vs "Name" (template editor: human title); "My Template" / "• Mine", "Branch Template (Admin)" / "• Branch".

**Inconsistent controls for the same job (friction)**
- Five filter-bar designs across the reports: `ReportToolbar.tsx` (Period presets, dd/mm/yyyy text dates, draft + `Go`, `Print`, `Download`); `ItemMarginReport.tsx` (native dates, `Go`, no Print); `DayWiseSummaryReport.tsx` (native dates, `Go` for dates but instant for Type, state not in the URL, no Print); `ComplianceCenter.tsx` (instant reload of every card on any change, `Refresh`, CSV of source rows only); `reports/page.tsx` (instant reload plus a redundant button, select-style Export including JSON). Default periods also differ: last month (GST reports), this month (Doctorwise, Margin, Day wise), last 30 days (Reports & Analytics), today (Daily Collection).
- The report menu is hidden while a report is open below the `2xl` breakpoint (`PharmacyReportWorkspace.tsx`), so moving between reports costs a breadcrumb click each time, and reports that are not "Common" cards are reachable only from the landing menu.
- Users screen mixes browser `alert()` / `confirm()` (create validation, role, permissions, template save, delete) with toasts (WhatsApp settings, template generation); create, edit and delete failures show nothing.
- Database backup: the dashboard expects `result.backup.{timestamp,directory,size}` (`frontend/src/app/dashboard/page.tsx` `handleBackup`) while `POST /auth/backup` returns `{ success, jobId }` (`backend/src/modules/auth/auth.controller.ts`); no screen reads the job status.
