# CR-33: Pharmacy Report

Pharmacy staff, doctors, the owner and the accountant now have a **Pharmacy Report** item in the Pharmacy group of the menu. It holds every pharmacy report in one place, as the pharmacy CRs section 4 asks. The clinical **Reports** item under Admin is unchanged (decided 05/11/2026).

## What the clinic sees

- **Landing page.** Categories down the left: GST Reports, Margin Reports, Stock Reports, Accounting Reports, Others. A search box over them. Six common reports one click away: Sales Register, Day wise Summary, GSTR-1, GSTR-3B, Item Wise Margin Report and Daily Collection. A short warning at the top says the figures are only as good as the stock data (section 4's warning).
- **Search.** Matches the start of any word in a report's title or keywords, ignoring case and hyphens. "GSTR" finds GSTR-1, 3B, 2A and 2B and nothing else. "cash" finds Daily Collection.
- **Opening a report.** The list gives way to the report and a breadcrumb back, so wide tables get the full width. On screens 1536 px and wider the list stays beside the report.
- **Every report** has a period (this month, last month, the last 12 months by name, this or last quarter, this or last financial year, or chosen dates), Go, Print and Download (Excel, CSV or PDF). GST returns open on last month, since that is what gets filed.
- **The filters live in the address bar.** A report can be bookmarked or sent to the accountant as a link, and Back works.
- **Tables follow CR-13 and the reference.** Text is 16 px with generous rows. Rupees have two decimals and Indian grouping (1,59,656.74), right-aligned. Totals sit directly under the header, and the header stays visible while scrolling. Every column sorts from its heading. Bill identity columns stay frozen while the money scrolls; on a narrow screen only the bill number stays frozen. Returns show as negative amber rows. An (i) explains each figure that can be read more than one way.

## The reports

| Category | Report | Notes |
| --- | --- | --- |
| GST | Purchase Register | One row per supplier bill. "Other" shows TCS, rounding and bill-level adjustments, so Bill Amount matches the supplier's bill. |
| GST | Purchase Bills (CR-33a) | Frozen Sr No, Bill No, Entry Date, Bill Date, Distributor. Then CESS, 0/5/12/18/28/40% and Total bands, each with Base, SGST, CGST and IGST. Bands follow the rates in use, and the standard ones always show. Type and With/Without GST filters. |
| GST | Sales Register (CR-33b) | Flat columns: Bill No, Bill Date, Customer, Mobile, Gross, Disc., Taxable, CESS, SGST, CGST, IGST, Total. Search by customer, bill no. or mobile filters the rows and recalculates the totals. Type: Sales, Returns, or Sales net of returns. |
| GST | Sales Bills | The sales side of Purchase Bills, on the same slab layout. |
| GST | Day wise Summary (CR-33c) | The existing report, moved here. Days with no bills show as ₹0 rows (Q31). |
| GST | GSTR-1 | B2C small rate-wise (Table 7) at the clinic's place of supply, net of returns. HSN summary (Table 12). Documents issued (Table 13), with cancelled bills counted. Bills carry no buyer GSTIN, so B2B is empty, and the report says so. |
| GST | GSTR-3B | 3.1(a), 3.1(c), 4(A)(5) and 4(C), plus 4(D) for supplier bills without a valid GSTIN. 6.1 sets credit off by s.49(5), s.49A and rule 88A, keeping cash as low as the law allows (proved, see below). |
| GST | GSTR-2A / GSTR-2B | The portal builds these from supplier filings. Here they come from the clinic's books in the same layout, for line-by-line matching: 2A is invoice and rate-wise with credit notes, 2B is supplier-wise ITC that flags a missing or invalid GSTIN. |
| GST | HSN wise GST | Per HSN and rate, for sales or purchases. Items without an HSN code are listed last and flagged. |
| GST | Composition GST Report | Monthly turnover at the chosen CMP-08 rate. Labelled as applying only to a composition registration. |
| Margin | Item Wise Margin Report (CR-33d) | The existing report, moved here. |
| Stock | Expiring Stock | Batches expired or expiring within 1–6 months, valued at cost and MRP. |
| Accounting | Daily Collection (section A, CR-17) | See below. |
| Accounting | GST Summary & Monthly P&L | The existing GST summary and monthly report, moved from Inventory. |
| Others | Daily Sales Summary – Doctorwise | Sales by prescribing doctor with each doctor's share. Picked from the "worth considering" list because the clinic has more than one doctor. |

Day-wise Summary, Item-wise Margin and GST & monthly reports no longer appear under Inventory > Purchases. Their old links open the same report here, so it is built once (CR-24's open question).

## Daily Collection

For one clinic day (Asia/Kolkata), stepped a day at a time and never past today:

- **Reconciliation by payment mode** (Cash, UPI and Card always, plus any other mode used): On today's bills · Earlier bills (balances settled today) · Counter sales · Refunds · **Expected** · **Counted** · **Difference**.
- **Bills raised today**: billed, collected against them by day end, still due, counter sales on credit, and any amount paid above a bill. Billed = collected − paid above + still due, which is proved below.
- **Every document** for the day: bills, older bills paid today, counter sales and returns, each with what was received and how.
- **Counting (Q29).** Staff type what is in the drawer and what the UPI and card settlements show. The difference is worked out as they type. A banner says Balanced, Short by ₹X or Over by ₹X, with what to check. Counts are append-only: a recount takes the next sequence and the full history stays visible. If two people save at once, the second is told, sees the other count and keeps their own figures to re-save.
- **Rules.** Store-credit refunds and credit counter sales move no money. Payments taken on bills that are not final are counted where the money came in, and a note flags them.
- **On a phone**, each mode is a card with a large input.

## Access

| Who | Can |
| --- | --- |
| Owner, admin, manager, doctor, pharmacist | Read every report, and record counts. |
| Accountant | Read every report. Pharmacy Report is their menu entry. |
| Reception | No access (Q30 is open). |

The server enforces `pharmacy:compliance:read` for reading and `pharmacy:compliance:audit` for counts. Day-wise, Item-margin, GST summary and monthly endpoints now also admit MANAGER and DOCTOR, so the whole menu has one role set.

## Sales Register filters and Purchase Bills columns

The reference screenshots show a second dropdown and "More Filters (n)" on the Sales Register, and "Show Columns" on Purchase Bills, without saying what they hold. These are the decisions.

- **Second dropdown.** GST: All bills, With GST, Without GST. A bill is "with GST" when any line carries CGST, SGST, IGST or CESS. Purchase Bills and Sales Bills use the same dropdown.
- **More filters.** Source (All sources, Prescription bills, Counter sales), Doctor (All doctors, then the doctors who appear in the period) and Discount (All bills, Discounted only). The button shows how many of these are set. GST is a top-level dropdown, so it is not counted. The count follows the panel as it is being edited, as in Item Wise Margin, and the filters apply on Go. "Clear" in the panel resets the three.
- **Rows and totals.** Rows shown are the rows that match every filter. The totals row, the headline and every download cover exactly those rows. The customer search works the same way.
- **Returns under Source.** A customer return is neither a prescription bill nor a counter sale, so picking either Source hides returns. Under Type "Returns" or "Sales net of returns" with Source "All sources", returns show as before. A doctor filter keeps a return billed under that doctor.
- **Doctor list.** The names are the doctors on the period's documents of the chosen Type, before the other filters, spelled as first seen, sorted. A doctor in the address bar who is not in the period stays in the list so the screen never shows a filter it cannot name.
- **Print and Download.** They carry the applied filters. The PDF lists them in its notes ("Showing only: bills with GST, counter sales."). The Excel and CSV files hold no notes today, so a filtered file shows the filtered rows and totals but does not name the filter.

## Server changes

- `GET /pharmacy/reports/:reportId?from&to&type&gst&source&doctor&discount&q&rate&window[&format=xlsx|csv|pdf]`. One report shape (sections, columns, rows, totals, tiles, notes) drives the screen and all three downloads, so a file always carries the figures on screen.
  - **Excel**: one sheet per section, merged GST band headings, Indian-grouped money format.
  - **CSV**: UTF-8 with BOM, formula-injection safe.
  - **PDF**: landscape. Wide tables are split into column pages that repeat the frozen bill columns and never split a GST band.
- `POST /pharmacy/reports/daily-collection/:day/counts` with `basedOnSequence`. Returns 409 if another count was saved first.
- New table `pharmacy_cash_counts`, unique on (branchId, day, sequence). The migration `20261109150000_pharmacy_cash_counts` is guarded and safe to run twice.
- Scope: posted documents only. That means pharmacy bills CONFIRMED, DISPENSED or COMPLETED, counter sales and returns POSTED or RELEASED, and supplier bills STOCK_COMMITTED. Days are Asia/Kolkata. Every query is scoped to the user's branch.

## Verification, 09/11/2026

- **Formal** (`verification/cr33-pharmacy-report`):
  - **GSTR-3B set-off (z3).** Proved balanced, legal and cash-optimal against every legal allocation, with conformance to the shipped code and two negative controls. The proof caught a real bug during development: a greedy set-off paid avoidable cash.
  - **Cash-count protocol (TLA+).** Model-checked with no lost update, a contiguous history and nothing erased. The three broken variants are each caught.
- **Real stack**: `scripts/stack/scenarios/cr33-reports.cjs` runs 14 browser scenarios against NestJS, Next.js and PostgreSQL with a seeded month. It checks the screen totals against an independently computed ledger and the Excel, CSV and PDF files against the screen. It covers the frozen columns while scrolling, a concurrent recount, the roles, the old Inventory links, 390 px phones and console errors. All 14 pass.
- **Backend**: new suites cover the builders and the clinic's worked figures. The CR-33a reference totals are reproduced exactly: 5% Base ₹27,317.10 / SGST ₹533.64 / IGST ₹298.58; grand Base ₹1,86,973.84. They also cover the exports and a PostgreSQL spec for the IST day boundary, branch isolation, the migration run twice and the recount race. 70 suites and 1,134 tests pass in pharmacy, inventory and reports.
- **Frontend**: 125 suites and 1,287 tests pass, plus the new catalog, model and workspace tests.

## Open questions for the clinic

- **Q25.** Which extra reports are wanted? Doctor-wise sales and Expiring Stock were added. Inventory Ageing and Item Wise Stock Movement wait on 3.5 and 3.1.
- **Q27.** Which returns does the accountant need? All four are built. 2A and 2B are the clinic's side for matching, and cannot replace the portal's download.
- **Q28.** Daily Collection covers the pharmacy only, as the Pharmacy Report decision implies. Adding consultation and procedure fees is a separate decision.
- **Q30.** Should reception see Daily Collection? Currently no.
- **Q32.** Should the margin report group by category or manufacturer, or list non-selling items? Unchanged.
- The figures are only as accurate as the stock clean-up (3.2, 3.3); the landing page says so.
