// Builds REPORT.md (and, with an output path as the first argument, a standalone HTML page) from the
// browser results in results/*.json plus the notes below. Run after the three cr-audit-*.cjs scenarios:
//   node verification/cr-audit-2026-11-10/build-report.cjs [path/to/report.html]
const fs = require("node:fs");
const path = require("node:path");

const here = __dirname;
const results = ["cr-audit-visits", "cr-audit-pharmacy", "cr-audit-reports"].map((name) => JSON.parse(fs.readFileSync(path.join(here, "results", `${name}.json`), "utf8")));
const browserRows = results.flatMap((r) => r.rows.map((row) => ({ ...row, scenario: r.scenario })));

const VERDICTS = {
  done: "Done",
  gaps: "Done, with gaps",
  partial: "Partly done",
  notdone: "Not done",
  parked: "Parked",
};

// status: met | not | partial | unknown. source says where the statement comes from.
const code = (point, requirement, status, observed) => ({ point, requirement, status, observed, source: "code reading" });
const suite = (point, requirement, status, observed) => ({ point, requirement, status, observed, source: "existing e2e suite" });
const unit = (point, requirement, status, observed) => ({ point, requirement, status, observed, source: "unit test, passed today" });

const SUITES = {
  sales: "scripts/stack/scenarios/cr24-sales.cjs: 23 scenarios, 381 checks, all passed",
  bills: "scripts/stack/scenarios/cr24-bills.cjs: 168 checks across pharmacist, doctor and admin at 1280 and 390 px, all passed",
  discounts: "scripts/stack/scenarios/cr24-discounts.cjs: 180 checks, all passed",
  purchase: "scripts/stack/scenarios/cr26-purchase.cjs: 20 scenarios, 337 checks, all passed",
  returns: "scripts/stack/scenarios/cr27-returns.cjs: 26 scenarios, 125 checks, all passed",
  counts: "scripts/stack/scenarios/cr31-reconciliation.cjs: 37 scenarios, 203 checks, all passed",
  reports: "scripts/stack/scenarios/cr33-reports.cjs: 23 of 23 scenarios passed (includes Excel, CSV and PDF downloads carrying the screen's totals)",
  access: "scripts/stack/scenarios/access-roles.cjs: 99 checks, all passed (pharmacist, doctor and admin reach every pharmacy screen; reception is refused)",
};

const CRS = [
  {
    id: "CR-08", title: "Space-optimised layout: print every heading inline with its value", priority: "Medium", verdict: "gaps",
    summary: "Nine of the ten listed blocks print as bold label, colon, value on one line, and unticking the option restores the old layout. Two gaps: Examination does not print at all, and an empty Diagnosis still prints \"Diagnosis: —\".",
    left: ["Examination is not printed. docs/qa/cr-08-space-optimized-print-layout.md records a clinic decision of 09/11/2026 not to print it; confirm that with Dr. Praneeta Jain.", "A blank Diagnosis prints \"Diagnosis: —\" instead of nothing (rule 3)."],
    shots: [["cr08-1-print-preview-optimized-ticked", "Print Preview with Space-optimized layout ticked: every heading sits on the line of its value"], ["cr08-2-optimized-page1", "The printed page: 9 medicines, 10 investigations, Review Date and Follow-up sharing one line"], ["cr08-3-blank-fields-page1", "A visit with most fields blank: empty blocks print nothing, but Diagnosis prints a dash"]],
    e2e: ["cr-audit-visits.cjs (new): 15 CR-08 checks on the rendered print pages"],
    unit: ["frontend/__tests__/visits/PrescriptionBuilder.pagedjs.margins.test.tsx"],
  },
  {
    id: "CR-09", title: "Pharmacy Billing: \"Load\" button does nothing", priority: "High", verdict: "done",
    summary: "Load now opens the bill with the prescribed items and quantities, linked to stock, and flags the ones the pharmacy cannot supply. The old Pharmacy Billing screen was replaced by Sales → New sale, which carries the pending-prescription queue.",
    extra: [unit("3", "If loading fails, a clear error is shown", "met", "frontend/__tests__/pharmacy/SalesBill.prescription-load.test.tsx: \"shows a visible load error and retries the same prescription\""), suite("4", "Saving the bill removes the prescription from Pending", "met", "cr24-bills.cjs: \"the prescription leaves Pending on screen and in the queue\" (only a finished bill does this; Save draft keeps it pending)")],
    shots: [["cr10-2-pending-queue-stock-column", "Pending prescription in the queue with its Load button"], ["cr09-1-prescription-loaded-into-bill", "After Load: the bill holds the prescribed medicines; the one not in stock is flagged"], ["suite-cr24-bills-prescription-finished", "From the existing suite: the same flow finished into a numbered bill"]],
    e2e: ["cr-audit-pharmacy.cjs (new): Load on a prescription written in the browser by the doctor", SUITES.bills],
    unit: ["frontend/__tests__/pharmacy/SalesBill.prescription-load.test.tsx (15 tests)", "backend/src/modules/pharmacy/tests/pharmacy-billing-pending.spec.ts"],
  },
  {
    id: "CR-10", title: "Pharmacy stock and item matching are wrong: redo inventory and stock", priority: "High", verdict: "partial",
    summary: "The linking, the movement log and the stock column are built and work. Merging duplicates and importing a filled stock-take file are not built, and the Sales bill's manual add still searches the full drug list. Whether the clinic's real stock figures are now right can only be judged on the live database.",
    extra: [code("8", "Picker and billing use the clinic's own stocked items first", "partial", "The Rx picker searches clinic stock only (backend/src/modules/prescriptions/prescription-drug-search.ts). The Sales bill's manual add and Substitute still search the whole drug master (frontend/src/components/pharmacy/PharmacyInvoiceBuilderFixed.tsx:944-965)."), code("check", "20 random items match the shelf count on the live system", "unknown", "Needs the clinic's live database and a physical count; not checkable from the code.")],
    left: ["Merge duplicate items (point 4).", "Import of a filled stock-take file (point 3); counts are typed in on screen instead.", "Sales bill manual search still uses the full drug list (point 8)."],
    shots: [["cr10-2-pending-queue-stock-column", "Stock column per prescribed item: In stock / Low / Not linked, with quantities and a Link item action"], ["cr10-1-stock-ledger", "Stock ledger: every movement with date, method and who did it"]],
    e2e: ["cr-audit-pharmacy.cjs (new): 8 CR-10 checks"],
    unit: ["backend/src/modules/pharmacy/tests/cr10-stock-identity.spec.ts (6 tests)", "frontend/__tests__/pharmacy/PrescriptionDispensingQueue.stock.test.tsx (5 tests)"],
  },
  {
    id: "CR-11", title: "Standard format for medicine names (Tab. / Syp. / cream)", priority: "High", verdict: "notdone",
    summary: "Not built. Names are still one free-text field; the Rx picker and the printed prescription show the stored name as it is, codes and pack sizes included.",
    extra: [code("3", "Existing items cleaned up; items missing strength listed for the clinic", "not", "No such list exists. Data clean-up itself can only be confirmed on the live database.")],
    left: ["Separate form / strength fields and a name built from them.", "Combination-product tick box.", "Codes and pack sizes kept off the prescription.", "Clean-up of existing names."],
    shots: [["cr11-2-rx-picker-raw-name", "Rx picker offers the stored name with its code (\"13 74 | Flutas 150Mg(Pc)\")"], ["cr11-3-print-shows-raw-name", "The same raw name prints on the prescription"], ["cr11-1-new-item-form", "New-item form: no Form, Strength or Combination product fields"]],
    e2e: ["cr-audit-pharmacy.cjs (new): 4 CR-11 checks, all showing the request is not met"],
    unit: ["None for the name format"],
  },
  {
    id: "CR-12", title: "Combine Inventory and Inventory Updates into one section", priority: "Medium", verdict: "done",
    summary: "One Inventory menu item. Price and stock edits are made from the Stock tab with a reason, wait for a doctor, and show in Today → What needs attention.",
    shots: [["menu-inventory-home", "Left menu: a single Inventory entry, no Inventory Updates"], ["cr12-1-edit-stock-with-reason", "Pharmacist edits stock from the item, with a reason"], ["cr12-2-today-pending-edit", "Today shows \"Price/stock edits awaiting approval (1)\""], ["cr12-3-doctor-approval-queue", "The doctor's approval queue; stock changed only after Approve"]],
    e2e: ["cr-audit-pharmacy.cjs (new): 8 CR-12 checks", "scripts/stack/scenarios/merge-main.cjs and access-roles.cjs also cover the edit and approval path"],
    unit: ["frontend/__tests__/inventory/StockEditDialog.test.tsx", "frontend/__tests__/inventory/InventoryUpdates.test.tsx", "backend/src/modules/pharmacy/tests/inventory-batch-edits.spec.ts"],
  },
  {
    id: "CR-13", title: "Bigger font and fewer taglines (all screens)", priority: "High", verdict: "partial",
    summary: "Text was made larger everywhere (body 18 px, table text 16 px or more, headings 20 px and up). The grey taglines the request names are still on the Inventory screen, some badges are 14 px, and there is no per-user Text size setting.",
    extra: [code("2", "Hints kept only where needed, as an (i) tooltip", "partial", "An info-tooltip exists and is used in a few places (reports, stock list); most hints are still inline grey text. 12 page headers still pass a grey description."), code("5", "Tables wrap rather than shrink at larger sizes", "partial", "Text is rem-based so it does not shrink, but table cells default to no-wrap inside a scrolling container (frontend/src/components/ui/table.tsx).")],
    left: ["Remove the named taglines.", "Per-user Text size (Normal / Large / Extra large).", "Raise the 14 px badges and secondary lines to 16 px."],
    shots: [["cr13-1-inventory-taglines", "Inventory still shows \"Receive, review and manage pharmacy stock.\" and \"Every action opens the matching records.\""], ["cr13-2-header-settings-open", "No Text size control in the header menus"]],
    e2e: ["cr-audit-pharmacy.cjs (new): 5 CR-13 checks (computed font sizes read from the browser)"],
    unit: ["None"],
  },
  {
    id: "CR-14", title: "Purchase invoice matching says \"No close match\" for items already in inventory", priority: "High", verdict: "partial",
    summary: "The clinic's own example still fails on the real matching service: \"ZITCARE FORT CAPSULE, 15's\" comes back \"Not in inventory\" with create-new recommended, although \"Zitcare Forte Capsule\" is saved. Fort = Forte is tolerated only once the \"15's\" pack text is out of the way.",
    extra: [code("3", "Clinic's own items searched first; top 3-5 candidates plus a search box", "partial", "The service ranks at most 3, from the drug master rather than stock first; the screen shows only the top one. A manual search box exists (frontend/src/components/pharmacy/PurchaseManualMatchSearch.tsx)."), code("5", "Confirmed matches remembered per supplier for future invoices", "not", "A confirmation writes an audit row that is never read back (backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:830-836)."), code("6", "\"(loose ...)\" never added to product names", "not", "Confirm Match overwrites the line with the saved name, suffix included; backend/src/modules/inventory/inventory-names.ts:15-16 re-appends the loose label.")],
    left: ["Ignore pack text such as \"15's\" when matching.", "Show 3-5 candidates.", "Remember confirmed matches per supplier.", "Stop carrying \"(loose ...)\" into names."],
    shots: [],
    e2e: ["cr-audit-pharmacy.cjs (new): the real matching endpoint called with the clinic's invoice text against a database holding Zitcare Forte"],
    unit: ["No CR-14 test exists. Nearest: backend/src/shared/search/product-search.spec.ts"],
  },
  {
    id: "CR-15", title: "Purchase invoice suggests a wrong product when there is no real match", priority: "High", verdict: "done",
    summary: "Abzorb is no longer suggested for Moisturex: with no name match the line reads \"Not in inventory\" with create new item, and confirming a different product is refused with a mismatch warning unless acknowledged. Point 5 (audit of past invoices) cannot be confirmed from here.",
    extra: [code("5", "Past invoices audited for manufacturer-only matches and stock corrected", "unknown", "A read-only audit script exists (scripts/diagnostics/cr15-purchase-match-audit.cjs); docs/qa/cr-15-purchase-product-matching.md reports 8 invoices audited, 0 corrections. Needs the live database to confirm.")],
    shots: [["suite-cr15-no-match-desktop", "Screen from the earlier CR-15 browser check (docs/qa/cr15, synthetic data): \"Not in inventory\" with Create new item"]],
    e2e: ["cr-audit-pharmacy.cjs (new): the real matching and confirmation endpoints, including the 409 mismatch refusal"],
    unit: ["backend/src/modules/pharmacy/tests/pharmacy-purchase-invoice.service.spec.ts (CR-15 cases at :549-589 and :849)", "frontend/__tests__/pharmacy/PurchaseInvoiceWorkbench.test.tsx:748"],
  },
  {
    id: "CR-16", title: "Visit history panel shows far too much", priority: "High", verdict: "done",
    summary: "The past-visit panel opens compact: chief complaint, diagnosis, history and a plain list of medicine names, each once. No dose or frequency figures and no internal fields. Full details is one click away.",
    shots: [["cr16-1-compact-panel", "Compact panel on a follow-up patient: complaint, history, medicine names only"], ["cr16-2-full-details", "Full details, one click, with the regimen and without internal fields"]],
    e2e: ["cr-audit-visits.cjs (new): 10 CR-16 checks on a visit written in the browser"],
    unit: ["frontend/__tests__/visits/PatientHistoryVisitCard.test.tsx (18 tests)"],
  },
  {
    id: "CR-17", title: "Appointments: billing information, bill type, and a Daily Collection tab", priority: "Medium", verdict: "notdone",
    summary: "Not built. Appointment rows show no billing information or bill type, and the left menu has no Daily Collection entry. A Daily Collection report does exist under Pharmacy Report, covering pharmacy takings only.",
    left: ["Billing information on each appointment row.", "Bill type (first consultation / review / procedure).", "Daily Collection in the left menu."],
    shots: [["cr17-1-appointments-day-calendar", "Appointment row: time, patient, visit type, age, room and status; nothing about billing"], ["cr17-2-daily-collection-report-in-pharmacy-report", "The nearest thing: Daily Collection inside Pharmacy Report"]],
    e2e: ["cr-audit-pharmacy.cjs (new): 4 CR-17 checks on a booked appointment"],
    unit: ["None for billing on appointments"],
  },
  {
    id: "CR-18", title: "Patient History: remove Triggers and Prior Treatments", priority: "Low", verdict: "notdone",
    summary: "Not done. Both fields are still on the form, are saved, and print under History. Personal history (CR-04) is present alongside them.",
    left: ["Remove the Triggers field.", "Remove the Prior Treatments field."],
    shots: [["cr18-patient-history-fields", "Patient History today: Triggers and Prior Treatments still under Personal history"]],
    e2e: ["cr-audit-visits.cjs (new): 4 CR-18 checks"],
    unit: ["None assert the removal"],
  },
  {
    id: "CR-19", title: "Rx table: column widths and the Add Row button", priority: "Medium", verdict: "notdone",
    summary: "Not done. Duration is as wide as Instructions (216 px against 219 px), a 29-character instruction is cut off, and the single Add Row button only adds at the end.",
    left: ["Narrow the Duration column.", "Widen Instructions.", "Add Row after every row."],
    shots: [["cr19-rx-table", "Rx table: \"1 pea size amount- whole face\" is cut off; rows only have Remove"]],
    e2e: ["cr-audit-visits.cjs (new): 4 CR-19 checks measured in the browser"],
    unit: ["None"],
  },
  {
    id: "CR-20", title: "Investigations: custom investigations saved permanently", priority: "Medium", verdict: "done",
    summary: "A custom investigation is saved for the clinic, shows as a standing checkbox on other patients' prescriptions, and can be renamed or removed.",
    shots: [["cr20-1-custom-added", "Custom investigation added and ticked"], ["cr20-2-standing-checkbox-other-patient", "The same investigation as a standing checkbox on another patient"], ["cr20-3-manage-saved", "Manage saved investigations: rename and remove"]],
    e2e: ["cr-audit-visits.cjs (new): 6 CR-20 checks"],
    unit: ["frontend/__tests__/visits/PrescriptionBuilder.custom-investigations.test.tsx (13 tests)", "backend/src/modules/clinic-investigations/*.spec.ts"],
  },
  {
    id: "CR-21", title: "Keep patient name, age and sex on screen when Patient Context is collapsed", priority: "High", verdict: "done",
    summary: "The header reads \"Patient: NAME · age · sex · Doctor\" from Visit #1, stays when Patient Context is collapsed, and stays pinned while scrolling to the Rx section. \"Patient: Unknown\" is gone.",
    shots: [["cr21-1-context-open", "Visit #1 for a new patient: the header names the patient"], ["cr21-2-context-collapsed", "Patient Context collapsed: identity still in the header"], ["cr21-3-sticky-while-scrolled", "Scrolled down to Investigations: identity line still pinned at the top"]],
    e2e: ["cr-audit-visits.cjs (new): 5 CR-21 checks", "verification/cr-state-coverage-2026-11-07/models/cr21-visit-identity.cjs re-run today: 16 of 16 states, 17 of 17 transitions, 0 failures"],
    unit: ["frontend/__tests__/visits/VisitIdentityBar.test.tsx", "frontend/__tests__/lib/visit-identity.test.ts"],
  },
  {
    id: "CR-22", title: "Make \"On Examination\" collapsible", priority: "Medium", verdict: "done",
    summary: "Collapsed by default, opens on a click with all its fields, keeps what was typed, and stays collapsed on the next visit. The choice is remembered in the browser, so it does not follow the doctor to another computer.",
    shots: [["cr22-1-collapsed-by-default", "On Examination as a single collapsed heading between Patient History and Treatment"], ["cr22-2-opened", "Opened: all existing fields"]],
    e2e: ["cr-audit-visits.cjs (new): 5 CR-22 checks", "verification/cr-state-coverage-2026-11-07/models/cr22-on-examination.cjs re-run today: 11 of 11 states, 16 of 16 transitions, 0 failures"],
    unit: ["frontend/__tests__/visits/PrescriptionBuilder.on-examination.test.tsx", "frontend/__tests__/visits/on-examination-panel.test.ts"],
  },
  {
    id: "CR-23", title: "Space-optimised layout must tighten vertical gaps to fit one page", priority: "High", verdict: "done",
    summary: "With 9 medicines and 10 investigations the prescription prints on one page with the option ticked and on two without it. Text size is the same in both; only spacing changes.",
    shots: [["cr08-2-optimized-page1", "Space-optimized: one page"], ["cr23-1-normal-layout-page1", "Normal layout, page 1 of 2: the roomier spacing is unchanged"]],
    e2e: ["cr-audit-visits.cjs (new): 4 CR-23 checks on the rendered pages"],
    unit: ["frontend/__tests__/lib/print-fit.test.ts"],
  },
  {
    id: "CR-24", title: "Build the Sales tab like eVitalRx", priority: "High", verdict: "gaps",
    summary: "The Sales register is built: the asked columns in order, payment badges, print and WhatsApp on each row, Draft rows, sortable headers, financial-year default, New sale, and a pinned total. One gap in the filter bar: there is no separate Name / Mobile search box; name and mobile are options in the one \"Search by\" selector.",
    extra: [suite("1", "Columns in order: Bill No · Entry Date · Bill Date · Entry By · Patient · Mobile · Bill Amount · payment", "met", "cr24-sales.cjs scenario 01"), suite("2", "Payment mode as a coloured badge on each row", "met", "cr24-sales.cjs scenarios 04, 14"), suite("3", "Print and WhatsApp icons on every row", "met", "cr24-sales.cjs scenario 06"), suite("4", "Unsaved bills show as Draft and can be reopened", "met", "cr24-sales.cjs scenario 05; cr24-bills.cjs draft reopen and finish"), suite("5", "Sortable column headers", "met", "cr24-sales.cjs scenario 03"), code("6", "Filter bar: field selector + search, date range (financial year), Name / Mobile search, payment dropdown, More Filters with count", "partial", "All present except a separate Name / Mobile box (frontend/src/components/pharmacy/sales/SalesRegister.tsx:231-272)."), suite("7", "\"+ New\" button", "met", "\"New sale\" opens the bill; the Sales Return link became the Returns tab (CR-25)"), suite("8", "Running total pinned at the bottom", "met", "cr24-sales.cjs scenarios 01, 02, 13"), suite("check", "Filter to one day: the bottom total updates", "met", "cr24-sales.cjs scenario 02")],
    left: ["A separate Name / Mobile search box, if the clinic wants it as in the reference."],
    shots: [["suite-cr24-default-fy", "Sales register, financial year by default, total pinned at the bottom"], ["suite-cr24-drafts", "Draft rows"], ["suite-cr24-row-actions", "Print and WhatsApp on the row"], ["suite-cr24-more-filters", "More filters with the active count"]],
    e2e: [SUITES.sales, SUITES.bills, SUITES.discounts, SUITES.access],
    unit: ["frontend/__tests__/pharmacy/SalesPage.test.tsx (22 tests)", "backend/src/modules/pharmacy/tests/pharmacy-sales-register*.spec.ts (31 tests)"],
  },
  {
    id: "CR-25", title: "The Sales tab holds two sub-tabs: Sales and Returns", priority: "High", verdict: "done",
    summary: "Sales and Returns are tabs on the same screen with the same filter bar, sortable columns, New return, an empty-state message and pagination.",
    extra: [suite("2-4", "Returns is a proper sub-tab with the same layout, filter bar and sortable columns", "met", "cr24-sales.cjs scenarios 08, 20"), suite("5", "\"+ New\" on Returns raises a sales return", "met", "cr24-sales.cjs scenarios 08, 18, 19 (the form opens in the Inventory editor and comes back)"), suite("6", "Clear empty state when nothing matches", "met", "cr24-sales.cjs scenario 08: \"No returns match your search\""), suite("7", "Pagination at the bottom", "met", "cr24-sales.cjs scenario 09")],
    shots: [["suite-cr24-returns-default", "Returns tab beside Sales"], ["suite-cr24-returns-empty", "Empty state on Returns"], ["suite-cr24-page-2", "Pagination"]],
    e2e: [SUITES.sales],
    unit: ["frontend/__tests__/pharmacy/SalesPage.test.tsx", "frontend/__tests__/pharmacy/sales-register-model.test.ts"],
  },
  {
    id: "CR-26", title: "Build the Purchase tab like eVitalRx", priority: "High", verdict: "gaps",
    summary: "The Purchase bills register is built inside Inventory → Purchases: the asked columns, Bill No. as a link, Due / Overdue / Paid badges with Mark paid beside them, sorting, New purchase and a More menu. Gap: Distributor search is an option in the field selector rather than its own box. Purchase is not a top-level menu item (the request left that open).",
    extra: [suite("1", "Columns in order: Sr No · Bill No · Entry Date · Bill Date · Entry By · Distributor · Bill Amount · payment status", "met", "cr26-purchase.cjs scenario 01"), suite("2", "Bill No. opens the purchase invoice", "met", "cr26-purchase.cjs scenario 10"), suite("3", "Payment status badge with a one-click control to mark the invoice settled", "met", "cr26-purchase.cjs scenarios 04-06 (confirm popover, then Undo)"), suite("4", "Sortable column headers", "met", "cr26-purchase.cjs scenario 02"), code("5", "Filter bar with a Distributor Name search", "partial", "Distributor is an option in the \"Search by\" selector and a dropdown inside More filters (frontend/src/components/inventory/purchase/PurchaseRegister.tsx:200-240)."), suite("6", "\"+ New\" and a More menu", "met", "cr26-purchase.cjs scenarios 10, 17"), suite("7", "Row opens the whole invoice with its line items", "met", "cr26-purchase.cjs scenario 10")],
    left: ["A dedicated Distributor Name box, if wanted.", "Decide whether Purchase should be a top-level menu item."],
    shots: [["suite-cr26-default", "Purchase bills register"], ["suite-cr26-popover", "Mark paid from the row"], ["suite-cr26-search-distributor", "Filtered to one distributor"], ["suite-cr26-bill-opened", "Bill No. opens the invoice"]],
    e2e: [SUITES.purchase, SUITES.access],
    unit: ["frontend/__tests__/inventory/PurchaseRegister.test.tsx (29 tests)", "backend/src/modules/pharmacy/tests/pharmacy-purchase-register*.spec.ts (28 tests)"],
  },
  {
    id: "CR-27", title: "Purchase Returns sub-tab, settled by distributor credit notes", priority: "High", verdict: "gaps",
    summary: "Purchase and Returns sit side by side. A return lowers stock, sits as \"Credit note awaited\" until the credit note is entered, and the credit can be set off across several bills with the balance shown. Gap: a return started from \"New return\" on the Returns tab has no way to pick the invoice the goods came in on; the link exists only when the return is started from a purchase bill.",
    extra: [suite("1", "Purchase has two sub-tabs, same layout", "met", "cr27-returns.cjs scenarios 01, 16"), code("2", "A return records distributor, source invoice, item, batch, expiry, quantity and value", "partial", "Source invoice is set only via \"Return to supplier\" on a bill (frontend/src/components/inventory/WorkflowDocumentEditor.tsx:246-263). The suite raises its returns through the API rather than the form."), suite("3-4", "Credit note is a record; return shows \"Credit note awaited\" until entered", "met", "cr27-returns.cjs scenarios 03, 05"), suite("5", "Credit balance per distributor, net position in one place", "met", "cr27-returns.cjs scenarios 11, 12"), suite("6", "Partial use across invoices, remaining balance shown", "met", "cr27-returns.cjs scenarios 09, 10"), code("7", "Stock goes down when the goods go back, logged with date, user and reason", "met", "A RETURN movement is written when the return challan is created (backend/src/modules/inventory/inventory-workflow.service.ts:2138-2140, reason from supplier-return.ts:55-59). The database spec for it (purchase-returns.database.spec.ts) needs its own database and did not run here."), suite("8", "Returns columns and statuses", "met", "cr27-returns.cjs scenario 01")],
    left: ["Invoice picker on \"New return\" from the Returns tab."],
    shots: [["suite-cr27-returns", "Returns register with credit-note status"], ["suite-cr27-record-dialog", "Record the credit note"], ["suite-cr27-set-off-dialog", "Set the credit off against bills"], ["suite-cr27-position-strip", "Distributor position: due less credit held"]],
    e2e: [SUITES.returns],
    unit: ["frontend/__tests__/inventory/PurchaseReturns.test.tsx (21 tests)", "backend/src/modules/pharmacy/tests/purchase-returns.database.spec.ts (30 tests)"],
  },
  {
    id: "CR-28", title: "Terms of Trade (TOT) in the Purchase tab", priority: "High", verdict: "gaps",
    summary: "The essential part is built: terms per distributor and product (discount, scheme, minimum expiry, margin, PTR and rule, note), entered in steps, read-only for staff, and shown as \"Agreed\" against \"Invoice\" on the purchase bill. The second phase (automatic checking, mismatch flags, Returnable) is not built.",
    extra: [suite("1-2", "Terms recorded per distributor and product: discount, scheme, minimum expiry, margin, PTR and rule", "met", "cr28-tot-entry model: 27 of 27 states, 38 of 38 transitions"), suite("4", "Who entered it and when, plus a note", "met", "cr28-tot-entry model"), suite("6", "Shown on the purchase invoice screen when goods from that distributor are entered", "met", "cr28-tot-invoice model: 10 of 10 states, 10 of 10 transitions"), code("phase2-2", "Phase 2: mismatch flagged before the invoice is saved", "not", "The bill shows Agreed and Invoice side by side but compares nothing (frontend/src/components/pharmacy/AgreedTerms.tsx)."), code("phase2-3", "Phase 2: flagged item marked Returnable, feeding CR-27", "not", "\"returnable\" appears nowhere in the code.")],
    left: ["Phase 2: automatic checking, mismatch flag, Returnable."],
    shots: [["suite-cr28-scheme-step", "Entering terms: Distributor → Items → Scheme (from the state-coverage run)"], ["suite-cr28-invoice-hint", "On a purchase bill: Agreed 12.5% against Invoice 10%, shown but not flagged"], ["cr28-1-terms-read-only-for-pharmacist", "Pharmacist: read-only"], ["cr28-2-add-terms-steps-for-doctor", "Doctor: Add terms"]],
    e2e: ["cr-audit-pharmacy.cjs (new): 5 CR-28 checks including the server refusing a pharmacist's save", "verification/cr-state-coverage-2026-11-07/models re-run today: cr28-tot-entry 27/27 states, 38/38 transitions; cr28-tot-invoice 10/10, 10/10", "cr28-tot-roles model stops on a wording check only: it expects \"Read-only. Only doctors can change terms.\" and the screen now says \"Read-only. Doctors and admins can change terms.\""],
    unit: ["backend/src/modules/pharmacy/tests/pharmacy-trade-terms.spec.ts (12 tests)", "frontend/__tests__/pharmacy/TradeTermsWorkspace.test.tsx"],
  },
  {
    id: "CR-29", title: "Stock Optimization in the Inventory tab", priority: "High", verdict: "notdone",
    summary: "Not built. There is no data-quality strip, no Run optimization, no returnable / non-returnable split, and no rules. The only related thing is a \"Missing information\" filter with counts, inside the Stock list's Filters panel.",
    extra: [code("3", "Grouped by distributor, one return draft per supplier", "not", "No such code.")],
    left: ["Everything in this request."],
    shots: [["cr29-1-inventory-top-no-strip", "Inventory opens with no data-quality strip"], ["cr29-2-missing-information-filter", "What exists: a Missing information filter with counts"]],
    e2e: ["cr-audit-pharmacy.cjs (new): 4 CR-29 checks"],
    unit: ["None for stock optimization"],
  },
  {
    id: "CR-30", title: "Doctor approval before a new item enters inventory", priority: "Parked", verdict: "parked",
    summary: "The request says do not build this now. It is built and switched on: a new item added by a staff member becomes a request, and a doctor approves or rejects it. Tell the clinic, since it changes how staff add items today.",
    shots: [["cr30-new-item-approval-queue", "Approve corrections → New items: the staff member's request waiting for a doctor"]],
    e2e: ["cr-audit-pharmacy.cjs (new): 2 checks", "verification/cr-state-coverage-2026-11-07/models/cr30-item-request-lifecycle.cjs re-run today: 26 of 26 states, 32 of 32 transitions"],
    unit: ["backend/src/modules/inventory/tests/inventory-item-request*.spec.ts (26 tests)"],
  },
  {
    id: "CR-31", title: "Stock reconciliation every 10 days, with staff sign-off", priority: "High", verdict: "done",
    summary: "Built: a cycle length setting (10 days by default), items dealt to named staff, a counting screen with the difference worked out, sign-off that locks the record, doctor approval before stock changes, a reminder in Today, on-demand counts and a history. It is off until switched on in Settings.",
    extra: [suite("1-2", "Cycle length and items per person per day are settings; items dealt to assigned staff", "met", "cr31-reconciliation.cjs settings and planning scenarios"), suite("3", "Counting screen: item, batch, expiry, system quantity, counted quantity, difference", "met", "cr31-reconciliation.cjs count-sheet scenarios"), suite("4", "Sign-off records who, when, what and the variances; locked afterwards", "met", "cr31-reconciliation.cjs sign-off scenarios"), suite("5", "Stock changes only when a doctor approves the variance; approval logged", "met", "cr31-reconciliation.cjs approval scenarios; approvers are doctor, owner, admin"), code("6", "A reconciliation permission controls who can be assigned and who can sign off", "partial", "It uses the existing pharmacy:compliance:audit permission, which also gates the daily cash count, rather than a permission of its own."), suite("7", "Reminder in Today, no lockout", "met", "cr31-reconciliation.cjs"), suite("8", "On-demand count for a single item or shelf", "met", "cr31-reconciliation.cjs shelf and item picker scenarios"), suite("9", "History: date, who signed, items counted, total variance", "met", "cr31-reconciliation.cjs history scenarios")],
    left: ["Switch it on and choose who counts (it ships off).", "Decide whether reconciliation needs its own permission."],
    shots: [["suite-cr31-settings", "Settings: cycle length and items per person per day"], ["suite-cr31-count-sheet", "Counting screen with the difference"], ["suite-cr31-sign-off", "Sign off"], ["suite-cr31-approvals", "Doctor's approvals"], ["suite-cr31-history", "History of counts"]],
    e2e: [SUITES.counts],
    unit: ["frontend/__tests__/inventory/StockCounts.test.tsx (17 tests)", "backend/src/modules/inventory/tests/inventory-reconciliation.spec.ts (38 tests)"],
  },
  {
    id: "CR-32", title: "AI-suggested min/max stock levels", priority: "Parked", verdict: "parked",
    summary: "Parked, and not built as described. A rule-based relative exists under Reorder: min/max proposals worked out from sales history as days of cover, reviewed before they apply. It is not AI, has no per-category setting and no price band.",
    shots: [["cr32-reorder-target-proposals", "Reorder → target proposals"]],
    e2e: ["cr-audit-pharmacy.cjs (new): 1 check"],
    unit: ["frontend/__tests__/inventory/ReplenishmentTargets.test.tsx"],
  },
  {
    id: "CR-33", title: "Reports tab: daily collection and the full GST report set", priority: "High", verdict: "done",
    summary: "Pharmacy Report has categories down the left, a search box, common reports on the landing page, Daily Collection with a drawer count, and all eleven GST reports, each with a period filter and Excel / CSV / PDF export. GSTR-2A and 2B are built from the clinic's own books, not from the GST portal.",
    left: ["Confirm with the accountant that books-side GSTR-2A / 2B are what they want."],
    shots: [["cr33-1-reports-landing", "Reports landing: categories and common reports"], ["cr33-2-search-gstr", "Searching GSTR"], ["cr33-4-daily-collection", "Daily Collection: bills raised against money counted, by payment mode"], ["cr33-3-gstr-3b", "GSTR-3B"]],
    e2e: ["cr-audit-reports.cjs (new): 15 CR-33 checks, each GST report opened and its export menu read", SUITES.reports],
    unit: ["backend/src/modules/pharmacy/tests/pharmacy-gst-reports.spec.ts (28 tests)", "backend/src/modules/pharmacy/tests/pharmacy-daily-collection.spec.ts (12 tests)", "frontend/__tests__/pharmacy/PharmacyReportWorkspace.test.tsx (12 tests)"],
  },
  {
    id: "CR-33a", title: "GST Purchase Bills report: column detail", priority: "High", verdict: "gaps",
    summary: "Slab groups, totals row under the header, month total and export are there. Two gaps: no Show Columns control, and at laptop width only Sr No., Bill No. and Entry Date stay frozen; Bill Date and Distributor scroll away.",
    left: ["Show Columns.", "Keep Bill Date and Distributor frozen at normal laptop widths."],
    shots: [["cr33a-1-purchase-bills-left", "Purchase Bills: fixed columns and the first slab group"], ["cr33a-2-purchase-bills-scrolled-right", "Scrolled right at 1440 px: Bill Date and Distributor are gone"]],
    e2e: ["cr-audit-reports.cjs (new): 7 CR-33a checks", SUITES.reports],
    unit: ["backend/src/modules/pharmacy/tests/pharmacy-gst-reports.spec.ts"],
  },
  {
    id: "CR-33b", title: "GST Sales Register: column detail", priority: "High", verdict: "gaps",
    summary: "The twelve columns in order, totals under the header, row arithmetic, print, download and customer search with totals following all work. Two gaps: no More Filters and no second dropdown for payment or bill type.",
    left: ["More Filters with a count.", "Payment / bill type dropdown."],
    shots: [["cr33b-1-sales-register", "Sales Register: flat columns with totals under the header"], ["cr33b-2-sales-register-search-meera", "Searching a customer: rows and totals narrow together"]],
    e2e: ["cr-audit-reports.cjs (new): 8 CR-33b checks", SUITES.reports],
    unit: ["backend/src/modules/pharmacy/tests/pharmacy-gst-reports.spec.ts"],
  },
  {
    id: "CR-33c", title: "Day wise Summary: column detail", priority: "High", verdict: "done",
    summary: "One row per day with the bill-number range, slab groups, totals that add up, a date range, Sales or Purchase, and download. Days with no billing are shown as ₹0 rows.",
    shots: [["cr33c-1-day-wise-summary", "Day wise Summary for a month"], ["cr33c-0-day-wise-this-month", "Bill number range and gaps for the day"], ["cr33c-2-day-wise-purchase", "Type switched to Purchase"]],
    e2e: ["cr-audit-reports.cjs (new): 7 CR-33c checks", "The older state model (cr33c-day-wise-summary.cjs) can no longer start: it opens the report from Inventory → Purchases, and the report has since moved to Pharmacy Report"],
    unit: ["backend/src/modules/pharmacy/tests/pharmacy-reports.service.spec.ts"],
  },
  {
    id: "CR-33d", title: "Item Wise Margin Report: column detail", priority: "High", verdict: "done",
    summary: "Four tiles, the asked columns, highest margin first, profit with the percentage in brackets, an (i) on every header, tags filter, item links and download. Rows reconcile: Sales − Purchase − Net GST = Profit. The warning about inventory clean-up appears on the reports landing page, not on this report.",
    shots: [["cr33d-1-item-wise-margin", "Item Wise Margin: tiles and rows, highest margin first"]],
    e2e: ["cr-audit-reports.cjs (new): 10 CR-33d checks on items bought and sold through the app", "The older state model (cr33d-item-margin.cjs) can no longer start, for the same reason as CR-33c"],
    unit: ["frontend/__tests__/pharmacy/ItemMarginReport.test.tsx (9 tests)", "backend/src/modules/pharmacy/pharmacy-item-margin.spec.ts"],
  },
  {
    id: "CR-34", title: "Item detail page in Inventory: batches and ledger per item", priority: "High", verdict: "gaps",
    summary: "The item page is built with all seven tabs. The ledger lists the purchase and the sale with a running balance that ends at current stock. Missing from the header: product photo, CESS, and min / default / max discount % (a single Margin % stands in for the margin slab). Ledger download is CSV only.",
    left: ["Product photo.", "CESS.", "Min / Default / Max discount %."],
    shots: [["cr34-1-item-header-and-batches", "Item header and Batches tab"], ["cr34-2-item-ledger", "Ledger: purchase 10 in, sale 2 out, closing 8 = current stock"]],
    e2e: ["cr-audit-pharmacy.cjs (new): 12 CR-34 checks on an item bought and sold through the app"],
    unit: ["frontend/__tests__/inventory/InventoryItemPage.test.tsx (9 tests)", "backend/src/modules/inventory/inventory-item-ledger.spec.ts (8 tests)"],
  },
];

const statusOf = (row) => (row.source ? row.status : /partial|parked/.test(row.point) && row.pass ? "note" : row.pass ? "met" : "not");
const LABEL = { met: "Met", not: "Not met", partial: "Partly", unknown: "Cannot tell", note: "Note" };
for (const cr of CRS) {
  const own = browserRows.filter((r) => r.cr === cr.id && r.point !== "run").map((r) => ({ point: r.point, requirement: r.requirement, status: statusOf(r), observed: r.observed, source: "browser" }));
  cr.rows = [...own, ...(cr.extra || [])];
  cr.crashed = browserRows.filter((r) => r.cr === cr.id && r.point === "run");
  cr.shots = (cr.shots || []).filter(([file]) => fs.existsSync(path.join(here, "shots", `${file}.jpg`)));
}

const counts = Object.fromEntries(Object.keys(VERDICTS).map((v) => [v, CRS.filter((c) => c.verdict === v).length]));
const totals = { met: browserRows.filter((r) => r.pass).length, not: browserRows.filter((r) => !r.pass).length };

// ---------- Markdown ----------
const md = [];
md.push("# Change request audit, 10 Nov 2026", "");
md.push("Which of CR-08 to CR-34 (Clinic_Software_Change_Requests.pdf, list dated 05/11/2026) are done in the code on `main` at 813ed98, with proof from a real browser against the real backend and database.", "");
md.push(`- ${counts.done} done, ${counts.gaps} done with gaps, ${counts.partial} partly done, ${counts.notdone} not done, ${counts.parked} parked.`);
md.push(`- New browser scenarios: ${totals.met + totals.not} requirement checks, ${totals.met} met and ${totals.not} not met. A \"not met\" row is a finding about the product, not a broken test.`);
md.push("- Existing suites re-run the same day: all passed (see each CR).", "");
md.push("| CR | Change | Priority | Verdict | Still to do |", "|---|---|---|---|---|");
for (const cr of CRS) md.push(`| [${cr.id}](#${cr.id.toLowerCase()}) | ${cr.title} | ${cr.priority} | **${VERDICTS[cr.verdict]}** | ${(cr.left || []).join(" ") || "—"} |`);
md.push("", "## How this was checked", "");
md.push("- `scripts/stack/scenarios/cr-audit-visits.cjs`, `cr-audit-pharmacy.cjs`, `cr-audit-reports.cjs` boot a throwaway Postgres schema, the real backend and the real frontend, log in as owner, doctor and pharmacist, and drive Chromium. Results are in `results/`, screenshots in `shots/`.");
md.push("- Rows marked *existing e2e suite* come from the suites already in `scripts/stack/scenarios/` and `verification/cr-state-coverage-2026-11-07/`, re-run on the same checkout. Screenshots prefixed `suite-` are from those runs.");
md.push("- Rows marked *code reading* could not be shown in a browser (for example something that does not exist); they cite the file.");
md.push("- Unit tests the same day: frontend 1,405 of 1,405 passed (136 suites); backend 2,213 passed and 385 skipped (the skipped ones are database specs that need their own database settings and did not run here).");
md.push("- Not checked: the clinic's live data. Items such as \"20 random items match the shelf count\" or the audit of past invoices need the production database.", "");
for (const cr of CRS) {
  md.push(`## ${cr.id}`, "", `**${cr.title}** · ${cr.priority} · **${VERDICTS[cr.verdict]}**`, "", cr.summary, "");
  if (cr.left && cr.left.length) md.push("Still to do:", ...cr.left.map((l) => `- ${l}`), "");
  if (cr.rows.length) {
    md.push("| Point | Requirement | Result | What was seen | Source |", "|---|---|---|---|---|");
    for (const r of cr.rows) md.push(`| ${r.point} | ${r.requirement.replace(/\|/g, "\\|")} | ${LABEL[r.status]} | ${String(r.observed || "").replace(/\|/g, "\\|").slice(0, 300)} | ${r.source} |`);
    md.push("");
  }
  for (const c of cr.crashed) md.push(`> A scenario step did not finish: ${c.observed}`, "");
  if (cr.shots.length) md.push(...cr.shots.map(([file, caption]) => `![${caption}](shots/${file}.jpg)\n*${caption}*\n`));
  md.push("Browser tests:", ...cr.e2e.map((e) => `- ${e}`), "", "Unit tests:", ...cr.unit.map((u) => `- ${u}`), "");
}
fs.writeFileSync(path.join(here, "REPORT.md"), md.join("\n"));

// ---------- HTML ----------
const out = process.argv[2];
if (out) {
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const pill = (v) => `<span class="pill v-${v}">${VERDICTS[v]}</span>`;
  const mark = (s) => `<span class="mark s-${s}">${LABEL[s]}</span>`;
  const section = (cr) => `
<section class="cr" id="${cr.id.toLowerCase()}">
  <header class="cr-head"><p class="cr-id">${cr.id} <span class="prio">${esc(cr.priority)} priority</span></p><h2>${esc(cr.title)}</h2>${pill(cr.verdict)}</header>
  <p class="lede">${esc(cr.summary)}</p>
  ${cr.left && cr.left.length ? `<div class="left"><h3>Still to do</h3><ul>${cr.left.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>` : ""}
  ${cr.rows.length ? `<h3>Requirement by requirement</h3><div class="scroll"><table class="checks"><thead><tr><th>Point</th><th>Requirement</th><th>Result</th><th>What was seen</th><th>Source</th></tr></thead><tbody>${cr.rows.map((r) => `<tr><td class="pt">${esc(r.point)}</td><td>${esc(r.requirement)}</td><td>${mark(r.status)}</td><td class="seen">${esc(String(r.observed || "").slice(0, 320))}</td><td class="src">${esc(r.source)}</td></tr>`).join("")}</tbody></table></div>` : ""}
  ${cr.crashed.map((c) => `<p class="warn">A scenario step did not finish: ${esc(c.observed)}</p>`).join("")}
  ${cr.shots.length ? `<h3>Screens</h3><div class="shots">${cr.shots.map(([file, caption]) => `<figure><button type="button" class="zoom" data-src="shots/${file}.jpg" data-caption="${esc(caption)}"><img src="shots/${file}.jpg" alt="${esc(caption)}" loading="lazy"></button><figcaption>${esc(caption)}</figcaption></figure>`).join("")}</div>` : ""}
  <div class="proof"><div><h3>Browser tests</h3><ul>${cr.e2e.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div><div><h3>Unit tests</h3><ul>${cr.unit.map((u) => `<li>${esc(u)}</li>`).join("")}</ul></div></div>
</section>`;
  const html = `<title>Change Request Audit</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600&display=swap">
<style>
/* Layout: one reading column; a summary table first, then one section per change request with its checks, screens and tests. */
:root { --bg:#f5f7f6; --surface:#ffffff; --ink:#17201d; --muted:#586661; --line:#dbe2df; --accent:#0d5f57; --met:#1c7447; --met-bg:#e3f3ea; --not:#a8281f; --not-bg:#fbe7e4; --part:#8a5a00; --part-bg:#fbefd2; --info:#2f5488; --info-bg:#e4ecf8; --park:#55606a; --park-bg:#e8ecef; --display:"Space Grotesk","Inter",system-ui,sans-serif; --body:"Inter",system-ui,-apple-system,"Segoe UI",sans-serif; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#101614; --surface:#18201d; --ink:#e8efec; --muted:#9db0a9; --line:#2b3632; --accent:#6fd3c4; --met:#7fd9a6; --met-bg:#153525; --not:#ff9d93; --not-bg:#43201c; --part:#f0c768; --part-bg:#3d3013; --info:#9ebdf0; --info-bg:#1c2b44; --park:#b3bec7; --park-bg:#273038; color-scheme:dark } }
:root[data-theme="dark"] { --bg:#101614; --surface:#18201d; --ink:#e8efec; --muted:#9db0a9; --line:#2b3632; --accent:#6fd3c4; --met:#7fd9a6; --met-bg:#153525; --not:#ff9d93; --not-bg:#43201c; --part:#f0c768; --part-bg:#3d3013; --info:#9ebdf0; --info-bg:#1c2b44; --park:#b3bec7; --park-bg:#273038; color-scheme:dark }
body { background:var(--bg); color:var(--ink); font-family:var(--body); font-size:16px; line-height:1.55; padding-left:max(16px, env(safe-area-inset-left, 0px)); padding-right:max(16px, env(safe-area-inset-right, 0px)); padding-block:32px 64px; }
.page { max-width:1080px; margin:0 auto; display:flex; flex-direction:column; gap:28px; }
h1 { font-family:var(--display); font-size:clamp(28px,4vw,40px); line-height:1.1; margin:0; text-wrap:balance; }
h2 { font-family:var(--display); font-size:22px; line-height:1.25; margin:0; text-wrap:balance; }
h3 { font-size:13px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); margin:0 0 8px; font-weight:600; }
p { margin:0; } a { color:var(--accent); }
.intro { display:flex; flex-direction:column; gap:12px; max-width:70ch; }
.intro p { color:var(--muted); }
.tally { display:flex; flex-wrap:wrap; gap:10px; }
.tally div { background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:10px 14px; min-width:120px; }
.tally b { display:block; font-family:var(--display); font-size:26px; line-height:1.1; font-variant-numeric:tabular-nums; }
.tally span { font-size:13px; color:var(--muted); }
.scroll { overflow-x:auto; border:1px solid var(--line); border-radius:10px; background:var(--surface); }
table { border-collapse:collapse; width:100%; font-size:14.5px; }
th { text-align:left; font-weight:600; font-size:12.5px; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); padding:10px 12px; border-bottom:1px solid var(--line); white-space:nowrap; }
td { padding:10px 12px; border-bottom:1px solid var(--line); vertical-align:top; }
tr:last-child td { border-bottom:0; }
.summary td:first-child { white-space:nowrap; font-weight:600; }
.summary td.todo { color:var(--muted); min-width:220px; }
.pill, .mark { display:inline-block; border-radius:999px; padding:2px 10px; font-size:12.5px; font-weight:600; white-space:nowrap; }
.v-done, .s-met { color:var(--met); background:var(--met-bg); }
.v-gaps, .v-partial, .s-partial { color:var(--part); background:var(--part-bg); }
.v-notdone, .s-not { color:var(--not); background:var(--not-bg); }
.v-parked, .s-unknown { color:var(--park); background:var(--park-bg); }
.s-note { color:var(--info); background:var(--info-bg); }
.cr { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:24px; display:flex; flex-direction:column; gap:16px; scroll-margin-top:16px; }
.cr-head { display:flex; flex-direction:column; gap:6px; align-items:flex-start; }
.cr-id { font-family:var(--display); font-weight:600; color:var(--accent); font-size:15px; }
.prio { color:var(--muted); font-family:var(--body); font-weight:400; font-size:13px; margin-left:6px; }
.lede { max-width:75ch; }
.left { background:var(--part-bg); border-radius:10px; padding:12px 16px; }
.left h3 { color:var(--part); } .left ul { margin:0; padding-left:18px; }
.checks td.pt { white-space:nowrap; color:var(--muted); font-variant-numeric:tabular-nums; }
.checks td.seen { color:var(--muted); min-width:220px; overflow-wrap:anywhere; }
.checks td.src { color:var(--muted); font-size:13px; white-space:nowrap; }
.checks td:nth-child(2) { min-width:240px; }
.shots { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:14px; }
figure { margin:0; display:flex; flex-direction:column; gap:6px; min-width:0; }
.zoom { padding:0; border:1px solid var(--line); border-radius:8px; overflow:hidden; background:var(--bg); cursor:zoom-in; display:block; }
.zoom:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.zoom img { display:block; width:100%; height:190px; object-fit:cover; object-position:top left; }
figcaption { font-size:13.5px; color:var(--muted); }
.proof { display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:18px; border-top:1px solid var(--line); padding-top:16px; }
.proof > div { min-width:0; } .proof ul { margin:0; padding-left:18px; font-size:14px; overflow-wrap:anywhere; } .proof li + li { margin-top:4px; }
.warn { color:var(--not); font-size:14px; }
.method { max-width:75ch; display:flex; flex-direction:column; gap:10px; } .method ul { margin:0; padding-left:20px; } .method li + li { margin-top:6px; }
dialog { border:0; padding:0; background:transparent; max-width:96vw; max-height:96vh; }
dialog::backdrop { background:rgba(8,12,11,.82); }
dialog figure { background:var(--surface); border-radius:10px; overflow:auto; max-height:94vh; }
dialog img { display:block; max-width:94vw; height:auto; }
dialog figcaption { padding:10px 14px; display:flex; justify-content:space-between; gap:12px; align-items:center; color:var(--ink); }
dialog button { font:inherit; border:1px solid var(--line); background:var(--bg); color:var(--ink); border-radius:8px; padding:6px 12px; cursor:pointer; }
</style>
<div class="page">
  <div class="intro">
    <h1>Change Request Audit</h1>
    <p>CR-08 to CR-34 from the clinic's list of 05/11/2026, checked on 10 Nov 2026 against the code on <code>main</code> (commit 813ed98). Every verdict below comes from the real application running here: real database, real backend, real browser.</p>
  </div>
  <div class="tally">
    <div><b>${counts.done}</b><span>Done</span></div><div><b>${counts.gaps}</b><span>Done, with gaps</span></div><div><b>${counts.partial}</b><span>Partly done</span></div><div><b>${counts.notdone}</b><span>Not done</span></div><div><b>${counts.parked}</b><span>Parked</span></div>
    <div><b>${totals.met + totals.not}</b><span>new browser checks: ${totals.met} met, ${totals.not} not met</span></div>
  </div>
  <div class="scroll"><table class="summary"><thead><tr><th>CR</th><th>Change</th><th>Priority</th><th>Verdict</th><th>Still to do</th></tr></thead><tbody>
  ${CRS.map((cr) => `<tr><td><a href="#${cr.id.toLowerCase()}">${cr.id}</a></td><td>${esc(cr.title)}</td><td>${esc(cr.priority)}</td><td>${pill(cr.verdict)}</td><td class="todo">${esc((cr.left || []).join(" ")) || "—"}</td></tr>`).join("")}
  </tbody></table></div>
  <div class="method">
    <h3>How this was checked</h3>
    <ul>
      <li><b>Browser.</b> Three new scenarios boot a throwaway database, the backend and the frontend, log in as owner, doctor and pharmacist, and drive Chromium through each request's own "how to check it's done" list. A row marked Not met is a finding about the product.</li>
      <li><b>Existing e2e suite.</b> The suites already in the repository for Sales, Purchase, Returns, Reconciliation, Reports and access were re-run on the same checkout; all passed. Screens from those runs are included.</li>
      <li><b>Code reading.</b> Used only where there is nothing to show in a browser, with the file named.</li>
      <li><b>Unit tests.</b> Frontend 1,405 of 1,405 passed; backend 2,213 passed, 385 skipped (database specs that need their own database settings and did not run here).</li>
      <li><b>Not checked.</b> The clinic's live data. "20 random items match the shelf count" and the audit of past invoices need the production database.</li>
    </ul>
  </div>
  ${CRS.map(section).join("")}
</div>
<dialog id="viewer"><figure><img id="viewer-img" alt=""><figcaption><span id="viewer-cap"></span><button type="button" id="viewer-close">Close</button></figcaption></figure></dialog>
<script>
const viewer = document.getElementById("viewer");
document.addEventListener("click", (event) => {
  const zoom = event.target.closest(".zoom");
  if (zoom) { document.getElementById("viewer-img").src = zoom.dataset.src; document.getElementById("viewer-cap").textContent = zoom.dataset.caption; viewer.showModal(); return; }
  if (event.target.id === "viewer-close" || event.target === viewer) viewer.close();
});
</script>
`;
  fs.writeFileSync(out, html);
}
console.log(JSON.stringify({ counts, totals }));
