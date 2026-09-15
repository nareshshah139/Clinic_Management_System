# Inventory workflow acceptance criteria

**42 features · 211 unchanged acceptance criteria · 50 existing code contracts + 2 implementation guards.**

This document maps the current local implementation to the supplied 12-page workflow specification. It records source support, focused tests, and local browser evidence separately. No feature is declared fully accepted on the strength of a source comment, a screenshot, or one passing fixture.

Baseline: `4586a3e2991edf66b7d2d1105edc81b835710798`. Source: `output/pdf/ps-dermatology-evitalrx-inventory-workflow.pdf`; SHA-256 `363600ccce5528f8a497d69b355d589ca01325e73b852d80e973d89c5500e3a4`. Review date: 2026-09-14; owner: nareshshah139. Criterion text/order SHA-256: `34bb5052fff37092dd363dd4d6320732fddcbe3a8af73e6dc348cff65b3671a1`. All 211 criteria and all 42 feature obligations remain unchanged. The working-tree implementation and 32 comment relocations are recorded in [relocation proof](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/contract-relocation-proof.json).

## Workspace structure

| Area | Active tasks |
|---|---|
| Today | Scoped action queues, pending receipts, returns, supplier dues, counts and replenishment setup. |
| Purchases | Invoice intake/review, retained originals, register, suppliers, payments/credits, exports and reports. |
| Stock | Search/filter, batch details/history, opening import, loss, holds, supplier returns, counts and labels. |
| Sales | Counter/customer sales, quotations, source-linked customer returns and refunds. |
| Reorder | Manual targets/exclusions, target proposals, Shortbook, supplier choice, POs, receipt context and monitoring. |

The [interactive workflow review](../prototypes/inventory-workflow-review.html) remains a design/acceptance artifact. The active application uses InventoryWorkspace and its named task components.

## Evidence and acceptance

A feature is accepted only when every criterion and relevant end-to-end fixture passes. Source support, narrow contract PASS and partial test evidence are not a full feature pass.

| Assessment | Meaning |
|---|---|
| SOURCE_SUPPORTED | Current active declarations support an implementation path; complete runtime acceptance is not claimed. |
| TARGETED_TEST_PARTIAL_EVIDENCE | Rendered or isolated PostgreSQL tests prove the stated cases; unexercised clauses remain open. |
| LOCAL_UI_PARTIAL_EVIDENCE | A named local browser interaction or account check is recorded; it is not independent database or staff acceptance. |
| LOCAL_UI_DB_PARTIAL_EVIDENCE | An agent-operated local browser flow and database proof cover named fixtures; this is not clinic-staff acceptance. |
| FAIL | A concrete source or runtime mismatch remains, with the exact evidence stated. |
| PARTIAL | Specific implementation or verification limits remain stated in the criterion evidence. |
| NOT_VERIFIED | Required empirical evidence is absent. |

Evidence references identify whether they are source, controlled component, local PostgreSQL, local browser screenshot, or combined browser/database proof. A screenshot confirms its displayed state; the corresponding database test must establish ledger effects. The original-photo and synthetic invoice proof verifies exact original downloads and no effects on duplicate retry. The generic workflow manifest identifies local synthetic documents and captured states.

## Recorded implementation policies

- A posted inward challan receives stock. A linked purchase bill records its accounting and cost basis without repeating that physical receipt. A gate pass is a reference/delivery document with no stock or payable effect. Partial PO balances count posted challans once, not the linked bill again.
- Paid plus free quantities are declared stock units. Pack/base equivalents require verified pack metadata. PTR, MRP, tax-exclusive MRP and recorded landing-cost bases stay separate; unknown historical bases remain unknown. Invoice MRP margin excludes GST, TCS and rounding and includes received free units.
- Holds change available quantity, not physical stock. Only their own source-linked disposal/return/release consumes the hold. Sales drafts and quotations do not reserve or post stock in this implementation; final confirmation revalidates current availability.
- Count APPROVAL mode holds every nonzero non-manager variance for a manager; zero variance posts without a stock effect. THRESHOLD mode uses the configured value and negative-variance rules. Manual target changes require explicit selected-row review, reason, and unchanged item/settings revisions. Exclusions apply to automatic target proposals; saved reorder levels continue to drive shortages.
- Automatic PO work creates approval drafts, never a fabricated sent order. Supplier transport is unconfigured; explicit send records SETUP_REQUIRED/FAILED. Gmail setup/fetch requires authorized connection; no external mailbox or supplier send was used in these tests.

| Operation/stage | Item stock | Supplier balance | Editing/correction |
|---|---|---|---|
| Upload/archive; OCR; purchase draft | None | None | Correct/retry, retain original |
| Purchase reviewed, not posted | None | None in posted ledger | Revalidate any changes |
| Purchase stock posted | Add paid + free units once | Record posted bill once | Linked correction/reversal |
| PO / Shortbook / forecast | None | None | Change with history; preserve receipts |
| Sales draft / quotation | No posted outflow | None | Editable; reservations shown separately if enabled |
| Confirmed dispense | Deduct allocated eligible batches once | None | Linked customer return/correction |
| Supplier-return Draft | None | None | Editable/deletable |
| Supplier-return Challan | Stock out once | None | Editable/deletable through delta/reversal |
| Final supplier-return invoice | Stock out once; no second outflow after Challan | Supplier credit once | Immutable; linked correction |
| Breakage/loss | Stock out once | None | Immutable; linked correction |
| Count requiring approval | None until approved | None | Visible pending review |
| Approved count adjustment | Signed delta once | None | Reason and before/after audit trail |
| Supplier payment/credit allocation | None | Adjust outstanding once | Auditable reversal |




## Feature contracts and criteria

### INV-01 — One inventory workspace

**Area:** Today · **PDF:** pages 1, 2, 11 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-workspace-navigation` — [InventoryWorkspace.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:81), declaration `export function InventoryWorkspace(`. Narrow assessment: **SOURCE_SUPPORTED**.

> The inventory workspace MUST expose named, reachable destinations for Today, Purchases, Stock, Sales and Reorder; the user MUST be able to return to the originating list without browser-only navigation.

**Current implementation:** InventoryWorkspace owns five URL-backed destinations, named task menus, source-aware back links and per-record recovery keys. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-01.1** — Five persistent destinations use the labels Today, Purchases, Stock, Sales and Reorder. Every component in this specification has a reachable named destination. **[SOURCE_SUPPORTED]**

  Evidence: InventoryWorkspace owns five URL-backed destinations, named task menus, source-aware back links and per-record recovery keys. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [InventoryWorkspace.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx), [today-queues.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/today-queues.png).

- **INV-01.2** — Opening a record shows an in-app Back to list action. It restores the originating search, filters, page and selected workflow area. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: InventoryWorkspace owns five URL-backed destinations, named task menus, source-aware back links and per-record recovery keys. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Ten Reorder component cases prove selected-row/revision/reason review, read-only controls, history, OPEN/search/date/GSTIN URL scope and full export, stale-response isolation, settings and receipt handoff. This is rendered interaction evidence, not live browser acceptance. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_BROWSER_SCREENSHOT. [InventoryWorkspace.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx), [reorder-ui-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/reorder-ui-tests.txt), [today-queues.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/today-queues.png).

- **INV-01.3** — Deep links, reload, browser Back and Forward restore the selected area and record. They do not silently open Supplier OCR instead. **[SOURCE_SUPPORTED]**

  Evidence: InventoryWorkspace owns five URL-backed destinations, named task menus, source-aware back links and per-record recovery keys. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [InventoryWorkspace.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx), [today-queues.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/today-queues.png).

- **INV-01.4** — Unsaved edits survive navigation or trigger a clear discard decision; switching invoices never applies one invoice’s draft to another. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: InventoryWorkspace owns five URL-backed destinations, named task menus, source-aware back links and per-record recovery keys. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_BROWSER_SCREENSHOT. [InventoryWorkspace.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt), [today-queues.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/today-queues.png).

- **INV-01.5** — Common tasks start within two navigation actions from the workspace: receive invoice, find batch, dispense, return, count and reorder. **[SOURCE_SUPPORTED]**

  Evidence: InventoryWorkspace owns five URL-backed destinations, named task menus, source-aware back links and per-record recovery keys. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [InventoryWorkspace.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx), [today-queues.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/today-queues.png).

### INV-02 — Daily work queue

**Area:** Today · **PDF:** pages 1, 11 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-daily-action-queues` — [InventoryWorkspace.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:488), declaration `function WorkspaceToday(`. Narrow assessment: **SOURCE_SUPPORTED**.

> The daily view MUST distinguish unresolved receipts, low stock, expiring stock, unfinished returns and overdue supplier balances, with each count opening its matching records.

**Current implementation:** WorkspaceToday loads branch-scoped overview queues and opens their matching URL filters; loading failure is separate from a zero result. Scheduler settings expose enabled state, owner and run history. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-02.1** — Start-of-day view lists unresolved uploads/drafts, low stock and expiring batches; close-of-day view includes unfinished returns and supplier dues. **[SOURCE_SUPPORTED]**

  Evidence: WorkspaceToday loads branch-scoped overview queues and opens their matching URL filters; loading failure is separate from a zero result. Scheduler settings expose enabled state, owner and run history. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [InventoryWorkspace.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx), [today-queues.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/today-queues.png).

- **INV-02.2** — Each queue shows its branch, date/filter scope, record count and next action. Opening the count yields exactly that scope. **[SOURCE_SUPPORTED]**

  Evidence: WorkspaceToday loads branch-scoped overview queues and opens their matching URL filters; loading failure is separate from a zero result. Scheduler settings expose enabled state, owner and run history. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [InventoryWorkspace.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx), [today-queues.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/today-queues.png).

- **INV-02.3** — An empty queue says No matching records; failed loading says Could not load with Retry. An error never displays a reassuring zero. **[SOURCE_SUPPORTED]**

  Evidence: WorkspaceToday loads branch-scoped overview queues and opens their matching URL filters; loading failure is separate from a zero result. Scheduler settings expose enabled state, owner and run history. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [InventoryWorkspace.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx), [today-queues.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/today-queues.png).

- **INV-02.4** — Completed work leaves the outstanding queue after authoritative reload; saved-but-unposted invoices stay visible as Stock not added. **[SOURCE_SUPPORTED]**

  Evidence: WorkspaceToday loads branch-scoped overview queues and opens their matching URL filters; loading failure is separate from a zero result. Scheduler settings expose enabled state, owner and run history. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [InventoryWorkspace.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx), [today-queues.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/today-queues.png).

- **INV-02.5** — Weekly counting and replenishment review appear with owner and due date once enabled; inactive automation is clearly labelled Off. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: WorkspaceToday loads branch-scoped overview queues and opens their matching URL filters; loading failure is separate from a zero result. Scheduler settings expose enabled state, owner and run history. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Ten Reorder component cases prove selected-row/revision/reason review, read-only controls, history, OPEN/search/date/GSTIN URL scope and full export, stale-response isolation, settings and receipt handoff. This is rendered interaction evidence, not live browser acceptance. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_BROWSER_SCREENSHOT. [InventoryWorkspace.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx), [reorder-ui-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/reorder-ui-tests.txt), [today-queues.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/today-queues.png).

### INV-03 — Stock search and filters

**Area:** Stock · **PDF:** pages 2, 10 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-filter-parity` — [WorkspaceStock.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:28), declaration `export function WorkspaceStock(`. Narrow assessment: **SOURCE_SUPPORTED**.

> The stock list MUST offer every documented inventory filter and distinguish an unapplied search, an empty result and a failed request; pagination MUST preserve the active filters.

**Current implementation:** WorkspaceStock and workspace.stock share item/code search, classification, quantity, expiry, audit, price, margin and mapping filters; pagination follows filtering and exports fetch all matching pages. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-03.1** — Search finds item name, SKU and barcode. A scanned barcode and the same typed barcode identify the same branch-scoped item. **[SOURCE_SUPPORTED]**

  Evidence: WorkspaceStock and workspace.stock share item/code search, classification, quantity, expiry, audit, price, margin and mapping filters; pagination follows filtering and exports fetch all matching pages. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [WorkspaceStock.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx), [stock-register.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-register.png).

- **INV-03.2** — Filters include expired/upcoming expiry, low/high/positive/zero/negative stock, category, dosage, schedule, GST, manufacturer, location, HSN, price and margin. **[SOURCE_SUPPORTED]**

  Evidence: WorkspaceStock and workspace.stock share item/code search, classification, quantity, expiry, audit, price, margin and mapping filters; pagination follows filtering and exports fetch all matching pages. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [WorkspaceStock.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx), [stock-register.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-register.png).

- **INV-03.3** — Audit/adjustment status filters include Pending, Completed and Blocked. Filter definitions and boundary dates are visible and consistent with results. **[SOURCE_SUPPORTED]**

  Evidence: WorkspaceStock and workspace.stock share item/code search, classification, quantity, expiry, audit, price, margin and mapping filters; pagination follows filtering and exports fetch all matching pages. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [WorkspaceStock.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx), [stock-register.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-register.png).

- **INV-03.4** — Apply filters, Clear filters, active filter chips, sort and pagination work together. Loading failure, no matching records and not-yet-applied filters are distinct. **[SOURCE_SUPPORTED]**

  Evidence: WorkspaceStock and workspace.stock share item/code search, classification, quantity, expiry, audit, price, margin and mapping filters; pagination follows filtering and exports fetch all matching pages. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [WorkspaceStock.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx), [stock-register.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-register.png).

- **INV-03.5** — Counts, sums and export scope cover all matching records, including records beyond page 1; no first-page number is labelled as the full inventory total. **[SOURCE_SUPPORTED]**

  Evidence: WorkspaceStock and workspace.stock share item/code search, classification, quantity, expiry, audit, price, margin and mapping filters; pagination follows filtering and exports fetch all matching pages. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [WorkspaceStock.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx), [stock-register.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-register.png).

### INV-04 — Item master and classification

**Area:** Stock · **PDF:** pages 2, 6, 11 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-master-not-balance` — [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:151), declaration `async saveItem(`. Narrow assessment: **SOURCE_SUPPORTED**.

> Editing item identity, classification, tax, pack or location MUST NOT implicitly change posted batch quantities or rewrite historical purchase prices.

**Current implementation:** workspace.saveItem performs revision-checked metadata edits, rejects conflicting SKU/barcode identity, preserves quantities/pack/historical prices and records actor/reason/before/after audit. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-04.1** — An item has name, optional manufacturer, strength/form where applicable, category, pack label and conversion, HSN, GST, location and replenishment settings. **[SOURCE_SUPPORTED]**

  Evidence: workspace.saveItem performs revision-checked metadata edits, rejects conflicting SKU/barcode identity, preserves quantities/pack/historical prices and records actor/reason/before/after audit. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts).

- **INV-04.2** — Medicines, cosmetics and consumables can be represented without inventing a drug strength or making manufacturer mandatory. **[SOURCE_SUPPORTED]**

  Evidence: workspace.saveItem performs revision-checked metadata edits, rejects conflicting SKU/barcode identity, preserves quantities/pack/historical prices and records actor/reason/before/after audit. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts).

- **INV-04.3** — Master identity, pack and standard price are visibly separate from batch-specific expiry, quantity and paid purchase prices. **[SOURCE_SUPPORTED]**

  Evidence: workspace.saveItem performs revision-checked metadata edits, rejects conflicting SKU/barcode identity, preserves quantities/pack/historical prices and records actor/reason/before/after audit. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts).

- **INV-04.4** — Changing master metadata does not alter historical invoices, posted quantities or historical batch price basis; affected future operations use a versioned audit trail. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: workspace.saveItem performs revision-checked metadata edits, rejects conflicting SKU/barcode identity, preserves quantities/pack/historical prices and records actor/reason/before/after audit. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen local PostgreSQL cases prove metadata CAS/audit rollback, exact product/pack grouping, unit equivalents, >100 source/hold history, UTC boundary eligibility, >200 expiry scope, and historical payment/credit cutoff reconciliation. Only those exercised clauses are evidenced.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts), [integrity-backend-gaps-db.json](/Users/nshah/Clinic_Management_System/output/diagnostics/integrity-backend-gaps-db.json).

- **INV-04.5** — Duplicate identity warnings distinguish same product/different batch from a duplicate master. Ambiguous identities are not merged silently. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: workspace.saveItem performs revision-checked metadata edits, rejects conflicting SKU/barcode identity, preserves quantities/pack/historical prices and records actor/reason/before/after audit. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen local PostgreSQL cases prove metadata CAS/audit rollback, exact product/pack grouping, unit equivalents, >100 source/hold history, UTC boundary eligibility, >200 expiry scope, and historical payment/credit cutoff reconciliation. Only those exercised clauses are evidenced.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts), [integrity-backend-gaps-db.json](/Users/nshah/Clinic_Management_System/output/diagnostics/integrity-backend-gaps-db.json).

### INV-05 — Data quality and location queues

**Area:** Stock · **PDF:** pages 2, 11 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-quality-complete-scope` — [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:40), declaration `async stock(`. Narrow assessment: **SOURCE_SUPPORTED**.

> Location and data-quality queues MUST include every eligible inventory category and page in their stated scope; separately scoped mapping counters MUST NOT be added together as one backlog.

**Current implementation:** workspace.stock computes data-quality and mapping states over every branch batch before pagination; reviewed bulkLocations records reason and per-item revisions without summing overlapping queues. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-05.1** — Missing location, min/max, category and HSN each opens a repairable queue with a defined denominator and current count. **[SOURCE_SUPPORTED]**

  Evidence: workspace.stock computes data-quality and mapping states over every branch batch before pagination; reviewed bulkLocations records reason and per-item revisions without summing overlapping queues. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts).

- **INV-05.2** — All relevant categories, including cosmetic invoice stock, and every server page contribute to the queue totals. **[SOURCE_SUPPORTED]**

  Evidence: workspace.stock computes data-quality and mapping states over every branch batch before pagination; reviewed bulkLocations records reason and per-item revisions without summing overlapping queues. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts).

- **INV-05.3** — Unmapped product rows and items waiting for mapping remain distinct when their scope differs; overlapping counts are not summed. **[SOURCE_SUPPORTED]**

  Evidence: workspace.stock computes data-quality and mapping states over every branch batch before pagination; reviewed bulkLocations records reason and per-item revisions without summing overlapping queues. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts).

- **INV-05.4** — Location can be assigned individually or in a reviewed bulk action. Refresh confirms the saved rack/shelf/bin and updates its queue. **[SOURCE_SUPPORTED]**

  Evidence: workspace.stock computes data-quality and mapping states over every branch batch before pagination; reviewed bulkLocations records reason and per-item revisions without summing overlapping queues. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts).

- **INV-05.5** — The sample PDF numbers (254/251/92/23 and 58/62) are test examples only; production counts are calculated, never hardcoded. **[SOURCE_SUPPORTED]**

  Evidence: workspace.stock computes data-quality and mapping states over every branch batch before pagination; reviewed bulkLocations records reason and per-item revisions without summing overlapping queues. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts).

### INV-06 — Item detail, batches and unit conversion

**Area:** Stock · **PDF:** pages 6, 7 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-item-batch-workspace` — [WorkspaceStock.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:35), declaration `export function WorkspaceStock(`. Narrow assessment: **SOURCE_SUPPORTED**.

> Opening an item MUST expose its batches and linked purchase, purchase-return, sale, sales-return, movement, blocked-stock and additional-information histories without losing item context.

**Current implementation:** WorkspaceStock item detail exposes named batch/document/ledger/hold views; workspace.item groups verified product identity and exact units/packs and preserves unmapped batches separately. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-06.1** — Item detail has Batches, Purchases, Purchase returns, Sales, Sales returns, Ledger, Blocked stock and Additional information views, plus a clear return to Stock. **[SOURCE_SUPPORTED]**

  Evidence: WorkspaceStock item detail exposes named batch/document/ledger/hold views; workspace.item groups verified product identity and exact units/packs and preserves unmapped batches separately. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [WorkspaceStock.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx), [item-history.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/item-history.png).

- **INV-06.2** — Each batch shows batch number, expiry, base-unit balance, pack-equivalent balance, location, MRP, PTR, landing price, margin and GST with units. **[SOURCE_SUPPORTED]**

  Evidence: WorkspaceStock item detail exposes named batch/document/ledger/hold views; workspace.item groups verified product identity and exact units/packs and preserves unmapped batches separately. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [WorkspaceStock.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx), [item-history.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/item-history.png).

- **INV-06.3** — Hide zero-stock batches is reversible and does not delete batches or their history. **[SOURCE_SUPPORTED]**

  Evidence: WorkspaceStock item detail exposes named batch/document/ledger/hold views; workspace.item groups verified product identity and exact units/packs and preserves unmapped batches separately. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [WorkspaceStock.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx), [item-history.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/item-history.png).

- **INV-06.4** — For a verified 10-tablet strip, 140 tablets displays as 14 strips. Paid and free packs convert once; unknown conversion blocks posting, rather than guessing. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: WorkspaceStock item detail exposes named batch/document/ledger/hold views; workspace.item groups verified product identity and exact units/packs and preserves unmapped batches separately. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen local PostgreSQL cases prove metadata CAS/audit rollback, exact product/pack grouping, unit equivalents, >100 source/hold history, UTC boundary eligibility, >200 expiry scope, and historical payment/credit cutoff reconciliation. Only those exercised clauses are evidenced. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [WorkspaceStock.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx), [integrity-backend-gaps-db.json](/Users/nshah/Clinic_Management_System/output/diagnostics/integrity-backend-gaps-db.json), [item-history.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/item-history.png).

- **INV-06.5** — GSH-like conflicting master and batch prices trigger a price-basis explanation/review; no code infers a conversion solely from the price ratio. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: WorkspaceStock item detail exposes named batch/document/ledger/hold views; workspace.item groups verified product identity and exact units/packs and preserves unmapped batches separately. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen local PostgreSQL cases prove metadata CAS/audit rollback, exact product/pack grouping, unit equivalents, >100 source/hold history, UTC boundary eligibility, >200 expiry scope, and historical payment/credit cutoff reconciliation. Only those exercised clauses are evidenced. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [WorkspaceStock.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx), [integrity-backend-gaps-db.json](/Users/nshah/Clinic_Management_System/output/diagnostics/integrity-backend-gaps-db.json), [item-history.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/item-history.png).

### INV-07 — Stock value and price basis

**Area:** Stock · **PDF:** pages 6, 11 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-valuation-basis` — [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:48), declaration `async stock(`. Narrow assessment: **SOURCE_SUPPORTED**.

> Stock valuation MUST state its price and quantity basis and separate current from expired stock; quantities in packs MUST NOT be multiplied by prices per base unit without conversion.

**Current implementation:** workspace.stock separates current and expired valuations in stock units; PTR/MRP/tax-exclusive MRP/known landing cost expose missing price or GST basis instead of inventing a conversion. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-07.1** — Current and expired stock have separate PTR, landing price, MRP and base-price views. Every amount states date, branch, tax treatment and unit basis. **[SOURCE_SUPPORTED]**

  Evidence: workspace.stock separates current and expired valuations in stock units; PTR/MRP/tax-exclusive MRP/known landing cost expose missing price or GST basis instead of inventing a conversion. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts).

- **INV-07.2** — For 14 packs at PTR 5112.36 per pack, PTR value is 71573.04; it is not 140 times the pack price. **[SOURCE_SUPPORTED]**

  Evidence: workspace.stock separates current and expired valuations in stock units; PTR/MRP/tax-exclusive MRP/known landing cost expose missing price or GST basis instead of inventing a conversion. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts).

- **INV-07.3** — For 10 units at cost 25, stock value is 250, not 10. Values cover the complete filtered set, not just visible rows. **[SOURCE_SUPPORTED]**

  Evidence: workspace.stock separates current and expired valuations in stock units; PTR/MRP/tax-exclusive MRP/known landing cost expose missing price or GST basis instead of inventing a conversion. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts).

- **INV-07.4** — Landing price, scheme/free-unit allocation, margin, rounding and base-price tax treatment have an explicit versioned formula and fixture tests before acceptance. **[SOURCE_SUPPORTED]**

  Evidence: workspace.stock separates current and expired valuations in stock units; PTR/MRP/tax-exclusive MRP/known landing cost expose missing price or GST basis instead of inventing a conversion. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts).

- **INV-07.5** — Unresolved price-basis discrepancies are shown as unresolved, not silently converted; the four historical dashboard amounts in the PDF are not assumed reconciled. **[SOURCE_SUPPORTED]**

  Evidence: workspace.stock separates current and expired valuations in stock units; PTR/MRP/tax-exclusive MRP/known landing cost expose missing price or GST basis instead of inventing a conversion. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts).

### INV-08 — Opening stock and migration

**Area:** Stock · **PDF:** pages 2, 10 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-opening-import-retry` — [inventory-import.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-import.service.ts:115), declaration `async importStarterExcel(`. Narrow assessment: **SOURCE_SUPPORTED**.

> Retrying an opening-stock import MUST NOT add its absolute opening quantities again; rejected rows MUST identify their worksheet row and leave that row’s inventory unchanged.

**Current implementation:** The named opening import has a retained-source preview and exact row errors; importStarterExcel persists one opening effect per accepted row and cannot reset an operating batch on retry. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-08.1** — Opening stock is a clearly named setup/import task distinct from receiving a supplier invoice; manual opening entry and migration/template upload are reachable. **[SOURCE_SUPPORTED]**

  Evidence: The named opening import has a retained-source preview and exact row errors; importStarterExcel persists one opening effect per accepted row and cannot reset an operating batch on retry. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [inventory-import.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-import.service.ts), [opening-stock.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/opening-stock.png).

- **INV-08.2** — Preview maps item identity, pack, batch, expiry, quantity, prices, tax, location and min/max and marks errors at the exact source row before posting. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: The named opening import has a retained-source preview and exact row errors; importStarterExcel persists one opening effect per accepted row and cannot reset an operating batch on retry. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Four local opening-import cases prove retained exact row errors, malformed/fractional rejection, concurrent retry idempotence, preserved operating stock and unknown cost; the complete template/mobile path has separate UI scope. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [inventory-import.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-import.service.ts), [opening-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/opening-db-results.json), [opening-stock.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/opening-stock.png).

- **INV-08.3** — One opening-stock ledger effect per accepted row records user, branch, import ID and source; it never creates a supplier payable. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: The named opening import has a retained-source preview and exact row errors; importStarterExcel persists one opening effect per accepted row and cannot reset an operating batch on retry. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Four local opening-import cases prove retained exact row errors, malformed/fractional rejection, concurrent retry idempotence, preserved operating stock and unknown cost; the complete template/mobile path has separate UI scope. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The parent-created browser guide documents were independently reconciled in read-only PostgreSQL at the proof timestamp:8/8 checks, 30 opening -1 loss -2 supplier return -3 sale +1 customer return =25 physical tubes and0 held; count25 has no stock delta. The exact document/effect/audit/source and credit records are retained. This is the named fixture snapshot, not every possible transition.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [inventory-import.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-import.service.ts), [opening-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/opening-db-results.json), [opening-stock.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/opening-stock.png), [workflow-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-proof.json).

- **INV-08.4** — Retry does not double stock. Duplicate same-item/same-batch rows are surfaced; partial success reports exactly which rows succeeded and which did not. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: The named opening import has a retained-source preview and exact row errors; importStarterExcel persists one opening effect per accepted row and cannot reset an operating batch on retry. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Four local opening-import cases prove retained exact row errors, malformed/fractional rejection, concurrent retry idempotence, preserved operating stock and unknown cost; the complete template/mobile path has separate UI scope. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [inventory-import.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-import.service.ts), [opening-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/opening-db-results.json), [opening-stock.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/opening-stock.png).

- **INV-08.5** — An existing operating batch cannot be silently reset by a repeated migration; changing its opening balance requires an explicit reconciliation/correction decision. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: The named opening import has a retained-source preview and exact row errors; importStarterExcel persists one opening effect per accepted row and cannot reset an operating batch on retry. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Four local opening-import cases prove retained exact row errors, malformed/fractional rejection, concurrent retry idempotence, preserved operating stock and unknown cost; the complete template/mobile path has separate UI scope. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [inventory-import.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-import.service.ts), [opening-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/opening-db-results.json), [opening-stock.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/opening-stock.png).

### INV-09 — Supplier selection and maintenance

**Area:** Purchases · **PDF:** pages 3, 4, 5 · **Feature acceptance:** PARTIAL

**Contract:** `purchase-supplier-inline-resolution` — [PurchaseSupplierReview.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseSupplierReview.tsx:15), declaration `export function PurchaseSupplierReview(`. Narrow assessment: **SOURCE_SUPPORTED**.

> An unmatched or ambiguous supplier MUST be selectable or verifiable in the invoice screen using its name and GSTIN; resolving it MUST preserve the invoice edits and original document.

**Current implementation:** PurchaseSupplierReview compares saved supplier name/GSTIN with the source, supports explicit verification, and retains invoice edits. SupplierWorkspace exposes branch supplier maintenance and accounts. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-09.1** — Invoice review shows extracted supplier name and GSTIN beside saved-supplier matches and a source link; similar names with different GSTINs remain distinct. **[SOURCE_SUPPORTED]**

  Evidence: PurchaseSupplierReview compares saved supplier name/GSTIN with the source, supports explicit verification, and retains invoice edits. SupplierWorkspace exposes branch supplier maintenance and accounts. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [PurchaseSupplierReview.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseSupplierReview.tsx).

- **INV-09.2** — A reviewer can select a saved supplier or verify/create supplier details on that same screen, subject to existing permissions. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: PurchaseSupplierReview compares saved supplier name/GSTIN with the source, supports explicit verification, and retains invoice edits. SupplierWorkspace exposes branch supplier maintenance and accounts. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST. [PurchaseSupplierReview.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseSupplierReview.tsx), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt).

- **INV-09.3** — Inactive, cross-branch, duplicate or ambiguous matches cannot silently qualify for automatic intake; the next corrective action is explicit. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: PurchaseSupplierReview compares saved supplier name/GSTIN with the source, supports explicit verification, and retains invoice edits. SupplierWorkspace exposes branch supplier maintenance and accounts. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen local PostgreSQL cases prove metadata CAS/audit rollback, exact product/pack grouping, unit equivalents, >100 source/hold history, UTC boundary eligibility, >200 expiry scope, and historical payment/credit cutoff reconciliation. Only those exercised clauses are evidenced.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST. [PurchaseSupplierReview.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseSupplierReview.tsx), [integrity-backend-gaps-db.json](/Users/nshah/Clinic_Management_System/output/diagnostics/integrity-backend-gaps-db.json).

- **INV-09.4** — Name/GSTIN corrections persist on Save & Process without clearing invoice lines, source links or other reviewed values. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: PurchaseSupplierReview compares saved supplier name/GSTIN with the source, supports explicit verification, and retains invoice edits. SupplierWorkspace exposes branch supplier maintenance and accounts. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST. [PurchaseSupplierReview.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseSupplierReview.tsx), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt).

- **INV-09.5** — Supplier account detail exposes contact/address, GSTIN/licences, active state, bills and dues. Deactivating a supplier preserves its historical documents. **[SOURCE_SUPPORTED]**

  Evidence: PurchaseSupplierReview compares saved supplier name/GSTIN with the source, supports explicit verification, and retains invoice edits. SupplierWorkspace exposes branch supplier maintenance and accounts. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [PurchaseSupplierReview.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseSupplierReview.tsx).

### INV-10 — Capture and retain originals

**Area:** Purchases · **PDF:** pages 3, 4, 5 · **Feature acceptance:** PARTIAL

**Contract:** `purchase-original-byte-retention` — [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:180), declaration `async archiveOriginal(`. Narrow assessment: **SOURCE_SUPPORTED**.

> An accepted invoice upload MUST retain the exact original bytes with branch, hash and file metadata before extraction; OCR failure MUST NOT discard the archived source.

**Current implementation:** archiveOriginal retains original bytes, SHA-256, branch/uploader and file metadata before extraction. Uploaded originals remain recoverable/downloadable after extraction failure and posting. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-10.1** — Mobile camera/photo selection and desktop photo/PDF upload accept every invoice page in order; several photos can belong to one invoice. **[SOURCE_SUPPORTED]**

  Evidence: archiveOriginal retains original bytes, SHA-256, branch/uploader and file metadata before extraction. Uploaded originals remain recoverable/downloadable after extraction failure and posting. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts), [invoice-stock-added.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-stock-added.png).

- **INV-10.2** — The exact original photo/PDF is retained with filename, MIME, byte size, hash, uploader, branch and timestamp; preview rotation never changes original bytes. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: archiveOriginal retains original bytes, SHA-256, branch/uploader and file metadata before extraction. Uploaded originals remain recoverable/downloadable after extraction failure and posting. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Nine purchase-actions DB cases cover exact retained bytes/access, 35-bill full export, PDF/QR/CSV/XLSX saved data, audit-failure rollback, original PO/gate-pass/challan links, unchanged posted stock on receipt-linked billing and recorded cost/net11600. This does not verify every photo or printed export device. Parent-operated local browser workflow plus DB proof verifies Eucerin SB-26-136543 (2 rows,9/7 stock,45602 net) and SOURCE-20 (20 rows,3 units each,2240 net), retained byte-identical originals and duplicate retry with no added effects. It is not proof of every supplied photo, every two-page geometry case or staff usability.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_AND_DB, LOCAL_BROWSER_SCREENSHOT. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts), [results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/results.json), [invoice-ui-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/invoice-ui-db-proof.json), [invoice-stock-added.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-stock-added.png).

- **INV-10.3** — OCR failure leaves a recoverable original upload with Retry extraction or Enter manually; the invoice is not claimed to be saved if only its file was archived. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: archiveOriginal retains original bytes, SHA-256, branch/uploader and file metadata before extraction. Uploaded originals remain recoverable/downloadable after extraction failure and posting. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination. Nine purchase-actions DB cases cover exact retained bytes/access, 35-bill full export, PDF/QR/CSV/XLSX saved data, audit-failure rollback, original PO/gate-pass/challan links, unchanged posted stock on receipt-linked billing and recorded cost/net11600. This does not verify every photo or printed export device.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt), [results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/results.json), [invoice-stock-added.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-stock-added.png).

- **INV-10.4** — Empty, corrupt, unsupported and oversized inputs produce an actionable error; extraction timeout remains distinguishable from a rejected file. **[SOURCE_SUPPORTED]**

  Evidence: archiveOriginal retains original bytes, SHA-256, branch/uploader and file metadata before extraction. Uploaded originals remain recoverable/downloadable after extraction failure and posting. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts), [invoice-stock-added.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-stock-added.png).

- **INV-10.5** — Originals remain downloadable after correction and posting. An unauthorized branch/user cannot retrieve or annotate another branch’s source. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: archiveOriginal retains original bytes, SHA-256, branch/uploader and file metadata before extraction. Uploaded originals remain recoverable/downloadable after extraction failure and posting. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Nine purchase-actions DB cases cover exact retained bytes/access, 35-bill full export, PDF/QR/CSV/XLSX saved data, audit-failure rollback, original PO/gate-pass/challan links, unchanged posted stock on receipt-linked billing and recorded cost/net11600. This does not verify every photo or printed export device. Parent-operated local browser workflow plus DB proof verifies Eucerin SB-26-136543 (2 rows,9/7 stock,45602 net) and SOURCE-20 (20 rows,3 units each,2240 net), retained byte-identical originals and duplicate retry with no added effects. It is not proof of every supplied photo, every two-page geometry case or staff usability.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_AND_DB, LOCAL_BROWSER_SCREENSHOT. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts), [results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/results.json), [invoice-ui-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/invoice-ui-db-proof.json), [invoice-stock-added.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-stock-added.png).

### INV-11 — OCR extraction and completeness

**Area:** Purchases · **PDF:** pages 4, 12 · **Feature acceptance:** PARTIAL

**Contract:** `purchase-ocr-completeness-before-auto` — [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:508), declaration `async extractDocumentDraft(`. Narrow assessment: **SOURCE_SUPPORTED**.

> OCR extraction MUST preserve all detected invoice rows and surface unreadable or disagreeing values as review issues; model confidence alone MUST NOT authorize stock posting.

**Current implementation:** extractDocumentDraft retains all detected lines and source order, marks incomplete/uncertain terms, and applies independent validation before automated posting; document text has no instruction authority. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-11.1** — Extract supplier identity, invoice/date/terms, all product rows, pack, batch, expiry, paid/free quantity, MRP/PTR, discount/scheme, tax and totals. **[SOURCE_SUPPORTED]**

  Evidence: extractDocumentDraft retains all detected lines and source order, marks incomplete/uncertain terms, and applies independent validation before automated posting; document text has no instruction authority. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts), [invoice-twenty-lines.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-twenty-lines.png).

- **INV-11.2** — A 20-item list and a 20-item two-page invoice return 20 distinct rows in source order, including repeated products on different batches and page-boundary rows. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: extractDocumentDraft retains all detected lines and source order, marks incomplete/uncertain terms, and applies independent validation before automated posting; document text has no instruction authority. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent-operated local browser workflow plus DB proof verifies Eucerin SB-26-136543 (2 rows,9/7 stock,45602 net) and SOURCE-20 (20 rows,3 units each,2240 net), retained byte-identical originals and duplicate retry with no added effects. It is not proof of every supplied photo, every two-page geometry case or staff usability. Parent browser proof selects Line20 Batch Number, opens retained PDF page2 and shows captured SRC-20 with source highlights. Rotation, every geometry shape and every mobile/keyboard path are not inferred from this single source selection.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_AND_DB, LOCAL_BROWSER_INTERACTION, LOCAL_BROWSER_SCREENSHOT. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts), [invoice-ui-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/invoice-ui-db-proof.json), [source-page-ui-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/source-page-ui-proof.json), [invoice-twenty-lines.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-twenty-lines.png).

- **INV-11.3** — Independent-read disagreements and unreadable/missing values remain explicit; derived values are distinguishable from directly printed values. **[SOURCE_SUPPORTED]**

  Evidence: extractDocumentDraft retains all detected lines and source order, marks incomplete/uncertain terms, and applies independent validation before automated posting; document text has no instruction authority. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts), [invoice-twenty-lines.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-twenty-lines.png).

- **INV-11.4** — An incomplete page, truncated response, unsupported date or total mismatch blocks automatic stock posting and offers a visible repair/retry action. **[SOURCE_SUPPORTED]**

  Evidence: extractDocumentDraft retains all detected lines and source order, marks incomplete/uncertain terms, and applies independent validation before automated posting; document text has no instruction authority. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts), [invoice-twenty-lines.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-twenty-lines.png).

- **INV-11.5** — Printed document text is treated as invoice data, not instructions to the application or OCR agent. No inferred manufacturer, bill type or unit is accepted without evidence or review. **[SOURCE_SUPPORTED]**

  Evidence: extractDocumentDraft retains all detected lines and source order, marks incomplete/uncertain terms, and applies independent validation before automated posting; document text has no instruction authority. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts), [invoice-twenty-lines.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-twenty-lines.png).

### INV-12 — Linked source image and PDF review

**Area:** Purchases · **PDF:** pages 4, 5 · **Feature acceptance:** PARTIAL

**Contract:** `purchase-source-links-honest` — [PurchaseSourcePreview.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseSourcePreview.tsx:49), declaration `export function PurchaseSourcePreview(`. Narrow assessment: **SOURCE_SUPPORTED**.

> A source link MUST navigate to the matching retained page and estimated region; missing or ambiguous geometry MUST say that no reliable location is available, and MUST NOT replace invoice values.

**Current implementation:** PurchaseSourcePreview renders retained pages/estimated regions and explicitly unknown geometry. Invoice fields retain source identity and original values after edits and after posting. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-12.1** — Clicking an extracted header or line value reveals its original page and highlighted region; clicking a region focuses the matching field. **[LOCAL_UI_PARTIAL_EVIDENCE]**

  Evidence: PurchaseSourcePreview renders retained pages/estimated regions and explicitly unknown geometry. Invoice fields retain source identity and original values after edits and after posting. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser proof selects Line20 Batch Number, opens retained PDF page2 and shows captured SRC-20 with source highlights. Rotation, every geometry shape and every mobile/keyboard path are not inferred from this single source selection.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_INTERACTION, LOCAL_BROWSER_SCREENSHOT. [PurchaseSourcePreview.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseSourcePreview.tsx), [source-page-ui-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/source-page-ui-proof.json), [invoice-review.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-review.png), [invoice-twenty-lines.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-twenty-lines.png).

- **INV-12.2** — Zoom, rotation and page selection preserve alignment. Reordering/deleting invoice lines cannot move a source link to another batch. **[SOURCE_SUPPORTED]**

  Evidence: PurchaseSourcePreview renders retained pages/estimated regions and explicitly unknown geometry. Invoice fields retain source identity and original values after edits and after posting. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [PurchaseSourcePreview.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseSourcePreview.tsx), [invoice-review.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-review.png), [invoice-twenty-lines.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-twenty-lines.png).

- **INV-12.3** — Missing, derived or uncertain locations display No reliable printed location; an approximate box is labelled estimated rather than exact OCR truth. **[SOURCE_SUPPORTED]**

  Evidence: PurchaseSourcePreview renders retained pages/estimated regions and explicitly unknown geometry. Invoice fields retain source identity and original values after edits and after posting. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [PurchaseSourcePreview.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseSourcePreview.tsx), [invoice-review.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-review.png), [invoice-twenty-lines.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-twenty-lines.png).

- **INV-12.4** — Edited values keep their original captured value/source context. Source navigation remains usable after stock commit when editing is locked. **[LOCAL_UI_PARTIAL_EVIDENCE]**

  Evidence: PurchaseSourcePreview renders retained pages/estimated regions and explicitly unknown geometry. Invoice fields retain source identity and original values after edits and after posting. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser proof selects Line20 Batch Number, opens retained PDF page2 and shows captured SRC-20 with source highlights. Rotation, every geometry shape and every mobile/keyboard path are not inferred from this single source selection.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_INTERACTION, LOCAL_BROWSER_SCREENSHOT. [PurchaseSourcePreview.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseSourcePreview.tsx), [source-page-ui-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/source-page-ui-proof.json), [invoice-review.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-review.png), [invoice-twenty-lines.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-twenty-lines.png).

- **INV-12.5** — On desktop the form and source can be compared side by side; on mobile a persistent source action returns to the same field without losing edits. **[SOURCE_SUPPORTED]**

  Evidence: PurchaseSourcePreview renders retained pages/estimated regions and explicitly unknown geometry. Invoice fields retain source identity and original values after edits and after posting. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [PurchaseSourcePreview.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseSourcePreview.tsx), [invoice-review.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-review.png), [invoice-twenty-lines.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-twenty-lines.png).

### INV-13 — Product matching and pack identity

**Area:** Purchases · **PDF:** pages 4, 6 · **Feature acceptance:** PARTIAL

**Contract:** `purchase-match-identity-before-stock` — [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:602), declaration `async confirmMasterRecord(`. Narrow assessment: **SOURCE_SUPPORTED**.

> A purchase line MUST NOT be automatically mapped to a different product strength, form, pack or branch; ambiguous matches MUST require an explicit reviewer selection.

**Current implementation:** confirmMasterRecord applies branch, active identity, strength/form and pack checks; ambiguous matches require explicit selection. Manufacturer remains optional across manual/catalog/posting paths. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-13.1** — Review candidates compare printed product, strength/form where relevant, pack, classification and batch context, not name similarity alone. **[SOURCE_SUPPORTED]**

  Evidence: confirmMasterRecord applies branch, active identity, strength/form and pack checks; ambiguous matches require explicit selection. Manufacturer remains optional across manual/catalog/posting paths. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts).

- **INV-13.2** — Automatic matching requires one compatible active product in the current branch. Ambiguous matches block auto-posting. **[SOURCE_SUPPORTED]**

  Evidence: confirmMasterRecord applies branch, active identity, strength/form and pack checks; ambiguous matches require explicit selection. Manufacturer remains optional across manual/catalog/posting paths. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts).

- **INV-13.3** — Reviewer can choose or create the correct medicine/cosmetic/consumable in the same invoice screen and return to the exact unresolved row. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: confirmMasterRecord applies branch, active identity, strength/form and pack checks; ambiguous matches require explicit selection. Manufacturer remains optional across manual/catalog/posting paths. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt).

- **INV-13.4** — Manufacturer is optional in creation, saving, review and commit. Missing manufacturer never becomes a hidden blocker. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: confirmMasterRecord applies branch, active identity, strength/form and pack checks; ambiguous matches require explicit selection. Manufacturer remains optional across manual/catalog/posting paths. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt).

- **INV-13.5** — The selected product and verified pack conversion persist after save/reload and are the identity used for inventory and subsequent dispensing. **[SOURCE_SUPPORTED]**

  Evidence: confirmMasterRecord applies branch, active identity, strength/form and pack checks; ambiguous matches require explicit selection. Manufacturer remains optional across manual/catalog/posting paths. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts).

### INV-14 — Complete manual purchase entry

**Area:** Purchases · **PDF:** pages 3, 5 · **Feature acceptance:** PARTIAL

**Contract:** `purchase-entry-field-coverage` — [PurchaseInvoiceWorkbench.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:977), declaration `function PurchaseInvoiceEditor(`. Narrow assessment: **SOURCE_SUPPORTED**.

> The purchase editor MUST retain the supplier header, batch receipt quantities and commercial terms needed to reconstruct the printed bill; unsupported printed terms MUST be shown as unresolved instead of discarded.

**Current implementation:** PurchaseInvoiceEditor retains printed headers/row commercial terms and separate reported totals; its footer totals paid/free/received stock units and states tax-exclusive indicative MRP margin. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-14.1** — Header supports supplier, invoice/bill number, order reference, invoice date, received date, due date, staff/entered-by and payment/bill terms. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: PurchaseInvoiceEditor retains printed headers/row commercial terms and separate reported totals; its footer totals paid/free/received stock units and states tax-exclusive indicative MRP margin. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_BROWSER_SCREENSHOT. [PurchaseInvoiceWorkbench.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt), [purchase-intake.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-intake.png).

- **INV-14.2** — Rows support item, batch, expiry, pack/unit, paid quantity, free quantity, MRP, PTR/purchase rate, scheme amount, discounts, taxable base, GST and total. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: PurchaseInvoiceEditor retains printed headers/row commercial terms and separate reported totals; its footer totals paid/free/received stock units and states tax-exclusive indicative MRP margin. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_BROWSER_SCREENSHOT. [PurchaseInvoiceWorkbench.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt), [purchase-intake.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-intake.png).

- **INV-14.3** — Footer shows row/item count, paid/free quantities, taxable value, GST, adjustments/rounding, net and margin with a stated basis. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: PurchaseInvoiceEditor retains printed headers/row commercial terms and separate reported totals; its footer totals paid/free/received stock units and states tax-exclusive indicative MRP margin. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_BROWSER_SCREENSHOT. [PurchaseInvoiceWorkbench.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt), [purchase-intake.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-intake.png).

- **INV-14.4** — Header/row edits immediately recompute derived totals while preserving original reported totals for comparison; no unsupported term is silently dropped. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: PurchaseInvoiceEditor retains printed headers/row commercial terms and separate reported totals; its footer totals paid/free/received stock units and states tax-exclusive indicative MRP margin. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_BROWSER_SCREENSHOT. [PurchaseInvoiceWorkbench.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt), [purchase-intake.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-intake.png).

- **INV-14.5** — Reproduce PDF bill SB-26-43742: 10 x 983.05 = 9830.50 taxable, 1769.49 GST, 11599.99 before rounding and 11600 net, batch WWD0040, expiry 02/28. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: PurchaseInvoiceEditor retains printed headers/row commercial terms and separate reported totals; its footer totals paid/free/received stock units and states tax-exclusive indicative MRP margin. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Nine purchase-actions DB cases cover exact retained bytes/access, 35-bill full export, PDF/QR/CSV/XLSX saved data, audit-failure rollback, original PO/gate-pass/challan links, unchanged posted stock on receipt-linked billing and recorded cost/net11600. This does not verify every photo or printed export device.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [PurchaseInvoiceWorkbench.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx), [results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/results.json), [purchase-intake.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-intake.png).

### INV-15 — Reconciliation and human review

**Area:** Purchases · **PDF:** pages 3, 4, 6 · **Feature acceptance:** PARTIAL

**Contract:** `purchase-review-blockers-enforced` — [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:1025), declaration `async markReviewed(`. Narrow assessment: **SOURCE_SUPPORTED**.

> Review MUST reject unresolved OCR flags, unreconciled totals or missing receipt details even when invoked directly through the API; saving a draft MUST NOT count as resolving those issues.

**Current implementation:** markReviewed revalidates required receipt details, OCR flags and reconciliation. In-page acknowledgements resolve supported uncertainties; saving incomplete intake does not authorize stock. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-15.1** — Every blocking issue has a visible field link, correction control or explicit evidence-based acknowledgement on the same page; required controls are not hidden in collapsed sections. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: markReviewed revalidates required receipt details, OCR flags and reconciliation. In-page acknowledgements resolve supported uncertainties; saving incomplete intake does not authorize stock. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt).

- **INV-15.2** — Duplicate OCR/AUTO versions of the same issue appear once. Unresolvable issues offer recapture/manual entry or a clear explanation, not a dead-end button. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: markReviewed revalidates required receipt details, OCR flags and reconciliation. In-page acknowledgements resolve supported uncertainties; saving incomplete intake does not authorize stock. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt).

- **INV-15.3** — APPROVAL BILLS remains uncertain until a reviewer establishes bill terms; the application does not default it silently to Cash or Credit. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: markReviewed revalidates required receipt details, OCR flags and reconciliation. In-page acknowledgements resolve supported uncertainties; saving incomplete intake does not authorize stock. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt).

- **INV-15.4** — Physical received paid/free quantities, pack conversion, batch and expiry are verified against the actual receipt before posting; discrepancies remain reviewable. **[SOURCE_SUPPORTED]**

  Evidence: markReviewed revalidates required receipt details, OCR flags and reconciliation. In-page acknowledgements resolve supported uncertainties; saving incomplete intake does not authorize stock. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts).

- **INV-15.5** — Direct API review with unresolved flags, totals or missing required receipt details fails without posting stock. Clearing a flag without resolving its underlying invalid value does not pass validation. **[SOURCE_SUPPORTED]**

  Evidence: markReviewed revalidates required receipt details, OCR flags and reconciliation. In-page acknowledgements resolve supported uncertainties; saving incomplete intake does not authorize stock. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts).

### INV-16 — One primary save and process action

**Area:** Purchases · **PDF:** pages 4 · **Feature acceptance:** PARTIAL

**Contract:** `purchase-process-visible-outcome` — [PurchaseInvoiceWorkbench.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:1694), declaration `const processSavedInvoice = async () => {`. Narrow assessment: **SOURCE_SUPPORTED**.

> Save & Process MUST save the current corrections and then show the server-confirmed outcome for that invoice: stock added, saved with actionable blockers, or status could not be confirmed.

**Current implementation:** processSavedInvoice saves the current invoice before processing, presents authoritative saved/posted/blocker outcomes and recovers uncertain responses using the actual saved ID. Review consent is explicit. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-16.1** — One context-sensitive primary button saves current corrections and advances only as validation permits. Incomplete review fields can persist in an unposted server draft without invented defaults; there is no competing Save Corrections action. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: processSavedInvoice saves the current invoice before processing, presents authoritative saved/posted/blocker outcomes and recovers uncertain responses using the actual saved ID. Review consent is explicit. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_BROWSER_SCREENSHOT. [PurchaseInvoiceWorkbench.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt), [invoice-stock-added.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-stock-added.png).

- **INV-16.2** — Valid high-confidence intake saves and commits automatically. Human-verified exceptions can complete review and commit through the same page without navigation to another tool. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: processSavedInvoice saves the current invoice before processing, presents authoritative saved/posted/blocker outcomes and recovers uncertain responses using the actual saved ID. Review consent is explicit. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination. Parent-operated local browser workflow plus DB proof verifies Eucerin SB-26-136543 (2 rows,9/7 stock,45602 net) and SOURCE-20 (20 rows,3 units each,2240 net), retained byte-identical originals and duplicate retry with no added effects. It is not proof of every supplied photo, every two-page geometry case or staff usability.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_BROWSER_AND_DB, LOCAL_BROWSER_SCREENSHOT. [PurchaseInvoiceWorkbench.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt), [invoice-ui-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/invoice-ui-db-proof.json), [invoice-stock-added.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-stock-added.png).

- **INV-16.3** — Button copy states its current consequence: Save & Process, Review & Add stock, or Stock added. Optional Save draft is a secondary action with Stock not added wording. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: processSavedInvoice saves the current invoice before processing, presents authoritative saved/posted/blocker outcomes and recovers uncertain responses using the actual saved ID. Review consent is explicit. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_BROWSER_SCREENSHOT. [PurchaseInvoiceWorkbench.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt), [invoice-stock-added.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-stock-added.png).

- **INV-16.4** — After processing, persistent feedback names the invoice, saved state, blocking reason or added quantities, and links to resulting batches. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: processSavedInvoice saves the current invoice before processing, presents authoritative saved/posted/blocker outcomes and recovers uncertain responses using the actual saved ID. Review consent is explicit. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination. Parent-operated local browser workflow plus DB proof verifies Eucerin SB-26-136543 (2 rows,9/7 stock,45602 net) and SOURCE-20 (20 rows,3 units each,2240 net), retained byte-identical originals and duplicate retry with no added effects. It is not proof of every supplied photo, every two-page geometry case or staff usability.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_BROWSER_AND_DB, LOCAL_BROWSER_SCREENSHOT. [PurchaseInvoiceWorkbench.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt), [invoice-ui-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/invoice-ui-db-proof.json), [invoice-stock-added.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-stock-added.png).

- **INV-16.5** — Double clicks, retries and uncertain network responses cannot create a second invoice/receipt. An unconfirmed response triggers status lookup rather than a success guess. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: processSavedInvoice saves the current invoice before processing, presents authoritative saved/posted/blocker outcomes and recovers uncertain responses using the actual saved ID. Review consent is explicit. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination. Parent-operated local browser workflow plus DB proof verifies Eucerin SB-26-136543 (2 rows,9/7 stock,45602 net) and SOURCE-20 (20 rows,3 units each,2240 net), retained byte-identical originals and duplicate retry with no added effects. It is not proof of every supplied photo, every two-page geometry case or staff usability.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_BROWSER_AND_DB, LOCAL_BROWSER_SCREENSHOT. [PurchaseInvoiceWorkbench.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt), [invoice-ui-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/invoice-ui-db-proof.json), [invoice-stock-added.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-stock-added.png).

### INV-17 — Transactional receipt posting

**Area:** Purchases · **PDF:** pages 4, 5, 7 · **Feature acceptance:** PARTIAL

**Contract:** `purchase-commit-once-atomic` — [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:1108), declaration `async commitStock(`. Narrow assessment: **SOURCE_SUPPORTED**.

> A validated purchase receipt MUST atomically create its batch stock effects and posted invoice state at most once; retries or a failure partway through MUST NOT duplicate or partially add stock.

**Current implementation:** commitStock serializes validated receipt posting and line links with stock movements, recorded stock-unit quantities/cost basis, posted state and audit; receipt-linked billing does not repeat challan stock. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-17.1** — Only a valid reviewed receipt or a fully validated automatic intake may add stock, with authenticated user and branch recorded. **[SOURCE_SUPPORTED]**

  Evidence: commitStock serializes validated receipt posting and line links with stock movements, recorded stock-unit quantities/cost basis, posted state and audit; receipt-linked billing does not repeat challan stock. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts).

- **INV-17.2** — Paid plus free quantities are converted once into each correct item/batch balance; purchase movement references the invoice, source and conversion used. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: commitStock serializes validated receipt posting and line links with stock movements, recorded stock-unit quantities/cost basis, posted state and audit; receipt-linked billing does not repeat challan stock. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Nine purchase-actions DB cases cover exact retained bytes/access, 35-bill full export, PDF/QR/CSV/XLSX saved data, audit-failure rollback, original PO/gate-pass/challan links, unchanged posted stock on receipt-linked billing and recorded cost/net11600. This does not verify every photo or printed export device. Parent-operated local browser workflow plus DB proof verifies Eucerin SB-26-136543 (2 rows,9/7 stock,45602 net) and SOURCE-20 (20 rows,3 units each,2240 net), retained byte-identical originals and duplicate retry with no added effects. It is not proof of every supplied photo, every two-page geometry case or staff usability. The parent-operated local linked-receipt browser flow and database check verify that the linked bill leaves physical stock at 9 and movement count at 3, while its PO records 6 received and 0 remaining. This named fixture supports receipt linkage without a duplicate stock effect; it does not alone prove every cancellation, failed request or overdelivery path.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_AND_DB. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts), [results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/results.json), [invoice-ui-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/invoice-ui-db-proof.json), [linked-receipt-ui-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/linked-receipt-ui-db-proof.json).

- **INV-17.3** — Invoice posted state, all inventory changes and all purchase movements commit together or roll back together under injected failure. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: commitStock serializes validated receipt posting and line links with stock movements, recorded stock-unit quantities/cost basis, posted state and audit; receipt-linked billing does not repeat challan stock. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Nine purchase-actions DB cases cover exact retained bytes/access, 35-bill full export, PDF/QR/CSV/XLSX saved data, audit-failure rollback, original PO/gate-pass/challan links, unchanged posted stock on receipt-linked billing and recorded cost/net11600. This does not verify every photo or printed export device.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts), [results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/results.json).

- **INV-17.4** — Two concurrent process/commit requests and a retry after a lost response produce one receipt effect; reload displays the authoritative posted state and quantities. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: commitStock serializes validated receipt posting and line links with stock movements, recorded stock-unit quantities/cost basis, posted state and audit; receipt-linked billing does not repeat challan stock. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Nine purchase-actions DB cases cover exact retained bytes/access, 35-bill full export, PDF/QR/CSV/XLSX saved data, audit-failure rollback, original PO/gate-pass/challan links, unchanged posted stock on receipt-linked billing and recorded cost/net11600. This does not verify every photo or printed export device. Parent-operated local browser workflow plus DB proof verifies Eucerin SB-26-136543 (2 rows,9/7 stock,45602 net) and SOURCE-20 (20 rows,3 units each,2240 net), retained byte-identical originals and duplicate retry with no added effects. It is not proof of every supplied photo, every two-page geometry case or staff usability.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_AND_DB. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts), [results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/results.json), [invoice-ui-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/invoice-ui-db-proof.json).

- **INV-17.5** — For the original Eucerin bill, verify two batches with 9 and 7 total packs and invoice net 45602 in an isolated fixture. No production stock is modified by acceptance tests. **[TARGETED_TEST_PASS]**

  Follow-up: Production-readiness follow-up 2026-09-14: the fresh full-backend/browser run retained two batches, 9 and 7 received units and net 45602, but both explicit Pack selections were stored as BOTTLES because 30ML overrides the stock-unit choice. INV-17.5 therefore fails its total-packs requirement until the mapper is corrected. See output/diagnostics/inventory-production-readiness/declared-unit-check.json and docs/qa/inventory-production-readiness-2026-09-14.md. No production stock was modified.

  Follow-up 2026-09-15: corrected recognized explicit-unit precedence. A new isolated branch uploaded the original Eucerin photo through the built UI and full backend with real OCR, completed same-screen supplier/product/payment/unit review, and committed two batches as 9 and 7 PACKS with net 45602. Original bytes matched, three processing retries added no stock, and a UI reload displayed Stock added. See output/diagnostics/inventory-production-readiness/unit-fix/unit-fix-proof.json. The previous failed run is retained as historical evidence; production stock remains untouched.

  Evidence: commitStock serializes validated receipt posting and line links with stock movements, recorded stock-unit quantities/cost basis, posted state and audit; receipt-linked billing does not repeat challan stock. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent-operated local browser workflow plus DB proof verifies Eucerin SB-26-136543 (2 rows,9/7 stock,45602 net) and SOURCE-20 (20 rows,3 units each,2240 net), retained byte-identical originals and duplicate retry with no added effects. It is not proof of every supplied photo, every two-page geometry case or staff usability.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_AND_DB. [pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts), [invoice-ui-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/invoice-ui-db-proof.json).

### INV-18 — Purchase register and draft recovery

**Area:** Purchases · **PDF:** pages 3, 4, 5 · **Feature acceptance:** PARTIAL

**Contract:** `purchase-register-complete` — [InventoryWorkspace.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:684), declaration `function PurchaseRegister(`. Narrow assessment: **SOURCE_SUPPORTED**.

> The purchase register MUST allow retrieval of every authorized saved invoice and unfinished upload, including records beyond the recent-preview limit, with status and source retained.

**Current implementation:** PurchaseRegister fetches the full authorized register through search/date/status/source pagination and full export. Per-invoice editor recovery and unfinished-upload intake are separate from the recent preview. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-18.1** — Register searches by bill number and supplier and filters date, status and intake channel with pagination across all saved invoices. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: PurchaseRegister fetches the full authorized register through search/date/status/source pagination and full export. Per-invoice editor recovery and unfinished-upload intake are separate from the recent preview. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Nine purchase-actions DB cases cover exact retained bytes/access, 35-bill full export, PDF/QR/CSV/XLSX saved data, audit-failure rollback, original PO/gate-pass/challan links, unchanged posted stock on receipt-linked billing and recorded cost/net11600. This does not verify every photo or printed export device. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [InventoryWorkspace.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx), [results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/results.json), [purchase-register.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-register.png).

- **INV-18.2** — Draft, OCR review required, reconciliation failed, reviewed, stock added and cancelled are distinct; stock effect is stated in words. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: PurchaseRegister fetches the full authorized register through search/date/status/source pagination and full export. Per-invoice editor recovery and unfinished-upload intake are separate from the recent preview. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_BROWSER_SCREENSHOT. [InventoryWorkspace.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt), [purchase-register.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-register.png).

- **INV-18.3** — Unfinished original uploads and server drafts are recoverable after logout/browser restart; more than 8 invoices or 20 uploads remain discoverable. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: PurchaseRegister fetches the full authorized register through search/date/status/source pagination and full export. Per-invoice editor recovery and unfinished-upload intake are separate from the recent preview. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_BROWSER_SCREENSHOT. [InventoryWorkspace.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt), [purchase-register.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-register.png).

- **INV-18.4** — Opening, correcting and returning to the register preserves selected filters and position; duplicate candidates link to the existing invoice. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: PurchaseRegister fetches the full authorized register through search/date/status/source pagination and full export. Per-invoice editor recovery and unfinished-upload intake are separate from the recent preview. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_BROWSER_SCREENSHOT. [InventoryWorkspace.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt), [purchase-register.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-register.png).

- **INV-18.5** — Register exports the chosen full result set with totals and status. A notification opens the exact saved record rather than a blank OCR form. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: PurchaseRegister fetches the full authorized register through search/date/status/source pagination and full export. Per-invoice editor recovery and unfinished-upload intake are separate from the recent preview. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Nine purchase-actions DB cases cover exact retained bytes/access, 35-bill full export, PDF/QR/CSV/XLSX saved data, audit-failure rollback, original PO/gate-pass/challan links, unchanged posted stock on receipt-linked billing and recorded cost/net11600. This does not verify every photo or printed export device. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [InventoryWorkspace.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx), [results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/results.json), [purchase-register.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-register.png).

### INV-19 — PO, gate pass and inward challan links

**Area:** Purchases · **PDF:** pages 3, 12 · **Feature acceptance:** PARTIAL

**Contract:** `purchase-related-document-links` — [PurchaseDocumentActions.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/PurchaseDocumentActions.tsx:30), declaration `export function PurchaseDocumentActions(`. Narrow assessment: **SOURCE_SUPPORTED**.

> The purchase editor MUST expose linked purchase orders, gate passes and inward challans with each document’s receipt status, so converting a previously received document cannot add the same stock twice.

**Current implementation:** PurchaseDocumentActions traverses linked PO/gate-pass/challan sources with statuses. The editor receives a posted challan context; purchase billing preserves its already-received stock while recording the bill. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-19.1** — A receipt can link an approved PO, gate pass or inward challan, and each linked document is viewable without losing invoice work. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: PurchaseDocumentActions traverses linked PO/gate-pass/challan sources with statuses. The editor receives a posted challan context; purchase billing preserves its already-received stock while recording the bill. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Nine purchase-actions DB cases cover exact retained bytes/access, 35-bill full export, PDF/QR/CSV/XLSX saved data, audit-failure rollback, original PO/gate-pass/challan links, unchanged posted stock on receipt-linked billing and recorded cost/net11600. This does not verify every photo or printed export device.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [PurchaseDocumentActions.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/PurchaseDocumentActions.tsx), [results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/results.json), [purchase-order.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-order.png), [inward-challan.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/inward-challan.png).

- **INV-19.2** — Expected, physically received, previously posted and remaining quantities are distinct; partial receipts do not mark the whole order received. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: PurchaseDocumentActions traverses linked PO/gate-pass/challan sources with statuses. The editor receives a posted challan context; purchase billing preserves its already-received stock while recording the bill. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs. The parent-operated local linked-receipt browser flow and database check verify that the linked bill leaves physical stock at 9 and movement count at 3, while its PO records 6 received and 0 remaining. This named fixture supports receipt linkage without a duplicate stock effect; it does not alone prove every cancellation, failed request or overdelivery path.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [PurchaseDocumentActions.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/PurchaseDocumentActions.tsx), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json), [purchase-order.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-order.png), [inward-challan.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/inward-challan.png), [linked-receipt-ui-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/linked-receipt-ui-db-proof.json).

- **INV-19.3** — Converting an inward challan to an invoice posts only any not-yet-posted stock delta and establishes the bill/accounting effect once. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: PurchaseDocumentActions traverses linked PO/gate-pass/challan sources with statuses. The editor receives a posted challan context; purchase billing preserves its already-received stock while recording the bill. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Nine purchase-actions DB cases cover exact retained bytes/access, 35-bill full export, PDF/QR/CSV/XLSX saved data, audit-failure rollback, original PO/gate-pass/challan links, unchanged posted stock on receipt-linked billing and recorded cost/net11600. This does not verify every photo or printed export device. The parent-operated local linked-receipt browser flow and database check verify that the linked bill leaves physical stock at 9 and movement count at 3, while its PO records 6 received and 0 remaining. This named fixture supports receipt linkage without a duplicate stock effect; it does not alone prove every cancellation, failed request or overdelivery path.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [PurchaseDocumentActions.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/PurchaseDocumentActions.tsx), [results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/results.json), [purchase-order.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-order.png), [inward-challan.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/inward-challan.png), [linked-receipt-ui-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/linked-receipt-ui-db-proof.json).

- **INV-19.4** — The UI explains which document stage changes stock and supplier dues before submission; a reference-only gate pass does not quietly post stock. **[SOURCE_SUPPORTED]**

  Evidence: PurchaseDocumentActions traverses linked PO/gate-pass/challan sources with statuses. The editor receives a posted challan context; purchase billing preserves its already-received stock while recording the bill. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [PurchaseDocumentActions.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/PurchaseDocumentActions.tsx), [purchase-order.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-order.png), [inward-challan.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/inward-challan.png).

- **INV-19.5** — Inward-challan/gate-pass posting policy is recorded explicitly before implementation acceptance; the PDF observed controls but did not verify their posting rules. **[SOURCE_SUPPORTED]**

  Evidence: PurchaseDocumentActions traverses linked PO/gate-pass/challan sources with statuses. The editor receives a posted challan context; purchase billing preserves its already-received stock while recording the bill. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [PurchaseDocumentActions.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/PurchaseDocumentActions.tsx), [purchase-order.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-order.png), [inward-challan.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/inward-challan.png).

### INV-20 — Purchase document actions and audit trail

**Area:** Purchases · **PDF:** pages 5, 6 · **Feature acceptance:** PARTIAL

**Contract:** `purchase-posted-correction-traceable` — [PurchaseDocumentActions.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/PurchaseDocumentActions.tsx:38), declaration `export function PurchaseDocumentActions(`. Narrow assessment: **SOURCE_SUPPORTED**.

> A posted purchase MUST retain its original receipt history; corrections MUST link a reversal or amendment rather than silently editing or deleting its recorded stock effect.

**Current implementation:** PurchaseDocumentActions exposes exports, originals, logs, location/future-discount metadata and linked return/credit paths; posted financial/stock fields cannot be silently rewritten. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-20.1** — Purchase detail exposes Edit/correct, Return, Return history, Print QR, Set location & discount, PDF, Excel, Purchase CSV, original upload/download and Logs. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: PurchaseDocumentActions exposes exports, originals, logs, location/future-discount metadata and linked return/credit paths; posted financial/stock fields cannot be silently rewritten. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Nine purchase-actions DB cases cover exact retained bytes/access, 35-bill full export, PDF/QR/CSV/XLSX saved data, audit-failure rollback, original PO/gate-pass/challan links, unchanged posted stock on receipt-linked billing and recorded cost/net11600. This does not verify every photo or printed export device.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [PurchaseDocumentActions.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/PurchaseDocumentActions.tsx), [results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/results.json), [invoice-stock-added.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-stock-added.png).

- **INV-20.2** — Draft edits are allowed subject to validation. Posted stock/financial changes require a linked correction or reversal with reason, user and before/after values. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: PurchaseDocumentActions exposes exports, originals, logs, location/future-discount metadata and linked return/credit paths; posted financial/stock fields cannot be silently rewritten. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Nine purchase-actions DB cases cover exact retained bytes/access, 35-bill full export, PDF/QR/CSV/XLSX saved data, audit-failure rollback, original PO/gate-pass/challan links, unchanged posted stock on receipt-linked billing and recorded cost/net11600. This does not verify every photo or printed export device.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [PurchaseDocumentActions.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/PurchaseDocumentActions.tsx), [results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/results.json), [invoice-stock-added.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-stock-added.png).

- **INV-20.3** — Adding a supporting original does not overwrite previously retained originals or change stock; download preserves original bytes. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: PurchaseDocumentActions exposes exports, originals, logs, location/future-discount metadata and linked return/credit paths; posted financial/stock fields cannot be silently rewritten. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Nine purchase-actions DB cases cover exact retained bytes/access, 35-bill full export, PDF/QR/CSV/XLSX saved data, audit-failure rollback, original PO/gate-pass/challan links, unchanged posted stock on receipt-linked billing and recorded cost/net11600. This does not verify every photo or printed export device.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [PurchaseDocumentActions.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/PurchaseDocumentActions.tsx), [results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/results.json), [invoice-stock-added.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-stock-added.png).

- **INV-20.4** — Exports include bill header, all rows, paid/free units, taxes, rounding and status; PDF/Excel/CSV agree with the saved record. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: PurchaseDocumentActions exposes exports, originals, logs, location/future-discount metadata and linked return/credit paths; posted financial/stock fields cannot be silently rewritten. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Nine purchase-actions DB cases cover exact retained bytes/access, 35-bill full export, PDF/QR/CSV/XLSX saved data, audit-failure rollback, original PO/gate-pass/challan links, unchanged posted stock on receipt-linked billing and recorded cost/net11600. This does not verify every photo or printed export device.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [PurchaseDocumentActions.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/PurchaseDocumentActions.tsx), [results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/results.json), [invoice-stock-added.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-stock-added.png).

- **INV-20.5** — Logs connect capture, OCR, corrections, mapping, review, commit, returns and payment events with actor/time; ledger-linked batches cannot be hard-deleted. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: PurchaseDocumentActions exposes exports, originals, logs, location/future-discount metadata and linked return/credit paths; posted financial/stock fields cannot be silently rewritten. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Nine purchase-actions DB cases cover exact retained bytes/access, 35-bill full export, PDF/QR/CSV/XLSX saved data, audit-failure rollback, original PO/gate-pass/challan links, unchanged posted stock on receipt-linked billing and recorded cost/net11600. This does not verify every photo or printed export device.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [PurchaseDocumentActions.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/PurchaseDocumentActions.tsx), [results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/results.json), [invoice-stock-added.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-stock-added.png).

### INV-21 — Supplier dues and payments

**Area:** Purchases · **PDF:** pages 1, 5, 8, 11 · **Feature acceptance:** PARTIAL

**Contract:** `purchase-payables-posted-only` — [pharmacy-purchase-ledger.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-ledger.service.ts:478), declaration `private async findLedgerInvoices(`. Narrow assessment: **SOURCE_SUPPORTED**.

> Unposted purchase drafts and OCR-review records MUST NOT contribute to posted supplier dues; posted bills, allocated payments and finalized supplier credits MUST reconcile to the displayed outstanding balance.

**Current implementation:** Posted supplier ledger excludes unposted drafts and reconstructs bill/payment/credit balances, including historical cutoff behavior. Payment request keys and serializable allocation prevent duplicate/overpayment effects. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-21.1** — Supplier account shows posted bills, due dates, paid amount, credits and outstanding with drill-down to each source document. **[LOCAL_UI_PARTIAL_EVIDENCE]**

  Evidence: Posted supplier ledger excludes unposted drafts and reconstructs bill/payment/credit balances, including historical cutoff behavior. Payment request keys and serializable allocation prevent duplicate/overpayment effects. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen local PostgreSQL cases prove metadata CAS/audit rollback, exact product/pack grouping, unit equivalents, >100 source/hold history, UTC boundary eligibility, >200 expiry scope, and historical payment/credit cutoff reconciliation. Only those exercised clauses are evidenced. Parent local browser/account proof records the2240 bill with40 payment,20 applied credit and2180 outstanding. It demonstrates one named allocation path; concurrency/over-allocation are separate controlled database fixtures.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_ACCOUNT_CHECK, LOCAL_BROWSER_SCREENSHOT. [pharmacy-purchase-ledger.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-ledger.service.ts), [integrity-backend-gaps-db.json](/Users/nshah/Clinic_Management_System/output/diagnostics/integrity-backend-gaps-db.json), [credit-payment-ui-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/credit-payment-ui-proof.json), [supplier-payment.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-payment.png).

- **INV-21.2** — Drafts and OCR-review records are displayed separately as unposted, not added to posted dues; a cancelled draft has no payable effect. **[SOURCE_SUPPORTED]**

  Evidence: Posted supplier ledger excludes unposted drafts and reconstructs bill/payment/credit balances, including historical cutoff behavior. Payment request keys and serializable allocation prevent duplicate/overpayment effects. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [pharmacy-purchase-ledger.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-ledger.service.ts), [supplier-payment.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-payment.png).

- **INV-21.3** — One payment can allocate across invoices for the same supplier and branch; allocation sum must equal the payment and cannot exceed remaining outstanding. **[LOCAL_UI_PARTIAL_EVIDENCE]**

  Evidence: Posted supplier ledger excludes unposted drafts and reconstructs bill/payment/credit balances, including historical cutoff behavior. Payment request keys and serializable allocation prevent duplicate/overpayment effects. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen isolated integrity DB cases cover source-owned holds, duplicate-line return limits, downstream reversal guards, recorded original sale terms, refund cents, payment/credit concurrency and movement correction ownership. Parent local browser/account proof records the2240 bill with40 payment,20 applied credit and2180 outstanding. It demonstrates one named allocation path; concurrency/over-allocation are separate controlled database fixtures.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_ACCOUNT_CHECK, LOCAL_BROWSER_SCREENSHOT. [pharmacy-purchase-ledger.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-ledger.service.ts), [integrity-workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/integrity-workflow-db-results.json), [credit-payment-ui-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/credit-payment-ui-proof.json), [supplier-payment.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-payment.png).

- **INV-21.4** — Cash/UPI/NEFT and supported modes record payer, payment date, reference and audit event. Duplicate/retried payment submission cannot double an allocation. **[LOCAL_UI_PARTIAL_EVIDENCE]**

  Evidence: Posted supplier ledger excludes unposted drafts and reconstructs bill/payment/credit balances, including historical cutoff behavior. Payment request keys and serializable allocation prevent duplicate/overpayment effects. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen isolated integrity DB cases cover source-owned holds, duplicate-line return limits, downstream reversal guards, recorded original sale terms, refund cents, payment/credit concurrency and movement correction ownership. Parent local browser/account proof records the2240 bill with40 payment,20 applied credit and2180 outstanding. It demonstrates one named allocation path; concurrency/over-allocation are separate controlled database fixtures.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_ACCOUNT_CHECK, LOCAL_BROWSER_SCREENSHOT. [pharmacy-purchase-ledger.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-ledger.service.ts), [integrity-workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/integrity-workflow-db-results.json), [credit-payment-ui-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/credit-payment-ui-proof.json), [supplier-payment.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-payment.png).

- **INV-21.5** — Concurrent payments and supplier credits cannot over-allocate the same bill. Aging and overdue totals recompute from the same posted balances. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Posted supplier ledger excludes unposted drafts and reconstructs bill/payment/credit balances, including historical cutoff behavior. Payment request keys and serializable allocation prevent duplicate/overpayment effects. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen local PostgreSQL cases prove metadata CAS/audit rollback, exact product/pack grouping, unit equivalents, >100 source/hold history, UTC boundary eligibility, >200 expiry scope, and historical payment/credit cutoff reconciliation. Only those exercised clauses are evidenced. Fifteen isolated integrity DB cases cover source-owned holds, duplicate-line return limits, downstream reversal guards, recorded original sale terms, refund cents, payment/credit concurrency and movement correction ownership.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [pharmacy-purchase-ledger.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-ledger.service.ts), [integrity-backend-gaps-db.json](/Users/nshah/Clinic_Management_System/output/diagnostics/integrity-backend-gaps-db.json), [integrity-workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/integrity-workflow-db-results.json), [supplier-payment.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-payment.png).

### INV-22 — Credit notes and voucher adjustments

**Area:** Purchases · **PDF:** pages 3, 5, 8 · **Feature acceptance:** PARTIAL

**Contract:** `purchase-credit-adjustment-visible` — [SupplierCreditPanel.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/SupplierCreditPanel.tsx:18), declaration `export function SupplierCreditPanel(`. Narrow assessment: **SOURCE_SUPPORTED**.

> Supplier credits and voucher adjustments MUST be selectable against eligible bills in the supplier account, with an auditable balance effect and no duplicate stock movement.

**Current implementation:** SupplierCreditPanel is reachable from supplier accounts and eligible posted purchases with bill/GSTIN context; allocation and reversal enforce supplier/branch/bill/credit balances without stock changes. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-22.1** — Eligible supplier credit notes/vouchers can be inspected and applied from purchase review or supplier account without retyping the original document. **[LOCAL_UI_PARTIAL_EVIDENCE]**

  Evidence: SupplierCreditPanel is reachable from supplier accounts and eligible posted purchases with bill/GSTIN context; allocation and reversal enforce supplier/branch/bill/credit balances without stock changes. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Nine purchase-actions component cases include permission-gated same-bill/GSTIN credit props, linked source-specific keys and malformed response handling; actual credit balances are checked separately in DB fixtures. Parent local browser/account proof records the2240 bill with40 payment,20 applied credit and2180 outstanding. It demonstrates one named allocation path; concurrency/over-allocation are separate controlled database fixtures.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_BROWSER_ACCOUNT_CHECK, LOCAL_BROWSER_SCREENSHOT. [SupplierCreditPanel.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/SupplierCreditPanel.tsx), [recovery-actions-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-actions-tests.txt), [credit-payment-ui-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/credit-payment-ui-proof.json), [purchase-credits.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-credits.png).

- **INV-22.2** — Application shows original credit value, previously used amount, amount applied and remaining credit with supplier/branch checks. **[LOCAL_UI_PARTIAL_EVIDENCE]**

  Evidence: SupplierCreditPanel is reachable from supplier accounts and eligible posted purchases with bill/GSTIN context; allocation and reversal enforce supplier/branch/bill/credit balances without stock changes. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen isolated integrity DB cases cover source-owned holds, duplicate-line return limits, downstream reversal guards, recorded original sale terms, refund cents, payment/credit concurrency and movement correction ownership. Parent local browser/account proof records the2240 bill with40 payment,20 applied credit and2180 outstanding. It demonstrates one named allocation path; concurrency/over-allocation are separate controlled database fixtures.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_ACCOUNT_CHECK, LOCAL_BROWSER_SCREENSHOT. [SupplierCreditPanel.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/SupplierCreditPanel.tsx), [integrity-workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/integrity-workflow-db-results.json), [credit-payment-ui-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/credit-payment-ui-proof.json), [purchase-credits.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-credits.png).

- **INV-22.3** — An applied credit cannot exceed either available credit or eligible bill amount; concurrent/retried application cannot consume it twice. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: SupplierCreditPanel is reachable from supplier accounts and eligible posted purchases with bill/GSTIN context; allocation and reversal enforce supplier/branch/bill/credit balances without stock changes. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen isolated integrity DB cases cover source-owned holds, duplicate-line return limits, downstream reversal guards, recorded original sale terms, refund cents, payment/credit concurrency and movement correction ownership.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [SupplierCreditPanel.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/SupplierCreditPanel.tsx), [integrity-workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/integrity-workflow-db-results.json), [purchase-credits.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-credits.png).

- **INV-22.4** — Final supplier returns create their accounting credit once; applying that credit to a bill never deducts returned stock again. **[LOCAL_UI_PARTIAL_EVIDENCE]**

  Evidence: SupplierCreditPanel is reachable from supplier accounts and eligible posted purchases with bill/GSTIN context; allocation and reversal enforce supplier/branch/bill/credit balances without stock changes. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen isolated integrity DB cases cover source-owned holds, duplicate-line return limits, downstream reversal guards, recorded original sale terms, refund cents, payment/credit concurrency and movement correction ownership. Parent local browser/account proof records the2240 bill with40 payment,20 applied credit and2180 outstanding. It demonstrates one named allocation path; concurrency/over-allocation are separate controlled database fixtures.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_ACCOUNT_CHECK, LOCAL_BROWSER_SCREENSHOT. [SupplierCreditPanel.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/SupplierCreditPanel.tsx), [integrity-workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/integrity-workflow-db-results.json), [credit-payment-ui-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/credit-payment-ui-proof.json), [purchase-credits.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-credits.png).

- **INV-22.5** — Removing or correcting a finalized application creates an auditable reversal; prior balance history remains visible. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: SupplierCreditPanel is reachable from supplier accounts and eligible posted purchases with bill/GSTIN context; allocation and reversal enforce supplier/branch/bill/credit balances without stock changes. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen isolated integrity DB cases cover source-owned holds, duplicate-line return limits, downstream reversal guards, recorded original sale terms, refund cents, payment/credit concurrency and movement correction ownership.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [SupplierCreditPanel.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/SupplierCreditPanel.tsx), [integrity-workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/integrity-workflow-db-results.json), [purchase-credits.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-credits.png).

### INV-23 — Purchase CSV and optional Gmail intake

**Area:** Purchases · **PDF:** pages 3, 11, 12 · **Feature acceptance:** PARTIAL

**Contract:** `purchase-intake-channel-equivalence` — [AlternateInvoiceIntake.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/AlternateInvoiceIntake.tsx:40), declaration `export function AlternateInvoiceIntake(`. Narrow assessment: **SOURCE_SUPPORTED**.

> Purchase CSV and explicitly connected Gmail imports MUST enter the same invoice validation and duplicate-checking flow as manual/OCR intake; a disconnected Gmail account MUST perform no fetch.

**Current implementation:** AlternateInvoiceIntake separates Purchase CSV from opening Excel and retains source/channel. Gmail exposes connection/setup/fetch status and authorized OAuth; disconnected intake cannot fetch attachments. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-23.1** — Purchase CSV import on desktop/mobile maps supplier header and rows, previews errors and retains the source file before creating a purchase draft. **[SOURCE_SUPPORTED]**

  Evidence: AlternateInvoiceIntake separates Purchase CSV from opening Excel and retains source/channel. Gmail exposes connection/setup/fetch status and authorized OAuth; disconnected intake cannot fetch attachments. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [AlternateInvoiceIntake.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/AlternateInvoiceIntake.tsx), [csv-intake.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/csv-intake.png), [gmail-setup.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/gmail-setup.png).

- **INV-23.2** — Purchase CSV is labelled separately from Opening stock Excel; it produces a supplier bill, not an unexplained balance reset. **[SOURCE_SUPPORTED]**

  Evidence: AlternateInvoiceIntake separates Purchase CSV from opening Excel and retains source/channel. Gmail exposes connection/setup/fetch status and authorized OAuth; disconnected intake cannot fetch attachments. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [AlternateInvoiceIntake.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/AlternateInvoiceIntake.tsx), [csv-intake.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/csv-intake.png), [gmail-setup.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/gmail-setup.png).

- **INV-23.3** — Gmail shows Connected/Not connected, mailbox/source, last fetch and recoverable failure. Connection and fetch require explicit authorized setup. **[PARTIAL]**

  Evidence: AlternateInvoiceIntake separates Purchase CSV from opening Excel and retains source/channel. Gmail exposes connection/setup/fetch status and authorized OAuth; disconnected intake cannot fetch attachments. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Verification limit: No configured external Gmail mailbox was connected/fetched in acceptance. Setup/disconnected guards and CSV/common validation are source/local evidence only; authorized connected-mailbox behavior remains an external gate.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [AlternateInvoiceIntake.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/AlternateInvoiceIntake.tsx), [csv-intake.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/csv-intake.png), [gmail-setup.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/gmail-setup.png).

- **INV-23.4** — Email attachment ID/hash and supplier/bill duplicate checks prevent repeat imports; email instructions cannot bypass invoice validation. **[PARTIAL]**

  Evidence: AlternateInvoiceIntake separates Purchase CSV from opening Excel and retains source/channel. Gmail exposes connection/setup/fetch status and authorized OAuth; disconnected intake cannot fetch attachments. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Verification limit: No configured external Gmail mailbox was connected/fetched in acceptance. Setup/disconnected guards and CSV/common validation are source/local evidence only; authorized connected-mailbox behavior remains an external gate.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [AlternateInvoiceIntake.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/AlternateInvoiceIntake.tsx), [csv-intake.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/csv-intake.png), [gmail-setup.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/gmail-setup.png).

- **INV-23.5** — Manual, camera/photo, PDF, CSV and Gmail imports converge on the same review, posting and audit rules, while preserving the original intake channel. **[PARTIAL]**

  Evidence: AlternateInvoiceIntake separates Purchase CSV from opening Excel and retains source/channel. Gmail exposes connection/setup/fetch status and authorized OAuth; disconnected intake cannot fetch attachments. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Verification limit: No configured external Gmail mailbox was connected/fetched in acceptance. Setup/disconnected guards and CSV/common validation are source/local evidence only; authorized connected-mailbox behavior remains an external gate.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [AlternateInvoiceIntake.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/AlternateInvoiceIntake.tsx), [csv-intake.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/csv-intake.png), [gmail-setup.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/gmail-setup.png).

### INV-24 — Batch-aware sales and dispensing

**Area:** Sales · **PDF:** pages 1, 7 · **Feature acceptance:** PARTIAL

**Contract:** `sales-batch-visible-before-confirm` — [WorkflowDocumentEditor.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:35), declaration `export function WorkflowDocumentEditor(`. Narrow assessment: **SOURCE_SUPPORTED**.

> Before a sale is confirmed, the operator MUST be able to verify the item, quantity unit, allocated batch and expiry; insufficient or ineligible batch stock MUST prevent stock deduction.

**Current implementation:** WorkflowDocumentEditor offers counter/customer terms and selected stock-unit batches; saleEligible proposes expiry-ordered active available batches, while final posting rechecks expiry/holds/quantities. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-24.1** — Sale supports customer lookup or counter bill, doctor, bill date, staff, payment mode and pickup/order type without requiring a fabricated patient. **[SOURCE_SUPPORTED]**

  Evidence: WorkflowDocumentEditor offers counter/customer terms and selected stock-unit batches; saleEligible proposes expiry-ordered active available batches, while final posting rechecks expiry/holds/quantities. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [WorkflowDocumentEditor.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx), [counter-sale.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/counter-sale.png).

- **INV-24.2** — Rows show product, pack/unit, location, batch, expiry, quantity, MRP, discounts, GST and line total before confirmation. **[SOURCE_SUPPORTED]**

  Evidence: WorkflowDocumentEditor offers counter/customer terms and selected stock-unit batches; saleEligible proposes expiry-ordered active available batches, while final posting rechecks expiry/holds/quantities. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [WorkflowDocumentEditor.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx), [counter-sale.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/counter-sale.png).

- **INV-24.3** — Eligible batches are proposed by earliest expiry; an allowed override is explicit and recorded. Expired, held or insufficient stock cannot be sold. **[SOURCE_SUPPORTED]**

  Evidence: WorkflowDocumentEditor offers counter/customer terms and selected stock-unit batches; saleEligible proposes expiry-ordered active available batches, while final posting rechecks expiry/holds/quantities. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [WorkflowDocumentEditor.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx), [counter-sale.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/counter-sale.png).

- **INV-24.4** — Confirmed sale deducts the actual allocated batches once, records sale movements and exposes those batches on the invoice and item history. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: WorkflowDocumentEditor offers counter/customer terms and selected stock-unit batches; saleEligible proposes expiry-ordered active available batches, while final posting rechecks expiry/holds/quantities. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The parent-created browser guide documents were independently reconciled in read-only PostgreSQL at the proof timestamp:8/8 checks, 30 opening -1 loss -2 supplier return -3 sale +1 customer return =25 physical tubes and0 held; count25 has no stock delta. The exact document/effect/audit/source and credit records are retained. This is the named fixture snapshot, not every possible transition.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [WorkflowDocumentEditor.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json), [counter-sale.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/counter-sale.png), [workflow-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-proof.json).

- **INV-24.5** — Repeated products/package contents, simultaneous sales and stock changes between preview and confirmation cannot oversell or deduct the wrong batch. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: WorkflowDocumentEditor offers counter/customer terms and selected stock-unit batches; saleEligible proposes expiry-ordered active available batches, while final posting rechecks expiry/holds/quantities. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs. Fifteen isolated integrity DB cases cover source-owned holds, duplicate-line return limits, downstream reversal guards, recorded original sale terms, refund cents, payment/credit concurrency and movement correction ownership. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [WorkflowDocumentEditor.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json), [integrity-workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/integrity-workflow-db-results.json), [counter-sale.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/counter-sale.png).

### INV-25 — Sales drafts and quotations

**Area:** Sales · **PDF:** pages 7, 12 · **Feature acceptance:** PARTIAL

**Contract:** `sales-draft-quotation-no-posting` — [WorkflowDocumentEditor.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:43), declaration `export function WorkflowDocumentEditor(`. Narrow assessment: **SOURCE_SUPPORTED**.

> Saving a sales draft or quotation MUST NOT be represented as a completed dispense or posted stock movement; any reservation effect MUST be separately visible and reversible.

**Current implementation:** Quotation/draft states save without stock or revenue and convert idempotently to a linked sale. This implementation does not reserve stock for a sales draft; final sale revalidates current availability. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-25.1** — Draft and Quotation are named, searchable states with edit, resume and duplicate-safe convert-to-sale actions. **[SOURCE_SUPPORTED]**

  Evidence: Quotation/draft states save without stock or revenue and convert idempotently to a linked sale. This implementation does not reserve stock for a sales draft; final sale revalidates current availability. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [WorkflowDocumentEditor.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx), [quotation.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/quotation.png).

- **INV-25.2** — Saving a draft or quotation does not post stock or revenue. If reservations are enabled, reserved and available balances are separate from physical on-hand. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: Quotation/draft states save without stock or revenue and convert idempotently to a linked sale. This implementation does not reserve stock for a sales draft; final sale revalidates current availability. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The parent-created browser guide documents were independently reconciled in read-only PostgreSQL at the proof timestamp:8/8 checks, 30 opening -1 loss -2 supplier return -3 sale +1 customer return =25 physical tubes and0 held; count25 has no stock delta. The exact document/effect/audit/source and credit records are retained. This is the named fixture snapshot, not every possible transition.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [WorkflowDocumentEditor.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json), [quotation.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/quotation.png), [workflow-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-proof.json).

- **INV-25.3** — Converting a quotation creates or links one sale while retaining source quotation and any agreed price changes. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: Quotation/draft states save without stock or revenue and convert idempotently to a linked sale. This implementation does not reserve stock for a sales draft; final sale revalidates current availability. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The parent-created browser guide documents were independently reconciled in read-only PostgreSQL at the proof timestamp:8/8 checks, 30 opening -1 loss -2 supplier return -3 sale +1 customer return =25 physical tubes and0 held; count25 has no stock delta. The exact document/effect/audit/source and credit records are retained. This is the named fixture snapshot, not every possible transition.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [WorkflowDocumentEditor.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx), [quotation.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/quotation.png), [workflow-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-proof.json).

- **INV-25.4** — Cancelling/expiring an unposted draft releases only its own reservations, with no purchase or sales-return movement. **[SOURCE_SUPPORTED]**

  Evidence: Quotation/draft states save without stock or revenue and convert idempotently to a linked sale. This implementation does not reserve stock for a sales draft; final sale revalidates current availability. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [WorkflowDocumentEditor.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx), [quotation.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/quotation.png).

- **INV-25.5** — Draft stock is revalidated at final confirmation; a previously valid quotation cannot bypass current expiry, hold or quantity checks. **[SOURCE_SUPPORTED]**

  Evidence: Quotation/draft states save without stock or revenue and convert idempotently to a linked sale. This implementation does not reserve stock for a sales draft; final sale revalidates current availability. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [WorkflowDocumentEditor.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx), [quotation.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/quotation.png).

### INV-26 — Customer sales returns and refunds

**Area:** Sales · **PDF:** pages 1, 6, 7 · **Feature acceptance:** PARTIAL

**Contract:** `sales-return-original-batch` — [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:929), declaration `private async validatePosting(`. Narrow assessment: **SOURCE_SUPPORTED**.

> A customer return MUST reference its original sale line and batch, limit quantity to the unreturned sold amount, and distinguish restockable goods from non-saleable returns.

**Current implementation:** Workflow sales returns select the original sale line/batch and original price/tax basis; aggregate returned quantity limits, disposition, source holds and signed refund accounting apply transactionally. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-26.1** — Find the original sale and select partial/full line quantities, original batch and reason from a visible Sales returns action. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: Workflow sales returns select the original sale line/batch and original price/tax basis; aggregate returned quantity limits, disposition, source holds and signed refund accounting apply transactionally. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The parent-created browser guide documents were independently reconciled in read-only PostgreSQL at the proof timestamp:8/8 checks, 30 opening -1 loss -2 supplier return -3 sale +1 customer return =25 physical tubes and0 held; count25 has no stock delta. The exact document/effect/audit/source and credit records are retained. This is the named fixture snapshot, not every possible transition.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts), [sales-return.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/sales-return.png), [workflow-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-proof.json).

- **INV-26.2** — Return quantities cannot exceed sold-minus-already-returned units, including concurrent returns; unit conversion uses the original sale basis. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Workflow sales returns select the original sale line/batch and original price/tax basis; aggregate returned quantity limits, disposition, source holds and signed refund accounting apply transactionally. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs. Fifteen isolated integrity DB cases cover source-owned holds, duplicate-line return limits, downstream reversal guards, recorded original sale terms, refund cents, payment/credit concurrency and movement correction ownership. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json), [integrity-workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/integrity-workflow-db-results.json), [sales-return.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/sales-return.png).

- **INV-26.3** — Explicit disposition chooses saleable restock, quarantine or loss; only accepted saleable units increase available stock. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: Workflow sales returns select the original sale line/batch and original price/tax basis; aggregate returned quantity limits, disposition, source holds and signed refund accounting apply transactionally. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The parent-created browser guide documents were independently reconciled in read-only PostgreSQL at the proof timestamp:8/8 checks, 30 opening -1 loss -2 supplier return -3 sale +1 customer return =25 physical tubes and0 held; count25 has no stock delta. The exact document/effect/audit/source and credit records are retained. This is the named fixture snapshot, not every possible transition.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json), [sales-return.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/sales-return.png), [workflow-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-proof.json).

- **INV-26.4** — Stock, refund/credit and return-document effects are transactional and retry-safe, and link to the original sale and item ledger. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: Workflow sales returns select the original sale line/batch and original price/tax basis; aggregate returned quantity limits, disposition, source holds and signed refund accounting apply transactionally. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen isolated integrity DB cases cover source-owned holds, duplicate-line return limits, downstream reversal guards, recorded original sale terms, refund cents, payment/credit concurrency and movement correction ownership. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The parent-created browser guide documents were independently reconciled in read-only PostgreSQL at the proof timestamp:8/8 checks, 30 opening -1 loss -2 supplier return -3 sale +1 customer return =25 physical tubes and0 held; count25 has no stock delta. The exact document/effect/audit/source and credit records are retained. This is the named fixture snapshot, not every possible transition.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts), [integrity-workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/integrity-workflow-db-results.json), [sales-return.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/sales-return.png), [workflow-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-proof.json).

- **INV-26.5** — Return history and refund status remain visible; reversing a final return creates a linked correction rather than erasing it. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: Workflow sales returns select the original sale line/batch and original price/tax basis; aggregate returned quantity limits, disposition, source holds and signed refund accounting apply transactionally. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen isolated integrity DB cases cover source-owned holds, duplicate-line return limits, downstream reversal guards, recorded original sale terms, refund cents, payment/credit concurrency and movement correction ownership. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The parent-created browser guide documents were independently reconciled in read-only PostgreSQL at the proof timestamp:8/8 checks, 30 opening -1 loss -2 supplier return -3 sale +1 customer return =25 physical tubes and0 held; count25 has no stock delta. The exact document/effect/audit/source and credit records are retained. This is the named fixture snapshot, not every possible transition.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts), [integrity-workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/integrity-workflow-db-results.json), [sales-return.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/sales-return.png), [workflow-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-proof.json).

### INV-27 — Signed item and batch movement ledger

**Area:** Stock · **PDF:** pages 6, 7 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-ledger-closing-balance` — [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:119), declaration `async item(`. Narrow assessment: **SOURCE_SUPPORTED**.

> The item/batch ledger MUST expose each movement’s signed stock effect and running close so that opening plus receipts minus outflows plus signed adjustments equals the stored balance.

**Current implementation:** workspace.item builds deterministic signed movement/closing rows with source ownership links and explicit unknown historical direction; corrections preserve the original movement. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-27.1** — Each movement shows date/time, type, source document, batch, in/out, unit, running balance, user and reason where applicable. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: workspace.item builds deterministic signed movement/closing rows with source ownership links and explicit unknown historical direction; corrections preserve the original movement. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The parent-created browser guide documents were independently reconciled in read-only PostgreSQL at the proof timestamp:8/8 checks, 30 opening -1 loss -2 supplier return -3 sale +1 customer return =25 physical tubes and0 held; count25 has no stock delta. The exact document/effect/audit/source and credit records are retained. This is the named fixture snapshot, not every possible transition.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts), [item-history.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/item-history.png), [workflow-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-proof.json).

- **INV-27.2** — Opening + receipts + accepted returns - sales - supplier stock-out returns/losses + signed adjustments equals the current stored batch balance. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: workspace.item builds deterministic signed movement/closing rows with source ownership links and explicit unknown historical direction; corrections preserve the original movement. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The parent-created browser guide documents were independently reconciled in read-only PostgreSQL at the proof timestamp:8/8 checks, 30 opening -1 loss -2 supplier return -3 sale +1 customer return =25 physical tubes and0 held; count25 has no stock delta. The exact document/effect/audit/source and credit records are retained. This is the named fixture snapshot, not every possible transition.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts), [item-history.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/item-history.png), [workflow-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-proof.json).

- **INV-27.3** — For the GSH fixture, 2570 - 2390 - 10 - 30 = 140; both negative adjustments are represented as stock out and retain reasons. **[SOURCE_SUPPORTED]**

  Evidence: workspace.item builds deterministic signed movement/closing rows with source ownership links and explicit unknown historical direction; corrections preserve the original movement. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts), [item-history.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/item-history.png).

- **INV-27.4** — Source links open the purchase, sale, count or return without losing item context; chronological ordering is deterministic for equal timestamps. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: workspace.item builds deterministic signed movement/closing rows with source ownership links and explicit unknown historical direction; corrections preserve the original movement. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen local PostgreSQL cases prove metadata CAS/audit rollback, exact product/pack grouping, unit equivalents, >100 source/hold history, UTC boundary eligibility, >200 expiry scope, and historical payment/credit cutoff reconciliation. Only those exercised clauses are evidenced. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The parent-created browser guide documents were independently reconciled in read-only PostgreSQL at the proof timestamp:8/8 checks, 30 opening -1 loss -2 supplier return -3 sale +1 customer return =25 physical tubes and0 held; count25 has no stock delta. The exact document/effect/audit/source and credit records are retained. This is the named fixture snapshot, not every possible transition.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts), [integrity-backend-gaps-db.json](/Users/nshah/Clinic_Management_System/output/diagnostics/integrity-backend-gaps-db.json), [item-history.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/item-history.png), [workflow-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-proof.json).

- **INV-27.5** — History is not silently rewritten by editing/deleting a posted movement; corrections appear as linked reversal/replacement entries. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: workspace.item builds deterministic signed movement/closing rows with source ownership links and explicit unknown historical direction; corrections preserve the original movement. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen isolated integrity DB cases cover source-owned holds, duplicate-line return limits, downstream reversal guards, recorded original sale terms, refund cents, payment/credit concurrency and movement correction ownership. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts), [integrity-workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/integrity-workflow-db-results.json), [item-history.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/item-history.png).

### INV-28 — Staged supplier returns

**Area:** Stock · **PDF:** pages 8 · **Feature acceptance:** PARTIAL

**Contract:** `supplier-return-stage-effects` — [WorkflowDocumentEditor.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:50), declaration `export function WorkflowDocumentEditor(`. Narrow assessment: **SOURCE_SUPPORTED**.

> The supplier-return workflow MUST distinguish Draft, Challan and Return invoice and display their stock and supplier-ledger effects; Challan-to-invoice conversion MUST NOT deduct stock a second time.

**Current implementation:** WorkflowDocumentEditor distinguishes Draft, Challan and final supplier return with commercial terms and stock/accounting copy; workflow transition applies challan deltas and final credit without double stock-out. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-28.1** — Guided return entry covers supplier, item preference, return base, return type and review, preserving progress and showing stock/accounting effect before submission. **[SOURCE_SUPPORTED]**

  Evidence: WorkflowDocumentEditor distinguishes Draft, Challan and final supplier return with commercial terms and stock/accounting copy; workflow transition applies challan deltas and final credit without double stock-out. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [WorkflowDocumentEditor.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx), [supplier-return-challan.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-return-challan.png), [supplier-return.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-return.png).

- **INV-28.2** — Rows include item, pack/unit, batch, expiry, MRP/PTR basis, paid/free quantities, discounts, scheme amount, taxable value and GST. **[SOURCE_SUPPORTED]**

  Evidence: WorkflowDocumentEditor distinguishes Draft, Challan and final supplier return with commercial terms and stock/accounting copy; workflow transition applies challan deltas and final credit without double stock-out. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [WorkflowDocumentEditor.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx), [supplier-return-challan.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-return-challan.png), [supplier-return.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-return.png).

- **INV-28.3** — Draft is editable/deletable and changes neither ledger. Challan affects item stock only; edits/deletion adjust or reverse its stock delta with history. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: WorkflowDocumentEditor distinguishes Draft, Challan and final supplier return with commercial terms and stock/accounting copy; workflow transition applies challan deltas and final credit without double stock-out. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs. Fifteen isolated integrity DB cases cover source-owned holds, duplicate-line return limits, downstream reversal guards, recorded original sale terms, refund cents, payment/credit concurrency and movement correction ownership. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The parent-created browser guide documents were independently reconciled in read-only PostgreSQL at the proof timestamp:8/8 checks, 30 opening -1 loss -2 supplier return -3 sale +1 customer return =25 physical tubes and0 held; count25 has no stock delta. The exact document/effect/audit/source and credit records are retained. This is the named fixture snapshot, not every possible transition.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [WorkflowDocumentEditor.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json), [integrity-workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/integrity-workflow-db-results.json), [supplier-return-challan.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-return-challan.png), [supplier-return.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-return.png), [workflow-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-proof.json).

- **INV-28.4** — Final Return invoice affects stock and supplier ledger once. Converting an existing Challan adds the accounting effect without a second stock deduction. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: WorkflowDocumentEditor distinguishes Draft, Challan and final supplier return with commercial terms and stock/accounting copy; workflow transition applies challan deltas and final credit without double stock-out. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs. Fifteen isolated integrity DB cases cover source-owned holds, duplicate-line return limits, downstream reversal guards, recorded original sale terms, refund cents, payment/credit concurrency and movement correction ownership. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The parent-created browser guide documents were independently reconciled in read-only PostgreSQL at the proof timestamp:8/8 checks, 30 opening -1 loss -2 supplier return -3 sale +1 customer return =25 physical tubes and0 held; count25 has no stock delta. The exact document/effect/audit/source and credit records are retained. This is the named fixture snapshot, not every possible transition.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [WorkflowDocumentEditor.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json), [integrity-workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/integrity-workflow-db-results.json), [supplier-return-challan.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-return-challan.png), [supplier-return.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-return.png), [workflow-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-proof.json).

- **INV-28.5** — Final Return invoice cannot be edited/deleted in place. Return register/history supports date/year/GST/status filters and linked corrections; no-results is scoped to the filter. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: WorkflowDocumentEditor distinguishes Draft, Challan and final supplier return with commercial terms and stock/accounting copy; workflow transition applies challan deltas and final credit without double stock-out. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen isolated integrity DB cases cover source-owned holds, duplicate-line return limits, downstream reversal guards, recorded original sale terms, refund cents, payment/credit concurrency and movement correction ownership. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [WorkflowDocumentEditor.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx), [integrity-workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/integrity-workflow-db-results.json), [supplier-return-challan.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-return-challan.png), [supplier-return.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-return.png).

### INV-29 — Breakage and loss

**Area:** Stock · **PDF:** pages 8, 10 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-loss-no-supplier-credit` — [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:1248), declaration `private async applyStockDocument(`. Narrow assessment: **SOURCE_SUPPORTED**.

> Posting breakage or loss MUST reduce the selected batch stock once and MUST NOT create a supplier credit or change supplier dues.

**Current implementation:** workflow.applyStockDocument posts loss from the selected batch/source hold with signed stock movement and reason; it creates no supplier credit and final correction uses linked reversal. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-29.1** — Choose item/batch, quantity and unit, expiry, disposition and reason from a visible Breakage & loss action. **[SOURCE_SUPPORTED]**

  Evidence: workflow.applyStockDocument posts loss from the selected batch/source hold with signed stock movement and reason; it creates no supplier credit and final correction uses linked reversal. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts), [stock-loss.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-loss.png).

- **INV-29.2** — Preview clearly states stock will decrease and supplier balance will not change; quantity cannot exceed eligible on-hand. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: workflow.applyStockDocument posts loss from the selected batch/source hold with signed stock movement and reason; it creates no supplier credit and final correction uses linked reversal. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The parent-created browser guide documents were independently reconciled in read-only PostgreSQL at the proof timestamp:8/8 checks, 30 opening -1 loss -2 supplier return -3 sale +1 customer return =25 physical tubes and0 held; count25 has no stock delta. The exact document/effect/audit/source and credit records are retained. This is the named fixture snapshot, not every possible transition.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts), [stock-loss.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-loss.png), [workflow-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-proof.json).

- **INV-29.3** — Posting writes a final loss document and signed stock movement atomically and once, with actor and source evidence. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: workflow.applyStockDocument posts loss from the selected batch/source hold with signed stock movement and reason; it creates no supplier credit and final correction uses linked reversal. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The parent-created browser guide documents were independently reconciled in read-only PostgreSQL at the proof timestamp:8/8 checks, 30 opening -1 loss -2 supplier return -3 sale +1 customer return =25 physical tubes and0 held; count25 has no stock delta. The exact document/effect/audit/source and credit records are retained. This is the named fixture snapshot, not every possible transition.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json), [stock-loss.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-loss.png), [workflow-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-proof.json).

- **INV-29.4** — Final loss is immutable; a correction links an authorized reversal and replacement without erasing history. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: workflow.applyStockDocument posts loss from the selected batch/source hold with signed stock movement and reason; it creates no supplier credit and final correction uses linked reversal. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen isolated integrity DB cases cover source-owned holds, duplicate-line return limits, downstream reversal guards, recorded original sale terms, refund cents, payment/credit concurrency and movement correction ownership. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts), [integrity-workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/integrity-workflow-db-results.json), [stock-loss.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-loss.png).

- **INV-29.5** — Loss and supplier return remain separate choices so damaged goods are not credited to a supplier by assumption. **[SOURCE_SUPPORTED]**

  Evidence: workflow.applyStockDocument posts loss from the selected batch/source hold with signed stock movement and reason; it creates no supplier credit and final correction uses linked reversal. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts), [stock-loss.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-loss.png).

### INV-30 — Expiry queues and disposition

**Area:** Stock · **PDF:** pages 2, 10, 11 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-expiry-complete-windows` — [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:55), declaration `async stock(`. Narrow assessment: **SOURCE_SUPPORTED**.

> Expiry queues MUST support expired and the next 1, 2, 3 and 6 months across all eligible batches; any result cap MUST be visible and navigable rather than presented as a complete total.

**Current implementation:** workspace.stock uses declared UTC calendar-day and clamped 1/2/3/6-month expiry boundaries across the full eligible population. Disposal routes to hold/return/loss; ledger-linked stock cannot be hard-deleted. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-30.1** — Expired and next 1/2/3/6-month queues show item, batch, expiry, quantity unit, supplier, location and selectable valuation basis. **[SOURCE_SUPPORTED]**

  Evidence: workspace.stock uses declared UTC calendar-day and clamped 1/2/3/6-month expiry boundaries across the full eligible population. Disposal routes to hold/return/loss; ledger-linked stock cannot be hard-deleted. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts).

- **INV-30.2** — Calendar boundaries and date interpretation are defined; a batch on the boundary appears consistently in UI, backend and export. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: workspace.stock uses declared UTC calendar-day and clamped 1/2/3/6-month expiry boundaries across the full eligible population. Disposal routes to hold/return/loss; ledger-linked stock cannot be hard-deleted. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen local PostgreSQL cases prove metadata CAS/audit rollback, exact product/pack grouping, unit equivalents, >100 source/hold history, UTC boundary eligibility, >200 expiry scope, and historical payment/credit cutoff reconciliation. Only those exercised clauses are evidenced.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts), [integrity-backend-gaps-db.json](/Users/nshah/Clinic_Management_System/output/diagnostics/integrity-backend-gaps-db.json).

- **INV-30.3** — Queues cover all matching pages. Counts above 200 remain accurate and navigable rather than silently truncated. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: workspace.stock uses declared UTC calendar-day and clamped 1/2/3/6-month expiry boundaries across the full eligible population. Disposal routes to hold/return/loss; ledger-linked stock cannot be hard-deleted. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen local PostgreSQL cases prove metadata CAS/audit rollback, exact product/pack grouping, unit equivalents, >100 source/hold history, UTC boundary eligibility, >200 expiry scope, and historical payment/credit cutoff reconciliation. Only those exercised clauses are evidenced.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts), [integrity-backend-gaps-db.json](/Users/nshah/Clinic_Management_System/output/diagnostics/integrity-backend-gaps-db.json).

- **INV-30.4** — Each batch offers a valid next action: inspect, quarantine, supplier return or loss; opening a queue alone changes no stock. **[SOURCE_SUPPORTED]**

  Evidence: workspace.stock uses declared UTC calendar-day and clamped 1/2/3/6-month expiry boundaries across the full eligible population. Disposal routes to hold/return/loss; ledger-linked stock cannot be hard-deleted. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts).

- **INV-30.5** — Delete expired batches cannot erase ledger-linked history or silently remove nonzero stock; use documented disposal then archive with a recoverable audit trail. **[SOURCE_SUPPORTED]**

  Evidence: workspace.stock uses declared UTC calendar-day and clamped 1/2/3/6-month expiry boundaries across the full eligible population. Disposal routes to hold/return/loss; ledger-linked stock cannot be hard-deleted. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts).

### INV-31 — Stock audit and counting

**Area:** Stock · **PDF:** pages 10, 11 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-audit-approval-before-post` — [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:716), declaration `async transition(`. Narrow assessment: **SOURCE_SUPPORTED**.

> When an audit variance requires approval, applying the count MUST leave stock unchanged until approval is recorded; a flag saying approvalRequired is not itself approval.

**Current implementation:** Count settings expose owner/on-off/cadence and APPROVAL or THRESHOLD mode. Blank counts remain absent; revision/current-stock checks, reason and approval precede signed atomic count effects. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-31.1** — Audit can be configured On/Off with owner, cadence/daily item count and explicit stock-adjustment mode; disabled tracking is explained. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Count settings expose owner/on-off/cadence and APPROVAL or THRESHOLD mode. Blank counts remain absent; revision/current-stock checks, reason and approval precede signed atomic count effects. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Ten Reorder component cases prove selected-row/revision/reason review, read-only controls, history, OPEN/search/date/GSTIN URL scope and full export, stale-response isolation, settings and receipt handoff. This is rendered interaction evidence, not live browser acceptance. Eight isolated DB cases prove selected targets/settings CAS, atomic audit rollback, no quantity/price changes, invalid-unit/reason rejection and manual/exclusion preservation. APPROVAL holds small positive variances, posts zero variance at threshold0, and requires explicit manager approval; THRESHOLD permits eligible small positive variance. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts), [reorder-ui-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/reorder-ui-tests.txt), [reorder-gaps-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/reorder-gaps-db-results.json), [stock-count.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-count.png), [automation-settings.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/automation-settings.png).

- **INV-31.2** — Select by item/location/batch or filters. Record physical counts in labelled units; blank means not counted, zero requires an explicit entered zero. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: Count settings expose owner/on-off/cadence and APPROVAL or THRESHOLD mode. Blank counts remain absent; revision/current-stock checks, reason and approval precede signed atomic count effects. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The parent-created browser guide documents were independently reconciled in read-only PostgreSQL at the proof timestamp:8/8 checks, 30 opening -1 loss -2 supplier return -3 sale +1 customer return =25 physical tubes and0 held; count25 has no stock delta. The exact document/effect/audit/source and credit records are retained. This is the named fixture snapshot, not every possible transition.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json), [stock-count.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-count.png), [workflow-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-proof.json), [automation-settings.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/automation-settings.png).

- **INV-31.3** — Preview system stock, physical stock and variance before posting. Negative/fractional unsupported counts fail; concurrent sales trigger refreshed comparison. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Count settings expose owner/on-off/cadence and APPROVAL or THRESHOLD mode. Blank counts remain absent; revision/current-stock checks, reason and approval precede signed atomic count effects. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json), [stock-count.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-count.png), [automation-settings.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/automation-settings.png).

- **INV-31.4** — Every nonzero variance requires a reason. Required approvals leave stock unchanged and create a visible pending action until an authorized reviewer approves. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Count settings expose owner/on-off/cadence and APPROVAL or THRESHOLD mode. Blank counts remain absent; revision/current-stock checks, reason and approval precede signed atomic count effects. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs. Eight isolated DB cases prove selected targets/settings CAS, atomic audit rollback, no quantity/price changes, invalid-unit/reason rejection and manual/exclusion preservation. APPROVAL holds small positive variances, posts zero variance at threshold0, and requires explicit manager approval; THRESHOLD permits eligible small positive variance. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The retired direct audit-adjustment service now rejects before database access, and the legacy audit UI links to canonical Counts & audit; two additional implementation guards preserve this policy boundary. These are source-supported guards, separately tracked from the original 50 contract IDs.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json), [reorder-gaps-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/reorder-gaps-db-results.json), [stock-count.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-count.png), [automation-settings.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/automation-settings.png), [pharmacy-compliance.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-compliance.service.ts), [ComplianceCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/ComplianceCenter.tsx).

- **INV-31.5** — Audit history exposes Pending/Completed/Blocked, actor, reason, before/after quantities and source movements; retries do not reapply a stale physical count. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: Count settings expose owner/on-off/cadence and APPROVAL or THRESHOLD mode. Blank counts remain absent; revision/current-stock checks, reason and approval precede signed atomic count effects. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The parent-created browser guide documents were independently reconciled in read-only PostgreSQL at the proof timestamp:8/8 checks, 30 opening -1 loss -2 supplier return -3 sale +1 customer return =25 physical tubes and0 held; count25 has no stock delta. The exact document/effect/audit/source and credit records are retained. This is the named fixture snapshot, not every possible transition.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json), [stock-count.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-count.png), [workflow-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-proof.json), [automation-settings.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/automation-settings.png).

### INV-32 — Stock adjustment integrity

**Area:** Stock · **PDF:** pages 7, 10 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-adjustment-direction` — [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:360), declaration `async correctMovement(`. Narrow assessment: **SOURCE_SUPPORTED**.

> A stock adjustment MUST persist an unambiguous signed delta equal to its stock-balance change; an absolute quantity with type ADJUSTMENT and no direction is insufficient.

**Current implementation:** workspace.correctMovement preserves source-owned documents and prior adjustments; writeStockMovement records signed before/after effects atomically and rejects insufficient available stock. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-32.1** — Each adjustment stores reason, actor, timestamp, branch, batch, before balance, after balance and signed delta. **[SOURCE_SUPPORTED]**

  Evidence: workspace.correctMovement preserves source-owned documents and prior adjustments; writeStockMovement records signed before/after effects atomically and rejects insufficient available stock. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts).

- **INV-32.2** — A -3 adjustment on stock 10 records an outflow of 3 and new balance 7; a +3 adjustment records an inflow and balance 13. **[SOURCE_SUPPORTED]**

  Evidence: workspace.correctMovement preserves source-owned documents and prior adjustments; writeStockMovement records signed before/after effects atomically and rejects insufficient available stock. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts).

- **INV-32.3** — Movement and stock update succeed atomically or neither persists. Failure injection after movement creation must leave no orphan movement. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: workspace.correctMovement preserves source-owned documents and prior adjustments; writeStockMovement records signed before/after effects atomically and rejects insufficient available stock. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json).

- **INV-32.4** — Outbound quantity 15 from stock 10 is rejected without changes; the service must not store an outflow of 15 while clamping the balance to zero. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: workspace.correctMovement preserves source-owned documents and prior adjustments; writeStockMovement records signed before/after effects atomically and rejects insufficient available stock. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json).

- **INV-32.5** — Posted adjustments cannot be edited/deleted in place; correction/reversal preserves the original effect and checks current stock and permissions. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: workspace.correctMovement preserves source-owned documents and prior adjustments; writeStockMovement records signed before/after effects atomically and rejects insufficient available stock. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen isolated integrity DB cases cover source-owned holds, duplicate-line return limits, downstream reversal guards, recorded original sale terms, refund cents, payment/credit concurrency and movement correction ownership.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts), [integrity-workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/integrity-workflow-db-results.json).

### INV-33 — Blocked and quarantined stock

**Area:** Stock · **PDF:** pages 6, 7, 10, 12 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-hold-availability-visible` — [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:337), declaration `async holdSources(`. Narrow assessment: **SOURCE_SUPPORTED**.

> Blocked or quarantined quantities MUST be visible separately from on-hand and available-to-sell quantities; releasing a hold MUST NOT manufacture a receipt or erase its reason.

**Current implementation:** workspace.holdSources records each active/released hold owner, reason, unit and remaining balance after only its own consumers. Holds reduce availability, not physical quantity; release retains source history. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-33.1** — Item detail lists active/released holds with batch, quantity, unit, reason, owner and time; hold is a named action, not an undocumented stock status. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: workspace.holdSources records each active/released hold owner, reason, unit and remaining balance after only its own consumers. Holds reduce availability, not physical quantity; release retains source history. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen local PostgreSQL cases prove metadata CAS/audit rollback, exact product/pack grouping, unit equivalents, >100 source/hold history, UTC boundary eligibility, >200 expiry scope, and historical payment/credit cutoff reconciliation. Only those exercised clauses are evidenced. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The parent-created browser guide documents were independently reconciled in read-only PostgreSQL at the proof timestamp:8/8 checks, 30 opening -1 loss -2 supplier return -3 sale +1 customer return =25 physical tubes and0 held; count25 has no stock delta. The exact document/effect/audit/source and credit records are retained. This is the named fixture snapshot, not every possible transition.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts), [integrity-backend-gaps-db.json](/Users/nshah/Clinic_Management_System/output/diagnostics/integrity-backend-gaps-db.json), [blocked-stock.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/blocked-stock.png), [workflow-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-proof.json).

- **INV-33.2** — Physical on-hand, held/reserved and available balances are separately labelled and reconcile according to an explicit hold policy. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: workspace.holdSources records each active/released hold owner, reason, unit and remaining balance after only its own consumers. Holds reduce availability, not physical quantity; release retains source history. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The parent-created browser guide documents were independently reconciled in read-only PostgreSQL at the proof timestamp:8/8 checks, 30 opening -1 loss -2 supplier return -3 sale +1 customer return =25 physical tubes and0 held; count25 has no stock delta. The exact document/effect/audit/source and credit records are retained. This is the named fixture snapshot, not every possible transition.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json), [blocked-stock.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/blocked-stock.png), [workflow-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-proof.json).

- **INV-33.3** — A held batch is excluded from sale allocation and automatic reorder availability according to that policy; concurrent holds cannot over-reserve. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: workspace.holdSources records each active/released hold owner, reason, unit and remaining balance after only its own consumers. Holds reduce availability, not physical quantity; release retains source history. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs. Fifteen isolated integrity DB cases cover source-owned holds, duplicate-line return limits, downstream reversal guards, recorded original sale terms, refund cents, payment/credit concurrency and movement correction ownership. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json), [integrity-workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/integrity-workflow-db-results.json), [blocked-stock.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/blocked-stock.png).

- **INV-33.4** — Release restores only the held availability and retains history; disposal/return uses its own stock movement rather than silently deleting the hold. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: workspace.holdSources records each active/released hold owner, reason, unit and remaining balance after only its own consumers. Holds reduce availability, not physical quantity; release retains source history. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs. Fifteen isolated integrity DB cases cover source-owned holds, duplicate-line return limits, downstream reversal guards, recorded original sale terms, refund cents, payment/credit concurrency and movement correction ownership. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion. The parent-created browser guide documents were independently reconciled in read-only PostgreSQL at the proof timestamp:8/8 checks, 30 opening -1 loss -2 supplier return -3 sale +1 customer return =25 physical tubes and0 held; count25 has no stock delta. The exact document/effect/audit/source and credit records are retained. This is the named fixture snapshot, not every possible transition.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json), [integrity-workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/integrity-workflow-db-results.json), [blocked-stock.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/blocked-stock.png), [workflow-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-proof.json).

- **INV-33.5** — Hold and sales-draft reservation policies are documented before acceptance; the PDF did not establish their exact eVitalRx semantics. **[SOURCE_SUPPORTED]**

  Evidence: workspace.holdSources records each active/released hold owner, reason, unit and remaining balance after only its own consumers. Holds reduce availability, not physical quantity; release retains source history. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Parent browser screenshots demonstrate the named local screen/state only; screenshots do not independently prove this entire criterion.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts), [blocked-stock.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/blocked-stock.png).

### INV-34 — Manual min/max targets

**Area:** Reorder · **PDF:** pages 2, 9, 11 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-minmax-valid-units` — [ReplenishmentCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx:183), declaration `function ManualTargets(`. Narrow assessment: **SOURCE_SUPPORTED**.

> Manual replenishment targets MUST identify their quantity unit and enforce nonnegative minimum not exceeding maximum; manual overrides MUST survive automatic recommendations until explicitly accepted.

**Current implementation:** ManualTargets reviews selected item min/max/reorder values in stock units, distinguishes unconfigured/manual/proposal exclusions, requires reason and both item/settings revisions, and exposes target history. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-34.1** — Edit min, max and reorder level per item with visible pack/base-unit basis and valid nonnegative min <= max. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: ManualTargets reviews selected item min/max/reorder values in stock units, distinguishes unconfigured/manual/proposal exclusions, requires reason and both item/settings revisions, and exposes target history. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Ten Reorder component cases prove selected-row/revision/reason review, read-only controls, history, OPEN/search/date/GSTIN URL scope and full export, stale-response isolation, settings and receipt handoff. This is rendered interaction evidence, not live browser acceptance. Eight isolated DB cases prove selected targets/settings CAS, atomic audit rollback, no quantity/price changes, invalid-unit/reason rejection and manual/exclusion preservation. APPROVAL holds small positive variances, posts zero variance at threshold0, and requires explicit manager approval; THRESHOLD permits eligible small positive variance.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [ReplenishmentCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx), [reorder-ui-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/reorder-ui-tests.txt), [reorder-gaps-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/reorder-gaps-db-results.json), [manual-targets.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/manual-targets.png).

- **INV-34.2** — Low/high stock queues use each item’s configured thresholds, not a fixed global stock <= 10 test. **[SOURCE_SUPPORTED]**

  Evidence: ManualTargets reviews selected item min/max/reorder values in stock units, distinguishes unconfigured/manual/proposal exclusions, requires reason and both item/settings revisions, and exposes target history. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [ReplenishmentCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx), [manual-targets.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/manual-targets.png).

- **INV-34.3** — Missing min/max appears as unconfigured, not zero demand. Bulk target edits preview changes and record actor/reason. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: ManualTargets reviews selected item min/max/reorder values in stock units, distinguishes unconfigured/manual/proposal exclusions, requires reason and both item/settings revisions, and exposes target history. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Ten Reorder component cases prove selected-row/revision/reason review, read-only controls, history, OPEN/search/date/GSTIN URL scope and full export, stale-response isolation, settings and receipt handoff. This is rendered interaction evidence, not live browser acceptance. Eight isolated DB cases prove selected targets/settings CAS, atomic audit rollback, no quantity/price changes, invalid-unit/reason rejection and manual/exclusion preservation. APPROVAL holds small positive variances, posts zero variance at threshold0, and requires explicit manager approval; THRESHOLD permits eligible small positive variance.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [ReplenishmentCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx), [reorder-ui-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/reorder-ui-tests.txt), [reorder-gaps-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/reorder-gaps-db-results.json), [manual-targets.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/manual-targets.png).

- **INV-34.4** — Manual targets and exclusions are distinguishable from automatic proposals; automatic refresh cannot silently replace them. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: ManualTargets reviews selected item min/max/reorder values in stock units, distinguishes unconfigured/manual/proposal exclusions, requires reason and both item/settings revisions, and exposes target history. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Ten Reorder component cases prove selected-row/revision/reason review, read-only controls, history, OPEN/search/date/GSTIN URL scope and full export, stale-response isolation, settings and receipt handoff. This is rendered interaction evidence, not live browser acceptance. Eight isolated DB cases prove selected targets/settings CAS, atomic audit rollback, no quantity/price changes, invalid-unit/reason rejection and manual/exclusion preservation. APPROVAL holds small positive variances, posts zero variance at threshold0, and requires explicit manager approval; THRESHOLD permits eligible small positive variance.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [ReplenishmentCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx), [reorder-ui-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/reorder-ui-tests.txt), [reorder-gaps-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/reorder-gaps-db-results.json), [manual-targets.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/manual-targets.png).

- **INV-34.5** — The deprecated legacy min/max action redirects to the supported target editor/review screen with existing values preserved; no dead Turn on button. **[LOCAL_UI_PARTIAL_EVIDENCE]**

  Evidence: ManualTargets reviews selected item min/max/reorder values in stock units, distinguishes unconfigured/manual/proposal exclusions, requires reason and both item/settings revisions, and exposes target history. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Actual legacy-route navigation resolves to /dashboard/inventory?area=reorder&view=targets. The old route uses Next redirect and the sidebar points to the supported editor; navigation does not mutate saved targets.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_NAVIGATION, LOCAL_BROWSER_SCREENSHOT. [ReplenishmentCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx), [responsive-ui-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/responsive-ui-proof.json), [manual-targets.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/manual-targets.png).

### INV-35 — Shortbook replenishment queue

**Area:** Reorder · **PDF:** pages 9, 12 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-shortbook-workflow` — [ReplenishmentCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx:27), declaration `export function ReplenishmentCenter(`. Narrow assessment: **SOURCE_SUPPORTED**.

> The reorder workspace MUST provide a Shortbook with persisted item requests, supplier, required quantity, priority and status; accepting a request MUST NOT itself receive stock.

**Current implementation:** ReplenishmentCenter provides persisted Shortbook request/source/priority/supplier/status, full-scope filters/export and explicit supplier choice; linked PO/receipt transitions update outstanding demand. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-35.1** — Shortbook lists item, supplier, priority, min/current stock, required quantity, status, request source and requester. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: ReplenishmentCenter provides persisted Shortbook request/source/priority/supplier/status, full-scope filters/export and explicit supplier choice; linked PO/receipt transitions update outstanding demand. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Ten Reorder component cases prove selected-row/revision/reason review, read-only controls, history, OPEN/search/date/GSTIN URL scope and full export, stale-response isolation, settings and receipt handoff. This is rendered interaction evidence, not live browser acceptance.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_BROWSER_SCREENSHOT. [ReplenishmentCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx), [reorder-ui-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/reorder-ui-tests.txt), [reorder-shortbook.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/reorder-shortbook.png), [supplier-choice.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-choice.png).

- **INV-35.2** — Users can add/edit a manual request, search and date-filter it, and download the full chosen result set. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: ReplenishmentCenter provides persisted Shortbook request/source/priority/supplier/status, full-scope filters/export and explicit supplier choice; linked PO/receipt transitions update outstanding demand. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Ten Reorder component cases prove selected-row/revision/reason review, read-only controls, history, OPEN/search/date/GSTIN URL scope and full export, stale-response isolation, settings and receipt handoff. This is rendered interaction evidence, not live browser acceptance.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_BROWSER_SCREENSHOT. [ReplenishmentCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx), [reorder-ui-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/reorder-ui-tests.txt), [reorder-shortbook.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/reorder-shortbook.png), [supplier-choice.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-choice.png).

- **INV-35.3** — Automatic suggestions and manual requests are merged without silently duplicating the same demand; source and overrides remain visible. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: ReplenishmentCenter provides persisted Shortbook request/source/priority/supplier/status, full-scope filters/export and explicit supplier choice; linked PO/receipt transitions update outstanding demand. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Sixteen isolated DB cases prove full-population proposals beyond1000 items, input-sensitive demand, cold starts/manual protection, per-line decisions, concurrent shortage deduplication, explicit supplier history/choice, PO idempotence, setup-required delivery failure, partial receipts and cancellation without stock loss. No actual supplier delivery occurred.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [ReplenishmentCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx), [replenishment-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/replenishment-db-results.json), [reorder-shortbook.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/reorder-shortbook.png), [supplier-choice.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-choice.png).

- **INV-35.4** — Select supplier and quantities, then create/approve a linked PO. Shortbook alone never changes stock or supplier dues. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: ReplenishmentCenter provides persisted Shortbook request/source/priority/supplier/status, full-scope filters/export and explicit supplier choice; linked PO/receipt transitions update outstanding demand. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Sixteen isolated DB cases prove full-population proposals beyond1000 items, input-sensitive demand, cold starts/manual protection, per-line decisions, concurrent shortage deduplication, explicit supplier history/choice, PO idempotence, setup-required delivery failure, partial receipts and cancellation without stock loss. No actual supplier delivery occurred.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [ReplenishmentCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx), [replenishment-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/replenishment-db-results.json), [reorder-shortbook.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/reorder-shortbook.png), [supplier-choice.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-choice.png).

- **INV-35.5** — Ordered, partially received, fulfilled and cancelled requests update from linked PO/receipt effects; failed updates remain actionable. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: ReplenishmentCenter provides persisted Shortbook request/source/priority/supplier/status, full-scope filters/export and explicit supplier choice; linked PO/receipt transitions update outstanding demand. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Sixteen isolated DB cases prove full-population proposals beyond1000 items, input-sensitive demand, cold starts/manual protection, per-line decisions, concurrent shortage deduplication, explicit supplier history/choice, PO idempotence, setup-required delivery failure, partial receipts and cancellation without stock loss. No actual supplier delivery occurred.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [ReplenishmentCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx), [replenishment-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/replenishment-db-results.json), [reorder-shortbook.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/reorder-shortbook.png), [supplier-choice.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-choice.png).

### INV-36 — Automatic min/max review

**Area:** Reorder · **PDF:** pages 9, 11 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-auto-targets-review` — [inventory-replenishment.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-replenishment.service.ts:146), declaration `async reviewTargets(`. Narrow assessment: **SOURCE_SUPPORTED**.

> Automatic min/max proposals MUST be previewed and accepted or rejected before replacing active targets, and explicitly excluded manual items MUST remain unchanged.

**Current implementation:** Target proposals retain every active eligible item, prior/proposed values, sales/bounce/refill evidence, cold starts, exclusions and model settings. Explicit versioned per-line decisions precede active target updates. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-36.1** — Off/On, owner, schedule, last/next run and Summary are explicit; disabled controls explain why and offer the correct setup action. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Target proposals retain every active eligible item, prior/proposed values, sales/bounce/refill evidence, cold starts, exclusions and model settings. Explicit versioned per-line decisions precede active target updates. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Ten Reorder component cases prove selected-row/revision/reason review, read-only controls, history, OPEN/search/date/GSTIN URL scope and full export, stale-response isolation, settings and receipt handoff. This is rendered interaction evidence, not live browser acceptance. Sixteen isolated DB cases prove full-population proposals beyond1000 items, input-sensitive demand, cold starts/manual protection, per-line decisions, concurrent shortage deduplication, explicit supplier history/choice, PO idempotence, setup-required delivery failure, partial receipts and cancellation without stock loss. No actual supplier delivery occurred.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [inventory-replenishment.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-replenishment.service.ts), [reorder-ui-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/reorder-ui-tests.txt), [replenishment-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/replenishment-db-results.json), [automation-settings.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/automation-settings.png), [manual-targets.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/manual-targets.png).

- **INV-36.2** — Configure demand lookback, minimum order history, bounce/refill inputs, model/version, min/max cover days and refresh cadence; inputs actually affect the calculation. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Target proposals retain every active eligible item, prior/proposed values, sales/bounce/refill evidence, cold starts, exclusions and model settings. Explicit versioned per-line decisions precede active target updates. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Sixteen isolated DB cases prove full-population proposals beyond1000 items, input-sensitive demand, cold starts/manual protection, per-line decisions, concurrent shortage deduplication, explicit supplier history/choice, PO idempotence, setup-required delivery failure, partial receipts and cancellation without stock loss. No actual supplier delivery occurred.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [inventory-replenishment.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-replenishment.service.ts), [replenishment-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/replenishment-db-results.json), [automation-settings.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/automation-settings.png), [manual-targets.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/manual-targets.png).

- **INV-36.3** — Preview old/proposed targets and impact for every eligible item, including cold-start/no-sales cases, with evidence scope and exclusions. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Target proposals retain every active eligible item, prior/proposed values, sales/bounce/refill evidence, cold starts, exclusions and model settings. Explicit versioned per-line decisions precede active target updates. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Ten Reorder component cases prove selected-row/revision/reason review, read-only controls, history, OPEN/search/date/GSTIN URL scope and full export, stale-response isolation, settings and receipt handoff. This is rendered interaction evidence, not live browser acceptance. Sixteen isolated DB cases prove full-population proposals beyond1000 items, input-sensitive demand, cold starts/manual protection, per-line decisions, concurrent shortage deduplication, explicit supplier history/choice, PO idempotence, setup-required delivery failure, partial receipts and cancellation without stock loss. No actual supplier delivery occurred.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [inventory-replenishment.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-replenishment.service.ts), [reorder-ui-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/reorder-ui-tests.txt), [replenishment-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/replenishment-db-results.json), [automation-settings.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/automation-settings.png), [manual-targets.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/manual-targets.png).

- **INV-36.4** — Accept/reject per item or reviewed bulk selection. Manual exclusions and overrides survive refresh; accepted values can sync to Shortbook. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Target proposals retain every active eligible item, prior/proposed values, sales/bounce/refill evidence, cold starts, exclusions and model settings. Explicit versioned per-line decisions precede active target updates. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Ten Reorder component cases prove selected-row/revision/reason review, read-only controls, history, OPEN/search/date/GSTIN URL scope and full export, stale-response isolation, settings and receipt handoff. This is rendered interaction evidence, not live browser acceptance. Sixteen isolated DB cases prove full-population proposals beyond1000 items, input-sensitive demand, cold starts/manual protection, per-line decisions, concurrent shortage deduplication, explicit supplier history/choice, PO idempotence, setup-required delivery failure, partial receipts and cancellation without stock loss. No actual supplier delivery occurred.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [inventory-replenishment.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-replenishment.service.ts), [reorder-ui-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/reorder-ui-tests.txt), [replenishment-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/replenishment-db-results.json), [automation-settings.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/automation-settings.png), [manual-targets.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/manual-targets.png).

- **INV-36.5** — Historical examples 60 days, 1 order, 10/60 cover days and 112/128 included are editable fixture values, not global hardcoded business rules. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Target proposals retain every active eligible item, prior/proposed values, sales/bounce/refill evidence, cold starts, exclusions and model settings. Explicit versioned per-line decisions precede active target updates. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Sixteen isolated DB cases prove full-population proposals beyond1000 items, input-sensitive demand, cold starts/manual protection, per-line decisions, concurrent shortage deduplication, explicit supplier history/choice, PO idempotence, setup-required delivery failure, partial receipts and cancellation without stock loss. No actual supplier delivery occurred.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [inventory-replenishment.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-replenishment.service.ts), [replenishment-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/replenishment-db-results.json), [automation-settings.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/automation-settings.png), [manual-targets.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/manual-targets.png).

### INV-37 — Supplier recommendations, Auto PO and monitoring

**Area:** Reorder · **PDF:** pages 9 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-auto-po-observable` — [ReplenishmentCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx:34), declaration `export function ReplenishmentCenter(`. Narrow assessment: **SOURCE_SUPPORTED**.

> Automated ordering MUST expose its supplier selection, approval policy, last result and failures; a forecast MUST NOT be presented as a placed or received order.

**Current implementation:** ReplenishmentCenter exposes saved supplier history/basis, owner/cadence/approval settings, idempotent run outcomes and date-scoped monitor records. Unconfigured supplier transport is a persisted setup failure. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-37.1** — Supplier selection shows availability/history, price basis and chosen supplier; a recommendation is not a silent supplier change. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: ReplenishmentCenter exposes saved supplier history/basis, owner/cadence/approval settings, idempotent run outcomes and date-scoped monitor records. Unconfigured supplier transport is a persisted setup failure. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Sixteen isolated DB cases prove full-population proposals beyond1000 items, input-sensitive demand, cold starts/manual protection, per-line decisions, concurrent shortage deduplication, explicit supplier history/choice, PO idempotence, setup-required delivery failure, partial receipts and cancellation without stock loss. No actual supplier delivery occurred.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [ReplenishmentCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx), [replenishment-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/replenishment-db-results.json), [replenishment-monitor.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/replenishment-monitor.png), [automation-settings.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/automation-settings.png), [supplier-choice.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-choice.png).

- **INV-37.2** — Auto PO setup states who approves, what may run automatically, schedule and enabled state; an Off configuration sends no order. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: ReplenishmentCenter exposes saved supplier history/basis, owner/cadence/approval settings, idempotent run outcomes and date-scoped monitor records. Unconfigured supplier transport is a persisted setup failure. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Sixteen isolated DB cases prove full-population proposals beyond1000 items, input-sensitive demand, cold starts/manual protection, per-line decisions, concurrent shortage deduplication, explicit supplier history/choice, PO idempotence, setup-required delivery failure, partial receipts and cancellation without stock loss. No actual supplier delivery occurred.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [ReplenishmentCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx), [replenishment-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/replenishment-db-results.json), [replenishment-monitor.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/replenishment-monitor.png), [automation-settings.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/automation-settings.png), [supplier-choice.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-choice.png).

- **INV-37.3** — Each run exposes proposed/created/approved/sent/failed outcomes and links to POs; retry does not create duplicate orders. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: ReplenishmentCenter exposes saved supplier history/basis, owner/cadence/approval settings, idempotent run outcomes and date-scoped monitor records. Unconfigured supplier transport is a persisted setup failure. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Sixteen isolated DB cases prove full-population proposals beyond1000 items, input-sensitive demand, cold starts/manual protection, per-line decisions, concurrent shortage deduplication, explicit supplier history/choice, PO idempotence, setup-required delivery failure, partial receipts and cancellation without stock loss. No actual supplier delivery occurred. Verification limit: Supplier delivery transport is not configured. Saved SETUP_REQUIRED/FAILED outcomes and retry identity are tested; no SENT success or real external delivery is claimed.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [ReplenishmentCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx), [replenishment-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/replenishment-db-results.json), [replenishment-monitor.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/replenishment-monitor.png), [automation-settings.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/automation-settings.png), [supplier-choice.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-choice.png).

- **INV-37.4** — Monitoring charts explain demand/stock coverage, supplier choices and actual order/receipt outcomes, with date scope and underlying records. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: ReplenishmentCenter exposes saved supplier history/basis, owner/cadence/approval settings, idempotent run outcomes and date-scoped monitor records. Unconfigured supplier transport is a persisted setup failure. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Sixteen isolated DB cases prove full-population proposals beyond1000 items, input-sensitive demand, cold starts/manual protection, per-line decisions, concurrent shortage deduplication, explicit supplier history/choice, PO idempotence, setup-required delivery failure, partial receipts and cancellation without stock loss. No actual supplier delivery occurred.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [ReplenishmentCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx), [replenishment-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/replenishment-db-results.json), [replenishment-monitor.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/replenishment-monitor.png), [automation-settings.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/automation-settings.png), [supplier-choice.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-choice.png).

- **INV-37.5** — Forecast coverage includes all eligible stock categories or clearly states an exclusion; a top-30 sample cannot be labelled a complete replenishment plan. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: ReplenishmentCenter exposes saved supplier history/basis, owner/cadence/approval settings, idempotent run outcomes and date-scoped monitor records. Unconfigured supplier transport is a persisted setup failure. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Sixteen isolated DB cases prove full-population proposals beyond1000 items, input-sensitive demand, cold starts/manual protection, per-line decisions, concurrent shortage deduplication, explicit supplier history/choice, PO idempotence, setup-required delivery failure, partial receipts and cancellation without stock loss. No actual supplier delivery occurred.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [ReplenishmentCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx), [replenishment-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/replenishment-db-results.json), [replenishment-monitor.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/replenishment-monitor.png), [automation-settings.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/automation-settings.png), [supplier-choice.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/supplier-choice.png).

### INV-38 — Purchase orders and partial receipt

**Area:** Reorder · **PDF:** pages 3, 9 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-po-no-stock` — [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:275), declaration `async saveDocument(`. Narrow assessment: **SOURCE_SUPPORTED**.

> Creating a purchase order MUST persist an order only and MUST NOT change inventory quantities, stock movements or supplier payable balances.

**Current implementation:** Workflow saveDocument/transition creates a PO without receipt/payable effects; approved order receipt context tracks posted challans once, preserves partial/cancelled history and rejects overdelivery. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-38.1** — PO has supplier, ordered item quantities/units, prices, expected date, creator, status and links to Shortbook and received documents. **[SOURCE_SUPPORTED]**

  Evidence: Workflow saveDocument/transition creates a PO without receipt/payable effects; approved order receipt context tracks posted challans once, preserves partial/cancelled history and rejects overdelivery. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts), [purchase-order.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-order.png), [inward-challan.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/inward-challan.png).

- **INV-38.2** — Creation and approval do not add stock or create a supplier payable; sending is an explicit authorized action and records delivery/failure. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Workflow saveDocument/transition creates a PO without receipt/payable effects; approved order receipt context tracks posted challans once, preserves partial/cancelled history and rejects overdelivery. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Sixteen isolated DB cases prove full-population proposals beyond1000 items, input-sensitive demand, cold starts/manual protection, per-line decisions, concurrent shortage deduplication, explicit supplier history/choice, PO idempotence, setup-required delivery failure, partial receipts and cancellation without stock loss. No actual supplier delivery occurred. Verification limit: Creation/approval and explicit setup-required send failure are tested. Configured supplier dispatch requires a separate authorized transport check.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts), [replenishment-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/replenishment-db-results.json), [purchase-order.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-order.png), [inward-challan.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/inward-challan.png).

- **INV-38.3** — Valid transitions distinguish draft/pending approval, approved/sent, partially received, received and cancelled; arbitrary status strings do not bypass receipt validation. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Workflow saveDocument/transition creates a PO without receipt/payable effects; approved order receipt context tracks posted challans once, preserves partial/cancelled history and rejects overdelivery. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs. Sixteen isolated DB cases prove full-population proposals beyond1000 items, input-sensitive demand, cold starts/manual protection, per-line decisions, concurrent shortage deduplication, explicit supplier history/choice, PO idempotence, setup-required delivery failure, partial receipts and cancellation without stock loss. No actual supplier delivery occurred.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json), [replenishment-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/replenishment-db-results.json), [purchase-order.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-order.png), [inward-challan.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/inward-challan.png).

- **INV-38.4** — Partial receipts update received and remaining quantities from posted purchases; duplicate receipts do not over-receive, and over-delivery needs a documented decision. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: Workflow saveDocument/transition creates a PO without receipt/payable effects; approved order receipt context tracks posted challans once, preserves partial/cancelled history and rejects overdelivery. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs. Sixteen isolated DB cases prove full-population proposals beyond1000 items, input-sensitive demand, cold starts/manual protection, per-line decisions, concurrent shortage deduplication, explicit supplier history/choice, PO idempotence, setup-required delivery failure, partial receipts and cancellation without stock loss. No actual supplier delivery occurred. The parent-operated local linked-receipt browser flow and database check verify that the linked bill leaves physical stock at 9 and movement count at 3, while its PO records 6 received and 0 remaining. This named fixture supports receipt linkage without a duplicate stock effect; it does not alone prove every cancellation, failed request or overdelivery path.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json), [replenishment-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/replenishment-db-results.json), [purchase-order.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-order.png), [inward-challan.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/inward-challan.png), [linked-receipt-ui-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/linked-receipt-ui-db-proof.json).

- **INV-38.5** — Receive opens Purchases with PO context. Deleting a completed PO cannot erase links or receipt history; cancellation preserves prior receipt effects. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: Workflow saveDocument/transition creates a PO without receipt/payable effects; approved order receipt context tracks posted challans once, preserves partial/cancelled history and rejects overdelivery. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Ten Reorder component cases prove selected-row/revision/reason review, read-only controls, history, OPEN/search/date/GSTIN URL scope and full export, stale-response isolation, settings and receipt handoff. This is rendered interaction evidence, not live browser acceptance. Sixteen isolated DB cases prove full-population proposals beyond1000 items, input-sensitive demand, cold starts/manual protection, per-line decisions, concurrent shortage deduplication, explicit supplier history/choice, PO idempotence, setup-required delivery failure, partial receipts and cancellation without stock loss. No actual supplier delivery occurred. The parent-operated local linked-receipt browser flow and database check verify that the linked bill leaves physical stock at 9 and movement count at 3, while its PO records 6 received and 0 remaining. This named fixture supports receipt linkage without a duplicate stock effect; it does not alone prove every cancellation, failed request or overdelivery path.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_AND_DB. [inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts), [reorder-ui-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/reorder-ui-tests.txt), [replenishment-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/replenishment-db-results.json), [purchase-order.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/purchase-order.png), [inward-challan.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/inward-challan.png), [linked-receipt-ui-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/linked-receipt-ui-db-proof.json).

### INV-39 — Barcode and QR operations

**Area:** Stock · **PDF:** pages 2, 5, 6, 7, 12 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-code-lookup-and-labels` — [WorkspaceStock.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:43), declaration `export function WorkspaceStock(`. Narrow assessment: **SOURCE_SUPPORTED**.

> Barcode/QR lookup and printed labels MUST resolve the intended branch item or batch without changing stock; unknown or ambiguous codes MUST show a recoverable result.

**Current implementation:** WorkspaceStock code lookup and labels identify branch item/batch context; workflow sales use the same eligible item search. Unknown/ambiguous codes and unique SKU/barcode conflicts remain actionable. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-39.1** — Typed/scanned item barcode works from Stock and Sales with the same identity rules, visible matched item/pack and explicit unknown-code recovery. **[SOURCE_SUPPORTED]**

  Evidence: WorkspaceStock code lookup and labels identify branch item/batch context; workflow sales use the same eligible item search. Unknown/ambiguous codes and unique SKU/barcode conflicts remain actionable. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [WorkspaceStock.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx).

- **INV-39.2** — Batch-specific codes select the correct item/batch/expiry; item-level codes still require valid batch allocation before a sale. **[SOURCE_SUPPORTED]**

  Evidence: WorkspaceStock code lookup and labels identify branch item/batch context; workflow sales use the same eligible item search. Unknown/ambiguous codes and unique SKU/barcode conflicts remain actionable. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [WorkspaceStock.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx).

- **INV-39.3** — Print QR is available on item/batch and purchase detail, producing readable labels with item, batch, unit and expiry context. **[SOURCE_SUPPORTED]**

  Evidence: WorkspaceStock code lookup and labels identify branch item/batch context; workflow sales use the same eligible item search. Unknown/ambiguous codes and unique SKU/barcode conflicts remain actionable. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [WorkspaceStock.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx).

- **INV-39.4** — Scanning a supplier payment QR is not treated as an inventory code or an instruction to pay; lookup never changes stock or supplier balances. **[SOURCE_SUPPORTED]**

  Evidence: WorkspaceStock code lookup and labels identify branch item/batch context; workflow sales use the same eligible item search. Unknown/ambiguous codes and unique SKU/barcode conflicts remain actionable. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE. [WorkspaceStock.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx).

- **INV-39.5** — Unknown, duplicate, inactive or cross-branch codes cannot silently select a product; barcode assignment conflicts are actionable. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: WorkspaceStock code lookup and labels identify branch item/batch context; workflow sales use the same eligible item search. Unknown/ambiguous codes and unique SKU/barcode conflicts remain actionable. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen local PostgreSQL cases prove metadata CAS/audit rollback, exact product/pack grouping, unit equivalents, >100 source/hold history, UTC boundary eligibility, >200 expiry scope, and historical payment/credit cutoff reconciliation. Only those exercised clauses are evidenced.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST. [WorkspaceStock.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx), [integrity-backend-gaps-db.json](/Users/nshah/Clinic_Management_System/output/diagnostics/integrity-backend-gaps-db.json).

### INV-40 — Access, branch isolation and reliable effects

**Area:** Today · **PDF:** pages 4, 10, 12 · **Feature acceptance:** PARTIAL

**Contract:** `purchase-role-permission-boundary` — [pharmacy-purchase-invoice.controller.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.controller.ts:65), declaration `export class PharmacyPurchaseInvoiceController`. Narrow assessment: **SOURCE_SUPPORTED**.

> Invoice endpoints MUST enforce both the allowed role and corresponding existing permission using the authenticated branch; Reception access MUST NOT grant unrelated stock, payment or administrative powers.

**Current implementation:** Purchase controllers and workflow/workspace services enforce existing role/permission plus authenticated branch boundaries, with separate ledger capabilities and actor/time/source audit. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-40.1** — Reception with the corresponding existing Inventory permissions can import, correct, review and commit invoices; missing permission produces a clear UI reason and backend denial. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Purchase controllers and workflow/workspace services enforce existing role/permission plus authenticated branch boundaries, with separate ledger capabilities and actor/time/source audit. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST. [pharmacy-purchase-invoice.controller.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.controller.ts), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json).

- **INV-40.2** — Read-only users can inspect authorized originals/status without mutation controls. Disabled UI is not the only enforcement: direct API calls are checked. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Purchase controllers and workflow/workspace services enforce existing role/permission plus authenticated branch boundaries, with separate ledger capabilities and actor/time/source audit. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Nine purchase-actions DB cases cover exact retained bytes/access, 35-bill full export, PDF/QR/CSV/XLSX saved data, audit-failure rollback, original PO/gate-pass/challan links, unchanged posted stock on receipt-linked billing and recorded cost/net11600. This does not verify every photo or printed export device. Nine purchase-actions component cases include permission-gated same-bill/GSTIN credit props, linked source-specific keys and malformed response handling; actual credit balances are checked separately in DB fixtures.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, RENDERED_COMPONENT_TEST. [pharmacy-purchase-invoice.controller.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.controller.ts), [results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/results.json), [recovery-actions-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-actions-tests.txt).

- **INV-40.3** — All record/source lookups and writes use authenticated branch scope; a foreign record ID, supplier, product or source cannot cross branches. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Purchase controllers and workflow/workspace services enforce existing role/permission plus authenticated branch boundaries, with separate ledger capabilities and actor/time/source audit. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs. Nine purchase-actions DB cases cover exact retained bytes/access, 35-bill full export, PDF/QR/CSV/XLSX saved data, audit-failure rollback, original PO/gate-pass/challan links, unchanged posted stock on receipt-linked billing and recorded cost/net11600. This does not verify every photo or printed export device. Eight isolated DB cases prove selected targets/settings CAS, atomic audit rollback, no quantity/price changes, invalid-unit/reason rejection and manual/exclusion preservation. APPROVAL holds small positive variances, posts zero variance at threshold0, and requires explicit manager approval; THRESHOLD permits eligible small positive variance.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST. [pharmacy-purchase-invoice.controller.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.controller.ts), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json), [results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/results.json), [reorder-gaps-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/reorder-gaps-db-results.json).

- **INV-40.4** — Every stock/payment/order effect records actor, time and source with retry/concurrency protection; logging excludes credentials and unnecessary source document content. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Purchase controllers and workflow/workspace services enforce existing role/permission plus authenticated branch boundaries, with separate ledger capabilities and actor/time/source audit. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen local PostgreSQL cases prove metadata CAS/audit rollback, exact product/pack grouping, unit equivalents, >100 source/hold history, UTC boundary eligibility, >200 expiry scope, and historical payment/credit cutoff reconciliation. Only those exercised clauses are evidenced.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST. [pharmacy-purchase-invoice.controller.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.controller.ts), [integrity-backend-gaps-db.json](/Users/nshah/Clinic_Management_System/output/diagnostics/integrity-backend-gaps-db.json).

- **INV-40.5** — Acceptance tests run with isolated fixtures and database namespaces, not production accounts or balances. Permission denial or network failure leaves prior records intact. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Purchase controllers and workflow/workspace services enforce existing role/permission plus authenticated branch boundaries, with separate ledger capabilities and actor/time/source audit. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Thirteen isolated workflow DB cases exercise transactional/retry/shortage effects, count blank/stale/approval behavior, gate-pass no-stock policy, source-limited sale returns, partial PO receipts and branch/permission denial. They are service-driven fixtures rather than staff browser runs.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST. [pharmacy-purchase-invoice.controller.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.controller.ts), [workflow-db-results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/workflow-db-results.json).

### INV-41 — Clear responsive states and accessible controls

**Area:** Today · **PDF:** pages 1, 4, 11 · **Feature acceptance:** PARTIAL

**Contract:** `purchase-required-controls-visible` — [PurchaseInvoiceWorkbench.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:985), declaration `function PurchaseInvoiceEditor(`. Narrow assessment: **SOURCE_SUPPORTED**.

> All controls required to resolve the active invoice’s blockers MUST remain discoverable and keyboard reachable, with the next action and persisted stock state visible without expanding unrelated sections.

**Current implementation:** PurchaseInvoiceEditor and active workflow views expose labelled controls, persistent stock state, recovery/conflict/retry feedback and source access. Rendered tests cover invoice states; full staff/keyboard usability is separate. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-41.1** — At 1440px desktop and 390px mobile widths, essential actions, status and source access remain visible without page-level horizontal scrolling. **[LOCAL_UI_PARTIAL_EVIDENCE]**

  Evidence: Final local browser measurements cover Today, invoice, stock and targets at 1440px and 390px: page scroll width equals viewport width in all eight captures, with a 390px mobile main after the responsive shell fix. Direct inspection of the final invoice-390 image confirms all five destinations, the Task selector, Back to list, View source, New invoice and persisted 9/7 stock receipt are visible without clipping. The desktop invoice also records source access and Stock added state. This is evidence for the named captured states; it does not establish all edit/error/modal states or complete keyboard and staff usability.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT, LOCAL_BROWSER_MEASUREMENT. [PurchaseInvoiceWorkbench.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx), [responsive-ui-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/responsive-ui-proof.json), [today-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/today-1440.png), [invoice-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-1440.png), [stock-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-1440.png), [targets-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/targets-1440.png), [today-390.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/today-390.png), [invoice-390.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-390.png), [stock-390.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-390.png), [targets-390.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/targets-390.png).

- **INV-41.2** — Every input has a label/unit, required vs optional meaning and inline error; errors move focus to the relevant field without erasing valid edits. **[PARTIAL]**

  Evidence: PurchaseInvoiceEditor and active workflow views expose labelled controls, persistent stock state, recovery/conflict/retry feedback and source access. Rendered tests cover invoice states; full staff/keyboard usability is separate. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Verification limit: Labelled controls and recovery/error feedback are implemented; comprehensive inline field-level focus behavior across every workflow has not been independently exercised.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [PurchaseInvoiceWorkbench.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx), [today-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/today-1440.png), [invoice-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-1440.png), [stock-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-1440.png), [targets-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/targets-1440.png).

- **INV-41.3** — Keyboard users can complete selection, edit, source navigation and submission; focus is visible, modal focus is managed and status updates are announced. **[NOT_VERIFIED]**

  Evidence: PurchaseInvoiceEditor and active workflow views expose labelled controls, persistent stock state, recovery/conflict/retry feedback and source access. Rendered tests cover invoice states; full staff/keyboard usability is separate. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Verification limit: No complete keyboard-only selection/edit/source/submission and modal-focus run is recorded for every workflow.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [PurchaseInvoiceWorkbench.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx), [today-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/today-1440.png), [invoice-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-1440.png), [stock-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-1440.png), [targets-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/targets-1440.png).

- **INV-41.4** — Loading, empty, validation error, permission denied, timeout, stale record and success each show an accurate next action; stock-added feedback comes from persisted server state. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: PurchaseInvoiceEditor and active workflow views expose labelled controls, persistent stock state, recovery/conflict/retry feedback and source access. Rendered tests cover invoice states; full staff/keyboard usability is separate. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_BROWSER_SCREENSHOT. [PurchaseInvoiceWorkbench.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt), [today-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/today-1440.png), [invoice-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-1440.png), [stock-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-1440.png), [targets-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/targets-1440.png).

- **INV-41.5** — With a 20-row invoice, all rows remain reachable and the primary action identifies remaining blockers. Required product/supplier/unit confirmations are not randomly collapsed. **[LOCAL_UI_DB_PARTIAL_EVIDENCE]**

  Evidence: PurchaseInvoiceEditor and active workflow views expose labelled controls, persistent stock state, recovery/conflict/retry feedback and source access. Rendered tests cover invoice states; full staff/keyboard usability is separate. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. The 51-case Workbench suite exercises saved-ID selection, 20 rows, primary save/process, explicit review, retained source/supplier data, per-invoice recovery, stale t1/t2 conflicts, lost/empty responses and footer basis. Controlled API fixtures cover these paths, not every browser/permission combination. Parent-operated local browser workflow plus DB proof verifies Eucerin SB-26-136543 (2 rows,9/7 stock,45602 net) and SOURCE-20 (20 rows,3 units each,2240 net), retained byte-identical originals and duplicate retry with no added effects. It is not proof of every supplied photo, every two-page geometry case or staff usability. Parent browser proof selects Line20 Batch Number, opens retained PDF page2 and shows captured SRC-20 with source highlights. Rotation, every geometry shape and every mobile/keyboard path are not inferred from this single source selection.

  Scope: SOURCE_TRACE, RENDERED_COMPONENT_TEST, LOCAL_BROWSER_AND_DB, LOCAL_BROWSER_INTERACTION, LOCAL_BROWSER_SCREENSHOT. [PurchaseInvoiceWorkbench.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx), [recovery-workbench-tests.txt](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-workbench-tests.txt), [invoice-ui-db-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/invoice-ui-db-proof.json), [source-page-ui-proof.json](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/source-page-ui-proof.json), [today-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/today-1440.png), [invoice-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-1440.png), [stock-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-1440.png), [targets-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/targets-1440.png).

- **INV-41.6** — Three representative clinic staff can receive a bill, find a batch, record a count and start a return from the proposed workspace without browser-only back navigation; record completion and any assistance. **[NOT_VERIFIED]**

  Evidence: PurchaseInvoiceEditor and active workflow views expose labelled controls, persistent stock state, recovery/conflict/retry feedback and source access. Rendered tests cover invoice states; full staff/keyboard usability is separate. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Verification limit: Three representative clinic staff have not performed the specified tasks with completion/assistance recorded. An agent-operated browser cannot substitute for these participants.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [PurchaseInvoiceWorkbench.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx), [today-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/today-1440.png), [invoice-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/invoice-1440.png), [stock-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/stock-1440.png), [targets-1440.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/targets-1440.png).

### INV-42 — GST, cost analysis and exports

**Area:** Purchases · **PDF:** pages 3, 5, 6, 11 · **Feature acceptance:** PARTIAL

**Contract:** `inventory-reports-posted-scope` — [pharmacy-compliance.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-compliance.service.ts:35), declaration `async getGstSummary(`. Narrow assessment: **SOURCE_SUPPORTED**.

> Posted GST and financial reports MUST exclude unposted drafts and identify the document statuses, date range and branch used; exports MUST reconcile with the same eligible records.

**Current implementation:** Compliance/ledger/analytics report paths use posted source records, explicit branch/date/status scope and historical recorded cost. Full matching exports/underlying records keep unknown or incompatible cost bases visible. Focused evidence is listed per criterion; this feature is not claimed fully accepted.

- **INV-42.1** — Retain GST input/output/slab summaries, monthly stock/purchase/sales summaries and distributor cost/discount/free-stock analysis as named reachable tools. **[SOURCE_SUPPORTED]**

  Evidence: Compliance/ledger/analytics report paths use posted source records, explicit branch/date/status scope and historical recorded cost. Full matching exports/underlying records keep unknown or incompatible cost bases visible. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture.

  Scope: SOURCE_TRACE, LOCAL_BROWSER_SCREENSHOT. [pharmacy-compliance.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-compliance.service.ts), [reports.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/reports.png).

- **INV-42.2** — Posted financial totals exclude purchase/sales drafts; pending work is separately labelled rather than counted as posted tax or supplier liability. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Compliance/ledger/analytics report paths use posted source records, explicit branch/date/status scope and historical recorded cost. Full matching exports/underlying records keep unknown or incompatible cost bases visible. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen local PostgreSQL cases prove metadata CAS/audit rollback, exact product/pack grouping, unit equivalents, >100 source/hold history, UTC boundary eligibility, >200 expiry scope, and historical payment/credit cutoff reconciliation. Only those exercised clauses are evidenced. Read-only PostgreSQL verification checks filtered posted records, ranking/total parity, recorded identity and credit-read permission boundaries; controlled service tests additionally exercise incompatible/unknown pack cost.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_POSTGRESQL_READ, LOCAL_BROWSER_SCREENSHOT. [pharmacy-compliance.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-compliance.service.ts), [integrity-backend-gaps-db.json](/Users/nshah/Clinic_Management_System/output/diagnostics/integrity-backend-gaps-db.json), [recovery-analytics-read.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-analytics-read.json), [reports.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/reports.png).

- **INV-42.3** — Filters include branch/date and explicit document statuses. Table, totals, drill-down and full-result export use exactly the same eligible records. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Compliance/ledger/analytics report paths use posted source records, explicit branch/date/status scope and historical recorded cost. Full matching exports/underlying records keep unknown or incompatible cost bases visible. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Fifteen local PostgreSQL cases prove metadata CAS/audit rollback, exact product/pack grouping, unit equivalents, >100 source/hold history, UTC boundary eligibility, >200 expiry scope, and historical payment/credit cutoff reconciliation. Only those exercised clauses are evidenced. Read-only PostgreSQL verification checks filtered posted records, ranking/total parity, recorded identity and credit-read permission boundaries; controlled service tests additionally exercise incompatible/unknown pack cost.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_POSTGRESQL_READ, LOCAL_BROWSER_SCREENSHOT. [pharmacy-compliance.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-compliance.service.ts), [integrity-backend-gaps-db.json](/Users/nshah/Clinic_Management_System/output/diagnostics/integrity-backend-gaps-db.json), [recovery-analytics-read.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-analytics-read.json), [reports.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/reports.png).

- **INV-42.4** — Cost comparisons normalize pack/unit and distinguish MRP, PTR, landing price, tax, discounts and free goods so unlike price bases are not ranked together. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Compliance/ledger/analytics report paths use posted source records, explicit branch/date/status scope and historical recorded cost. Full matching exports/underlying records keep unknown or incompatible cost bases visible. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Read-only PostgreSQL verification checks filtered posted records, ranking/total parity, recorded identity and credit-read permission boundaries; controlled service tests additionally exercise incompatible/unknown pack cost.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_READ, LOCAL_BROWSER_SCREENSHOT. [pharmacy-compliance.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-compliance.service.ts), [recovery-analytics-read.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/recovery-analytics-read.json), [reports.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/reports.png).

- **INV-42.5** — Recreate the worked 18% invoice arithmetic and add mixed-tax, free-quantity and rounding cases using the configured formula; this verifies arithmetic, not a new legal tax policy. **[TARGETED_TEST_PARTIAL_EVIDENCE]**

  Evidence: Compliance/ledger/analytics report paths use posted source records, explicit branch/date/status scope and historical recorded cost. Full matching exports/underlying records keep unknown or incompatible cost bases visible. Source trace supports the implementation path; this criterion still requires every clause in its decisive fixture. Nine purchase-actions DB cases cover exact retained bytes/access, 35-bill full export, PDF/QR/CSV/XLSX saved data, audit-failure rollback, original PO/gate-pass/challan links, unchanged posted stock on receipt-linked billing and recorded cost/net11600. This does not verify every photo or printed export device.

  Scope: SOURCE_TRACE, LOCAL_POSTGRESQL_TEST, LOCAL_BROWSER_SCREENSHOT. [pharmacy-compliance.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-compliance.service.ts), [results.json](/Users/nshah/Clinic_Management_System/output/diagnostics/purchase-actions/results.json), [reports.png](/Users/nshah/Clinic_Management_System/output/diagnostics/inventory-workflow/screenshots/reports.png).

## Supporting integrity contracts

The original eight supporting contracts are preserved. Two additional legacy-audit implementation guards are listed after them.

| Contract | Active declaration | Related criterion | Assessment |
|---|---|---|---|
| `inventory-movement-atomic` | [inventory.service.ts:279](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory.service.ts:273) · `async createStockTransaction(` | INV-32.3 | SOURCE_SUPPORTED |
| `inventory-posted-movement-immutable` | [inventory.service.ts:395](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory.service.ts:389) · `async updateStockTransaction(` | INV-27.5 | SOURCE_SUPPORTED |
| `inventory-movement-history-retained` | [inventory.service.ts:408](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory.service.ts:402) · `async deleteStockTransaction(` | INV-32.5 | SOURCE_SUPPORTED |
| `inventory-outbound-no-clamping` | [inventory.service.ts:927](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory.service.ts:921) · `private async updateItemStock(` | INV-32.4 | SOURCE_SUPPORTED |
| `inventory-statistics-money` | [inventory.service.ts:791](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory.service.ts:785) · `async getInventoryStatistics(` | INV-07.3 | SOURCE_SUPPORTED |
| `inventory-shelf-blank-count-not-zero` | [WorkflowDocumentEditor.tsx:71](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:58) · `export function WorkflowDocumentEditor(` | INV-31.2 | SOURCE_SUPPORTED |
| `inventory-audit-blank-count-not-zero` | [WorkflowDocumentEditor.tsx:71](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:65) · `export function WorkflowDocumentEditor(` | INV-31.2 | SOURCE_SUPPORTED |
| `sales-pending-confirmation-stock` | [pharmacy-invoice.service.ts:1143](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-invoice.service.ts:1136) · `async updateStatus(` | INV-24.4 | SOURCE_SUPPORTED |
| `legacy-audit-no-policy-bypass` | [pharmacy-compliance.service.ts:453](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-compliance.service.ts:448) · `async applyAuditAdjustments(` | INV-31.4 | SOURCE_SUPPORTED |
| `legacy-audit-ui-canonical-destination` | [ComplianceCenter.tsx:747](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/ComplianceCenter.tsx:743) · `function LegacyAuditDestination(` | INV-31.4 | SOURCE_SUPPORTED |
| `purchase-declared-stock-unit-precedence` | [pharmacy-purchase-invoice.service.ts:1865](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:1865) · `private mapUnitType(` | INV-17.5 | TARGETED_TEST_PASS |

## Decisive acceptance fixtures

All write tests use a new disposable database/schema and known fake suppliers/users. Compare invoice, document hash, stock rows, movements, audit and payables before/after—not only HTTP status or a success toast.

| Fixture | Required evidence |
|---|---|
| Original Eucerin photo SB-26-136543 | Two products, 9/7 total packs, 45602 net; verify printed GSTIN, explicit uncertain terms and unit; original bytes retained; save/review/commit/reload from same screen; retry adds nothing. |
| Original Folitrax photo SB-26-110614 | All three printed rows preserved; quantities 10/2/10; batches/expiry and 1698 rounded net verified; non-item Loss Item notes do not become stock rows. |
| Original SLV Pharma photo (page 2/2) | It is page 2/2: detect incomplete invoice, retain original, extract visible Tyrodin row (30 paid/15 free) without treating it as proof of complete invoice totals; no auto-post until missing page/details resolved. |
| Original Photostable photo SB-26-149029 | One product across three batches, quantities 1/10/9; preserve distinct prices/expiry and 16435 net; no row merge loses batch identity. |
| Synthetic 20-row one-page and 20-row two-page bills | Every row, repeated product/different batch, page boundaries, all total fields and source links; unreadable row/page causes a review blocker. Prior evidence covers the two-page extraction, not every new criterion. |
| Worked PDF purchase SB-26-43742 | 10 x 983.05, 18% GST, 11600 rounded bill; separate pack/PTR/MRP; linked purchase/batch/payable/source views agree. |
| GSH unit/ledger fixture | 140 tablets = 14 verified strips; 14 x 5112.36 = 71573.04; movement sequence 2570 - 2390 - 10 - 30 = 140; price discrepancy remains explicit. |
| 251+ inventory batches and >100 cosmetic/medicine rows | Pagination, search, valuation, data-quality and expiry queues stay complete beyond old 8/20/100/200 limits; filtered empty differs from loading failure. |
| Return stage transitions | Draft: no effects; Challan: stock only; finalize: supplier effect, no second stock-out; edit/delete rules, concurrency, retry and correction history. |
| Stock count / failure / approval | Blank vs zero; negative/fractional counts; required reason; approval-required variance stays pending; concurrent sale/second count; forced failure rolls back movement and stock. |
| Dispense → partial customer return | DRAFT and PENDING confirmation paths, selected batches, shortage/expiry/hold, repeated line/package products, concurrency, partial return/refund, quarantined goods. |
| Shortbook → approved PO → two partial receipts | Targets, manual exclusions, supplier, order approval, no stock on order, remaining qty after receipts, no duplicate stock or fulfilled demand on retry. |
| Posted accounting | Draft exclusion from dues/GST, payment allocations, concurrent overpayment, credit consumption, final return credit, aging, export reconciliation. |
| Access/navigation | Reception allowed only by corresponding permissions; read-only denial; cross-branch original/invoice/product; refresh/back/deep-link; server error without loss of corrections. |




## Remaining verification limits

- **INV-23.3:** No configured external Gmail mailbox was connected/fetched in acceptance. Setup/disconnected guards and CSV/common validation are source/local evidence only; authorized connected-mailbox behavior remains an external gate.
- **INV-23.4:** No configured external Gmail mailbox was connected/fetched in acceptance. Setup/disconnected guards and CSV/common validation are source/local evidence only; authorized connected-mailbox behavior remains an external gate.
- **INV-23.5:** No configured external Gmail mailbox was connected/fetched in acceptance. Setup/disconnected guards and CSV/common validation are source/local evidence only; authorized connected-mailbox behavior remains an external gate.
- **INV-37.3:** Supplier delivery transport is not configured. Saved SETUP_REQUIRED/FAILED outcomes and retry identity are tested; no SENT success or real external delivery is claimed.
- **INV-38.2:** Creation/approval and explicit setup-required send failure are tested. Configured supplier dispatch requires a separate authorized transport check.
- **INV-41.2:** Labelled controls and recovery/error feedback are implemented; comprehensive inline field-level focus behavior across every workflow has not been independently exercised.
- **INV-41.3:** No complete keyboard-only selection/edit/source/submission and modal-focus run is recorded for every workflow.
- **INV-41.6:** Three representative clinic staff have not performed the specified tasks with completion/assistance recorded. An agent-operated browser cannot substitute for these participants.

These limits remain visible acceptance gates. Agent-driven local evidence cannot stand in for three clinic staff or an authorized configured external integration. No production stock, real supplier dispatch or external mailbox fetch is claimed.

## Traceability validation

The [validator](/Users/nshah/Clinic_Management_System/scripts/diagnostics/validate-inventory-workflow-contracts.cjs) checks all 42 features, 211 immutable criteria, 50 unique existing IDs and owners across active and superseded source, and cc-check declaration bindings. `--refresh-locations` updates line references after intentional formatting without changing criterion text. This is syntax/traceability validation, separate from semantic acceptance.

See the [machine-readable acceptance map](inventory-workflow.acceptance.json), [current source audit](../qa/inventory-workflow-final-gap-audit.md), [Reorder evidence](/Users/nshah/Clinic_Management_System/gates/inventory/reorder-gaps.md), [purchase regression evidence](/Users/nshah/Clinic_Management_System/gates/inventory/ui-regressions.md), and [mapping gates](/Users/nshah/Clinic_Management_System/gates/inventory/contract-mapping.md). The earlier contract review is a historical baseline, not a description of the completed source changes.
