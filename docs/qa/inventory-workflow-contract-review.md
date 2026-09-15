# Inventory workflow contract validation

**The current app does not satisfy the full PDF workflow.** This audit defines 42 feature contracts plus 8 supporting invariants (50 total), with 211 acceptance criteria. The runtime implementation was not changed by this review; the source edits are target contract comments. Existing violations are deliberately surfaced rather than hidden by weakening the target.

Inspected revision: `4586a3e2991edf66b7d2d1105edc81b835710798`. Unrelated prescription edits and untracked diagnostic artifacts were excluded. No production API, stock, supplier balance or deployment was changed.

## Validation result

- `cc-check` 0.2.0: **50/50 contracts discoverable; all 19 source files pass syntax checks**. Ownership is the authenticated GitHub user `nareshshah139`; no notification recipients were added.
- Existing focused backend suites: **6 suites / 77 tests passed**.
- Existing focused frontend suites: **2 suites / 48 tests passed** (PurchaseInvoiceWorkbench and PurchaseSourcePreview).
- New service acceptance probes: **1 passed / 8 failed**, using the actual service methods and in-memory persistence fakes. Failures are target mismatches, not connection/tool errors.
- Earlier same-revision local PostgreSQL/UI evidence was reused for the original Eucerin receipt, duplicate protection, original retention and 20-row two-page source extraction. The four original invoice photos were not rerun during this audit.
- Initial frontend command also named two nonexistent test files (ComplianceCenter and PurchaseLedger); those were runner selection errors. The corrected two-suite run passed. No frontend test coverage is claimed for those missing suites.

`cc-check format` proves syntax only. `list` proves discoverability, not behavior. Passing existing tests proves only their covered cases. Every acceptance criterion remains open until all of its clauses and decisive fixtures pass; partial execution evidence is labelled accordingly in the acceptance map.

## Reproduced pre-existing failures

| Contract / acceptance | Actual behavior | Consequence |
|---|---|---|
| [`inventory-movement-atomic`](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory.service.ts:277) | A failed operation left a persisted PURCHASE movement | A failed receipt/adjustment may leave a movement that is absent from the stock balance. |
| [`inventory-adjustment-direction`](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory.service.ts:497) | Movement encodes 3 while stock changed from 10 to 7 | The movement ledger cannot derive whether generic adjustments increased or reduced stock. |
| [`inventory-posted-movement-immutable`](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory.service.ts:414) | Missing expected rejection: Posted movement edit succeeded without a reversal | Editing a movement changes history without changing the already-posted balance. |
| [`inventory-outbound-no-clamping`](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory.service.ts:1119) | Missing expected rejection: Sale of 15 from stock 10 succeeded | Stored outflows and remaining stock disagree; overselling is hidden by clamping. |
| [`purchase-payables-posted-only`](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-ledger.service.ts:451) | Unposted OCR draft contributes 1000 to supplier outstanding | An incomplete OCR bill can appear as money owed to a supplier. |
| [`inventory-audit-approval-before-post`](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-compliance.service.ts:431) | Stock became 7 although approvalRequired=true | Stock changes before the approval the result says is needed. |
| [`inventory-statistics-money`](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory.service.ts:939) | 10 units at 25 each were valued as 10 | Quantity is presented as a monetary total. |
| [`sales-pending-confirmation-stock`](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-invoice.service.ts:1142) | Result status is CONFIRMED, but no batch was decremented | A legal PENDING → CONFIRMED transition produces a confirmed sale without reducing stock. |

The generic inventory movement failures above concern InventoryService endpoints; the purchase-invoice commit service has a separate transactional implementation with prior isolated database evidence. A working OCR receipt path does not establish that all count, sale, return and financial paths are consistent.

The passing new probe is `inventory-po-no-stock`: creating a PO of 5 units at 25 leaves stock at 10 and writes no stock movement. It does not validate PO approval, dispatch or receipt because those workflows are incomplete.

## Additional source findings

- **Incomplete inventory scope:** ShelfIntelligence loads only 100 MEDICINE rows; cosmetic stock and later pages disappear from location/count queues. Expiry return candidates stop at 200 rows and provide only expired/1m/3m windows.
- **Blank counts become zero:** both shelf counts (`Number(value)`) and Compliance audit (`Number(value || 0)`) can turn an emptied input into a stock-reducing zero count.
- **Draft tax reporting:** GST and monthly report queries include every status except CANCELLED. This repeats the unposted-accounting issue in reports, not just supplier dues.
- **Counter sale and batch review:** the active sale builder requires patientId. Explicit anonymous counter billing and pre-confirmation review of the exact allocated batches are incomplete.
- **History mutation:** deleteStockTransaction reverses and deletes separately, erases history and uses a generic reversal fallback for adjustments; posted corrections need their own immutable record.
- **Navigation/register:** the current workspace nests tabs and restores only the shelf deep link. Recent invoices and unlinked originals have preview limits with no complete review register.
- **Missing workflows in the inspected scope:** staged supplier returns, partial customer returns/refunds, breakage/loss documents, holds, Shortbook, automatic min/max accept/reject, Auto PO monitoring, PO partial receipt, gate-pass/inward-challan links, supplier credits/vouchers and purchase CSV/Gmail intake.

These are current-code findings tied to introduced acceptance obligations. They do not establish that existing production records have already been corrupted. The audit did not reconcile production financial or stock data.

## Contract and caller review scope

No pre-existing @cc directives were found in the targeted inventory/pharmacy/frontend code or called shared helpers. No applicable ancestor CONTRACTS files were found at repository, user, Users or filesystem root. New feature contracts attach to the narrow existing implementation or composition boundary; missing workflows are not represented by fake backend stubs. Their contracts remain failed/unverified targets. Directory-wide CONTRACTS files were not used for feature-specific requirements.

The direct consumers and relevant wrappers inspected are listed below. Counts are distinct production consumer declarations/entry points inspected, not every textual occurrence. Test callers are additional evidence through the named suites. The 64-consumer cap was not reached for any targeted declaration; this is a bounded workflow audit, not exhaustive proof of every application path.

| Contract boundary | Inspected direct consumers / entry points | Count |
|---|---|---|
| InventoryPage | Next /dashboard/inventory route boundary | 1 |
| PharmacyInventoryControl | InventoryPage | 1 |
| ShelfIntelligence | PharmacyInventoryControl; local load/count actions | 1 parent + 2 relevant local paths |
| AddInventoryItemDialog | InventoryPage; handleSubmit → apiClient.createInventoryItem → InventoryController | 1 parent + 1 API chain |
| StockPredictionDashboard | /dashboard/stock-predictions; fetchPredictions/fetchBulkOrder wrappers | 1 parent + 2 API chains |
| PurchaseInvoiceWorkbench | PharmacyInventoryControl; extract/save/process/review/commit and recent-load handlers | 1 parent + 6 relevant local paths |
| PurchaseSupplierReview / PurchaseSourcePreview | PurchaseInvoiceWorkbench for each; source field context/provider | 1 parent each + context |
| PurchaseLedger / ComplianceCenter | PharmacyInventoryControl for each; named payment/report/audit API wrappers | 1 parent each + API chains |
| PharmacyInvoiceBuilderFixed / PharmacyInvoiceList | /dashboard/pharmacy; /dashboard/pharmacy/invoices | 1 route each |
| InventoryService.updateInventoryItem | InventoryController; PharmacyAgentService.applyAction | 2 |
| createStockTransaction | InventoryController; bulkStockUpdate | 2 |
| updateStockTransaction / deleteStockTransaction | respective InventoryController routes | 1 each |
| adjustStock | InventoryController; PharmacyAgentService.applyAction; shelf UI through API wrapper | 2 direct + 1 UI chain |
| updateItemStock | createStockTransaction, deleteStockTransaction, adjustStock, transferStock | 4 |
| findAllStockTransactions / getStockReport / getInventoryStatistics / createPurchaseOrder | respective InventoryController routes | 1 each |
| InventoryImportService.importStarterExcel | InventoryController → starter import API/component | 1 direct + UI chain |
| archiveOriginal / extractDocumentDraft | importFromDocument + extractDraftFromDocument; extractArchivedDocument + locateDocumentSources | 2 each |
| confirmMasterRecord | purchase controller → workbench API | 1 direct + UI chain |
| markReviewed / commitStock | purchase controller; PharmacyAgentService.applyAction | 2 each |
| PurchaseInvoiceController | HTTP routes, global role/permission guards, frontend API wrappers | 1 routed boundary |
| PurchaseLedgerService.findLedgerInvoices | getDistributorSummaries, getDistributorLedger, getAging, getAlerts | 4 |
| ComplianceService.getGstSummary / getExpiryReturns / applyAuditAdjustments | respective ComplianceController route → ComplianceCenter | 1 direct + UI chain each |
| PharmacyInvoiceService.updateStatus | PharmacyInvoiceController → invoice builder/list confirmation API | 1 direct + UI chains |

Internal called implementation paths reviewed include purchase validation/identity, quantity conversion, stock posting, original retrieval/source geometry, role capabilities, ledger allocation, inventory balance mutation, audit approval and sale allocation. The pharmacy agent action dispatcher was inspected because it calls stock adjustment, purchase review and commit directly; no new agent-specific contracts were found. Other unrelated agent actions and prescription work were not audited.

## Remaining verification limits

- No full UI-to-database run of all 42 features exists; many have no implementation yet. No claim of full production readiness or complete compliance is made.
- In-memory probes prove concrete service control-flow failures but are not PostgreSQL concurrency tests. Rollback, serialization, duplicate/payment races and all new state transitions require isolated database tests after fixes.
- Prior invoice/source evidence belongs to this revision and is documented separately; there was no new OCR service transmission in this audit. Only the Eucerin original previously completed the controlled stock-commit path.
- Obscura browser checks found all five areas and all 42 feature entries, exercised source highlighting and the explicitly simulated outcome, and reported no JavaScript errors or horizontal overflow at 1440px and 390px. A mobile button/header spacing issue was corrected in the bounded visual pass. Browser verification covers the local interactive design/criteria artifact, not a rebuilt clinic workflow. Representative staff usability and full role/device acceptance remain open.
- This change adds comments and review artifacts only. Standalone backend TypeScript previously had 74 baseline errors; a complete new build/typecheck was not needed to validate comment-only runtime changes. Transpiling all 19 modified runtime files with comments removed produced identical JavaScript to HEAD.

## Reproduce

From the repository root:

```sh
node scripts/diagnostics/validate-inventory-workflow-contracts.cjs /path/to/cc-check
node scripts/diagnostics/inventory-workflow-contract-probes.cjs /tmp/inventory-contract-probes.json
```

The first command exits zero only for valid/discoverable contract mappings. The second intentionally exits nonzero while target acceptance probes fail. It instantiates services with in-memory fakes; it never constructs a Prisma client or opens a database/network connection.

Machine-readable [results](inventory-workflow-contract-results.json), [acceptance map](../product/inventory-workflow.acceptance.json), [full criteria](../product/inventory-workflow-acceptance.md), and prior [invoice/source review](purchase-invoice-source-review.md).
