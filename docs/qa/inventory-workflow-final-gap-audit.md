# Final inventory source coverage audit

Owner: nareshshah139. This is a read-only review of the current, uncommitted active workspace implementation, dated 2026-09-14. It replaces the old baseline **assessment** for this source snapshot, while retaining every baseline requirement verbatim. No stock, database, browser, live OCR, Gmail or human usability test was executed by this audit. PASS below means source support only; it is not release acceptance. The parent’s live test evidence is separate.

The review is complete as a source inventory; the product is **not fully accepted**. PARTIAL identifies an evidenced missing/unsafe path or an explicitly unperformed acceptance check. Neither a contract annotation nor cc-check syntax success proves runtime compliance.

## Actionable findings

Measured matrix: **42 features / 211 criteria**, 8 feature PASS and 34 feature PARTIAL; 140 criterion PASS and 71 criterion PARTIAL. These are source verdicts, not live acceptance totals.

### F01 [P1] Recovered purchase edits can still be reset or overwrite a newer draft

Receipt initialization still calls resetDraft after recovery. Same-invoice recovery keeps old form values but adopts latest server updatedAt as its save precondition. Parent fixed URL isolation during the audit; that portion is verified in current InventoryWorkspace.

Source: [PurchaseInvoiceWorkbench.tsx:898](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:898), [PurchaseInvoiceWorkbench.tsx:1581](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:1581), [PurchaseInvoiceWorkbench.tsx:1583](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:1583), [InventoryWorkspace.tsx:40](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:40). Criteria: INV-01.4, INV-16.5, INV-18.4.

Minimal fix: Initialize receipts only when no matching recovery exists; persist and compare recovered server revision and require a visible reload/merge decision on mismatch.

### F02 [P1] Price-only linked credit initializes a full bill credit

Parent fixed cross-bill recovery by including kind and source purchase identity. The linked price-only CREDIT_NOTE path still initializes all original purchased quantities at original rates, instead of a reviewed credit amount.

Source: [PurchaseDocumentActions.tsx:59](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/PurchaseDocumentActions.tsx:59), [PurchaseDocumentActions.tsx:81](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/PurchaseDocumentActions.tsx:81), [WorkflowDocumentEditor.tsx:11](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:11), [WorkflowDocumentEditor.tsx:19](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:19). Criteria: INV-20.2, INV-22.1.

Minimal fix: Initialize credit notes as explicit adjustment amounts and supplier returns from remaining eligible source quantities.

### F03 [P1] Customer return price preview still differs from authoritative source terms

Parent fixed refundMode binding, displayed refundAccounting and restored RELEASED reversal. New return lines still use current selling price; the server replaces this with original sale terms and conserves final cents. Row/header totals still recompute from editable fields instead of using saved taxable/tax/total.

Source: [WorkflowDocumentEditor.tsx:34](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:34), [WorkflowDocumentEditor.tsx:49](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:49), [WorkflowDocumentEditor.tsx:62](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:62), [WorkflowDocumentEditor.tsx:74](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:74), [WorkflowDocumentEditor.tsx:77](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:77), [WorkflowDocumentEditor.tsx:79](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:79), [inventory-workflow.service.ts:62](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:62), [inventory-workflow.service.ts:144](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:144). Criteria: INV-26.1, INV-26.4.

Minimal fix: Load and lock original sale terms; render server taxable/tax/total on saved and posted returns, with a preview of the same cent-conservation rule.

### F04 [P2] Sale-return and hold selectors silently stop at their first page

Parent fixed PO selector pagination and SENT inclusion. Original-sale selector still lacks search/pagination and backend caps it at 100. Hold selector caps each kind at 100 and offers posted returns without checking remaining quarantine balance.

Source: [WorkflowDocumentEditor.tsx:25](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:25), [WorkflowDocumentEditor.tsx:26](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:26), [WorkflowDocumentEditor.tsx:31](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:31), [inventory-workspace.service.ts:237](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:237). Criteria: INV-26.1, INV-33.4.

Minimal fix: Provide scoped search/pagination and only eligible source balances; preserve the selected source independently of the current result page.

### F05 [P2] Duplicate partial-order cancellation uses the wrong endpoint

Parent fixed dynamic source-kind links and supplier-return credit source routing. Generic PART_RECEIVED cancellation still calls transition CANCEL, although the dedicated cancel-remaining endpoint is the supported reasoned path.

Source: [WorkflowDocumentEditor.tsx:53](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:53), [WorkflowDocumentEditor.tsx:77](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:77), [ReplenishmentCenter.tsx:103](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx:103), [InventoryWorkspace.tsx:82](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:82). Criteria: INV-38.3, INV-38.5.

Minimal fix: Route partial PO cancellation to the dedicated endpoint or remove the duplicate invalid action.

### F06 [P2] Workflow full-register export and replenishment filter restoration remain incomplete

Parent fixed purchase export parameter mapping and added generic workflow reference/date/GST controls. Generic workflow register still has no full filtered-register export, and date filters use createdAt rather than the document date without stating that scope. Replenishment filters remain component state and ignore Today’s status=OPEN link.

Source: [InventoryWorkspace.tsx:73](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:73), [InventoryWorkspace.tsx:74](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:74), [InventoryWorkspace.tsx:76](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:76), [ReplenishmentCenter.tsx:27](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx:27), [ReplenishmentCenter.tsx:46](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx:46), [pharmacy-purchase-invoice.service.ts:861](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:861). Criteria: INV-01.2, INV-28.5, INV-35.2, INV-42.3.

Minimal fix: Provide full filtered workflow export and explicit date basis; round-trip replenishment filters in the URL and apply status=OPEN.

### F07 [P2] Today queues are not exact outstanding work queues

Orders open an unfiltered replenishment list; CANCELLED purchases satisfy unposted != STOCK_COMMITTED, and CONVERTED workflow records are absent from the frontend terminal exclusion list. Supplier dues is a destination link instead of a scoped due count, and enabled count/replenishment work lacks owner/due details in Today. Failure retains a Loading message without Retry.

Source: [InventoryWorkspace.tsx:68](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:68), [InventoryWorkspace.tsx:69](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:69), [InventoryWorkspace.tsx:70](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:70), [pharmacy-purchase-invoice.service.ts:884](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:884). Criteria: INV-02.1–INV-02.5.

Minimal fix: Define shared outstanding statuses and explicit queue scopes; link each count to that exact query; show owner/due and overdue balances; render error with retry separately from loading/zero.

### F08 [P1] The active item metadata endpoint bypasses conflict checks and audit history

saveItem accepts barcode/SKU and metadata/minmax changes but neither checks branch barcode/SKU conflicts nor writes an actor/reason/before-after audit event. The older inventory service has conflict checks, but the active workspace route does not call it. The database already enforces unique codes; the missing API handling turns a conflict into a generic failure rather than allowing duplicate storage.

Source: [inventory-workspace.service.ts:103](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:103), [inventory-workspace.service.ts:108](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:108), [inventory-workspace.service.ts:116](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:116), [WorkspaceStock.tsx:27](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:27). Criteria: INV-04.4, INV-04.5, INV-34.3, INV-39.5, INV-40.4.

Minimal fix: Perform validated unique identity checks and a versioned metadata audit in the same transaction; require a reason for manual target overrides. Preserve quantities and cost snapshots.

### F09 [P2] Item details merge unlike identities and lack inverse pack equivalents

Sibling batches are selected by name and stock unit, not master/pack/form identity; purchases are matched by name and batch. Base-quantity presentation multiplies pack units but never shows 140 TABLETS as 14 verified strips. Conflicting master/batch price bases lack a review/explanation control.

Source: [inventory-workspace.service.ts:17](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:17), [inventory-workspace.service.ts:93](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:93), [inventory-workspace.service.ts:96](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:96), [WorkspaceStock.tsx:25](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:25), [WorkspaceStock.tsx:29](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:29). Criteria: INV-04.3, INV-06.1, INV-06.2, INV-06.4, INV-06.5.

Minimal fix: Group and link by saved product/master IDs plus explicit pack identity; present both stock/base and verified pack equivalents; show unresolved price-basis conflicts without inferring conversion from prices.

### F10 [P2] Expiry boundary copy and valuation views disagree with available data

Backend compares expiry with the exact current timestamp, while UI says the displayed day is inclusive. UI omits expired base/landing totals and unknown-tax counts; current/expired labels do not expose the server’s exact scope boundary.

Source: [inventory-workspace.service.ts:38](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:38), [inventory-workspace.service.ts:65](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:65), [inventory-workspace.service.ts:83](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:83), [WorkspaceStock.tsx:41](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:41). Criteria: INV-03.3, INV-07.1, INV-07.5, INV-30.1, INV-30.2.

Minimal fix: Choose one documented date policy, use it in list/confirmation/export, and render server filterScope plus all four current/expired bases and unknown components.

### F11 [P1] Opening import can rewrite an operating batch’s historical basis

Repeat import rejects a changed quantity but still updates packSize, packUnit, expiry and costPrice on the existing batch and forces type MEDICINE. It does not require a linked price/identity correction for those changes.

Source: [inventory-import.service.ts:626](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-import.service.ts:626), [inventory-import.service.ts:637](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-import.service.ts:637), [inventory-import.service.ts:666](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-import.service.ts:666). Criteria: INV-04.2, INV-04.4, INV-08.5.

Minimal fix: On an existing operating batch, permit only explicitly reviewed prospective metadata, reject historical pack/cost/expiry replacement, and represent cosmetics/consumables with their real type.

### F12 [P2] Supplier maintenance is separate from bills and credit-bearing account detail

Supplier editor exposes basic contact/address/GST/active state but no licence fields or bill/dues drill-down. Ledger invoice rows are plain text; its type/rendering omit the backend creditApplied and credit history. A credit-adjusted bill therefore cannot be understood from cash paid and outstanding alone.

Source: [InventoryWorkspace.tsx:81](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:81), [PurchaseLedger.tsx:76](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseLedger.tsx:76), [PurchaseLedger.tsx:599](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseLedger.tsx:599). Criteria: INV-09.5, INV-21.1.

Minimal fix: Add supplier-to-account/bill links and licences, render separate cash and credits with source links, and use distinct create/update capabilities for maintenance.

### F13 [P2] Credits are usable only from a separate workspace tab

CreditWorkspace has amount checks/allocation/reversal, but neither purchase review nor the supplier account exposes eligible credits or an Apply credit action. Applied rows show amount/date without a linked target bill. This violates purchase-credit-adjustment-visible at the active PurchaseLedger caller.

Source: [InventoryWorkspace.tsx:59](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:59), [InventoryWorkspace.tsx:82](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:82), [PurchaseDocumentActions.tsx:69](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/PurchaseDocumentActions.tsx:69), [PurchaseLedger.tsx:133](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseLedger.tsx:133). Criteria: INV-21.1, INV-22.1, INV-22.2, INV-22.5.

Minimal fix: Open the shared allocation panel from the current bill and supplier account with supplier/bill preselected; link source credit and target bill, retaining current atomic service checks.

### F14 [P2] Alternate intake omits required channel metadata and scheme mapping

CSV mapping/template omit the explicit schemeAmount now present in manual purchase rows. Gmail server returns lastSyncAt but the connected screen never displays it; initial status failure continues showing Checking without an explicit retry.

Source: [inventory-intake.service.ts:15](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-intake.service.ts:15), [inventory-intake.service.ts:36](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-intake.service.ts:36), [AlternateInvoiceIntake.tsx:15](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/AlternateInvoiceIntake.tsx:15), [AlternateInvoiceIntake.tsx:16](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/AlternateInvoiceIntake.tsx:16). Criteria: INV-23.3, INV-23.5, INV-42.4.

Minimal fix: Map/validate schemeAmount through the common draft model, display last fetch and its scope, and give status/fetch failures a recoverable retry.

### F15 [P2] Counter-sale batch proposals are only FEFO within an arbitrary first 30

Search retrieves 30 name-sorted stock rows, then sorts those by expiry in the browser. It includes expired/inactive/held rows in suggestions and has no explicit recorded FEFO override. Server guards prevent selling ineligible stock, but do not make the proposal complete or explain an override.

Source: [WorkflowDocumentEditor.tsx:30](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:30), [WorkflowDocumentEditor.tsx:34](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:34), [inventory-workflow.service.ts:272](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:272). Criteria: INV-24.3, INV-39.1, INV-39.2.

Minimal fix: Request eligible stock with server expiry sorting and full product identity; show allocation basis and a recorded allowed override, then revalidate on confirmation.

### F16 [P2] Counting and hold history controls omit policy details

Settings expose count enablement/count/threshold but not auditAdjustmentMode. Generic document history omits event reason/detail; item holds show effect deltas without owner/time/unit/reason or an aggregate remaining active hold.

Source: [ReplenishmentCenter.tsx:110](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx:110), [ReplenishmentCenter.tsx:113](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx:113), [WorkspaceStock.tsx:31](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:31), [WorkflowDocumentEditor.tsx:80](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:80). Criteria: INV-31.1, INV-31.5, INV-33.1.

Minimal fix: Expose explicit stock-adjustment mode, render before/after and reason details, and show each hold’s remaining balance, owner, time and source-specific actions.

### F17 [P2] Manual target edits and exclusions lack the required reviewed controls

Single-item min/max editing is reachable and automatic review preserves manual overrides, but no reviewed bulk manual-target editor or exclusion selector is exposed. The active item editor does not expose reorderLevel and has no reason/history for manual edits.

Source: [WorkspaceStock.tsx:27](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:27), [ReplenishmentCenter.tsx:77](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx:77), [ReplenishmentCenter.tsx:110](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx:110), [inventory-replenishment.service.ts:52](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-replenishment.service.ts:52). Criteria: INV-34.1, INV-34.3, INV-34.4, INV-36.4.

Minimal fix: Add a reviewed manual bulk target change with unit/reason/version; expose exclusions and reorderLevel, keeping automatic per-line review unchanged.

### F18 [P2] Reports and distributor comparison lack full eligible-set parity

Compliance UI does not expose source drill-down/full export/status scope or unknown historical costs; errors render numeric zero cards. Analytics includes REVIEWED unposted invoices, silently slices ranked lists to limit, and groups by packSize without packUnitType/product identity. Effective cost can compare unlike declared units.

Source: [ComplianceCenter.tsx:444](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/ComplianceCenter.tsx:444), [pharmacy-compliance.service.ts:270](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-compliance.service.ts:270), [pharmacy-purchase-invoice.service.ts:940](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:940), [pharmacy-purchase-invoice.service.ts:985](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:985), [pharmacy-purchase-invoice.service.ts:1423](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:1423). Criteria: INV-07.4, INV-41.4, INV-42.2, INV-42.3, INV-42.4.

Minimal fix: Share explicit posted/pending/date/branch/status scope across tables/totals/export; surface unknown costs; paginate complete records; normalize compatible unit bases before ranking and separate reviewed unposted analysis.

### F19 [P1] Historical supplier as-of balances use present-day financial state

asOfDate changes aging labels/fiscal-year calculations, but invoice/payment retrieval is not date-capped and current creditApplied is used. A later payment, credit application or reversal changes the answer for an earlier date. Current-date integrity is distinct from this historical limitation.

Source: [pharmacy-purchase-ledger.service.ts:186](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-ledger.service.ts:186), [pharmacy-purchase-ledger.service.ts:191](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-ledger.service.ts:191), [pharmacy-purchase-ledger.service.ts:478](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-ledger.service.ts:478), [pharmacy-purchase-ledger.service.ts:533](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-ledger.service.ts:533). Criteria: INV-21.5, INV-22.5, INV-42.3.

Minimal fix: Reconstruct invoices, payment allocations and credit application/reversal events through the requested cutoff (with a documented effective-date rule), or remove the historical claim until supported.

### F20 [P2] Error and accessibility states still need completion

Failed list/report loads can coexist with zero/no-results output. Many workflow validation errors are only a top alert, without field focus. Item/settings unsaved edits have no recovery/discard decision. Dense workflow tables have labelled controls and local overflow, but that is not a keyboard/mobile usability test.

Source: [InventoryWorkspace.tsx:73](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:73), [InventoryWorkspace.tsx:76](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:76), [WorkspaceStock.tsx:12](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:12), [WorkspaceStock.tsx:41](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:41), [WorkflowDocumentEditor.tsx:35](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:35), [ComplianceCenter.tsx:444](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/ComplianceCenter.tsx:444). Criteria: INV-01.4, INV-03.4, INV-41.1–INV-41.6.

Minimal fix: Render mutually exclusive loading/error/empty states, preserve or confirm dirty forms, map server validation to focused fields, and execute keyboard/390px/1440px plus three-staff task checks.

### F21 [P2] Purchase header/footer still omit baseline fields and summaries

HeaderForm has transport and receipt dates but no explicit order reference. Entered-by is audit metadata rather than a visible header value. Footer shows Gross/Taxable/GST/TCS/Net but no paid/free totals or margin basis. The separate scheme field is present in current manual rows.

Source: [PurchaseInvoiceWorkbench.tsx:64](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:64), [PurchaseInvoiceWorkbench.tsx:2729](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:2729). Criteria: INV-14.1, INV-14.3.

Minimal fix: Expose linked/manual order reference and entered-by, and add row count, paid/free totals and an explicitly defined margin summary without replacing original printed totals.

### F22 [P2] Generic correction action is offered for immutable source-owned movements

Item ledger offers Correct for every movement to approvers, while the correction service rejects workflow/invoice-owned movements and requires correction of their source. The user reaches an avoidable error without being routed to that source.

Source: [WorkspaceStock.tsx:32](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:32), [inventory-workspace.service.ts:249](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:249). Criteria: INV-20.2, INV-27.4, INV-32.5.

Minimal fix: Detect source ownership in the read response and route to the proper source reversal/correction action; offer signed movement correction only for eligible standalone adjustments.

## Criterion matrix

Each criterion is copied verbatim from the baseline JSON. **PASS** means the traced code supports the criterion; **PARTIAL** means a recorded gap or explicitly unperformed acceptance procedure. Source links at each feature identify its active implementation. Fixture arithmetic may be source-supported while the requested live fixture remains PARTIAL.

## INV-01 — One inventory workspace — PARTIAL (source only)

Trace: [InventoryWorkspace.tsx:19](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:19), [InventoryWorkspace.tsx:35](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:35), [WorkflowDocumentEditor.tsx:19](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:19), [PurchaseInvoiceWorkbench.tsx:898](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:898). Baseline obligation: `inventory-workspace-navigation`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-01.1 | PASS | Five persistent destinations use the labels Today, Purchases, Stock, Sales and Reorder. Every component in this specification has a reachable named destination. | Five named URL destinations and child routes are present. |
| INV-01.2 | PARTIAL | Opening a record shows an in-app Back to list action. It restores the originating search, filters, page and selected workflow area. | F06: dynamic source-kind links are fixed; replenishment filters still live only in component state. |
| INV-01.3 | PASS | Deep links, reload, browser Back and Forward restore the selected area and record. They do not silently open Supplier OCR instead. | URL isolation now clears competing invoice/receipt/intake IDs; selected area and record are URL-backed. |
| INV-01.4 | PARTIAL | Unsaved edits survive navigation or trigger a clear discard decision; switching invoices never applies one invoice’s draft to another. | F01/F20: linked workflow recovery identity fixed; purchase revision/receipt recovery and dirty metadata/settings gaps remain. |
| INV-01.5 | PASS | Common tasks start within two navigation actions from the workspace: receive invoice, find batch, dispense, return, count and reorder. | Workspace menus expose receive, stock, counter sale, return, count and reorder. |

## INV-02 — Daily work queue — PARTIAL (source only)

Trace: [InventoryWorkspace.tsx:68](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:68), [inventory-workspace.service.ts:138](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:138). Baseline obligation: `inventory-daily-action-queues`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-02.1 | PARTIAL | Start-of-day view lists unresolved uploads/drafts, low stock and expiring batches; close-of-day view includes unfinished returns and supplier dues. | F07: supplier close-of-day dues and owner/due queues are incomplete. |
| INV-02.2 | PARTIAL | Each queue shows its branch, date/filter scope, record count and next action. Opening the count yields exactly that scope. | F07: outstanding PO count does not open its exact status scope. |
| INV-02.3 | PARTIAL | An empty queue says No matching records; failed loading says Could not load with Retry. An error never displays a reassuring zero. | F07/F20: error is not a distinct retry state. |
| INV-02.4 | PARTIAL | Completed work leaves the outstanding queue after authoritative reload; saved-but-unposted invoices stay visible as Stock not added. | F07: cancelled invoices and converted records can remain outstanding. |
| INV-02.5 | PARTIAL | Weekly counting and replenishment review appear with owner and due date once enabled; inactive automation is clearly labelled Off. | F07: owner/due detail exists in setup, not the Today queue. |

## INV-03 — Stock search and filters — PARTIAL (source only)

Trace: [WorkspaceStock.tsx:36](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:36), [inventory-workspace.service.ts:34](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:34). Baseline obligation: `inventory-filter-parity`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-03.1 | PASS | Search finds item name, SKU and barcode. A scanned barcode and the same typed barcode identify the same branch-scoped item. | Name/SKU/barcode and encoded branch item ID use the stock lookup. |
| INV-03.2 | PASS | Filters include expired/upcoming expiry, low/high/positive/zero/negative stock, category, dosage, schedule, GST, manufacturer, location, HSN, price and margin. | All listed filter categories have UI/service fields. |
| INV-03.3 | PARTIAL | Audit/adjustment status filters include Pending, Completed and Blocked. Filter definitions and boundary dates are visible and consistent with results. | F10: visible expiry day semantics differ from exact timestamp comparison. |
| INV-03.4 | PARTIAL | Apply filters, Clear filters, active filter chips, sort and pagination work together. Loading failure, no matching records and not-yet-applied filters are distinct. | F20: failure can coexist with zero/no-match output; filters except search apply immediately. |
| INV-03.5 | PASS | Counts, sums and export scope cover all matching records, including records beyond page 1; no first-page number is labelled as the full inventory total. | Service filters complete branch population before paging; CSV iterates every page. |

## INV-04 — Item master and classification — PARTIAL (source only)

Trace: [WorkspaceStock.tsx:27](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:27), [inventory-workspace.service.ts:103](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:103), [inventory-import.service.ts:637](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-import.service.ts:637). Baseline obligation: `inventory-master-not-balance`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-04.1 | PARTIAL | An item has name, optional manufacturer, strength/form where applicable, category, pack label and conversion, HSN, GST, location and replenishment settings. | F17: active existing-item editor lacks reorderLevel/pack control; creation supports pack fields. |
| INV-04.2 | PARTIAL | Medicines, cosmetics and consumables can be represented without inventing a drug strength or making manufacturer mandatory. | F11: creation supports categories, but opening migration forces MEDICINE. |
| INV-04.3 | PARTIAL | Master identity, pack and standard price are visibly separate from batch-specific expiry, quantity and paid purchase prices. | F09: master/batch grouping remains name/unit based, without a distinct identity review. |
| INV-04.4 | PARTIAL | Changing master metadata does not alter historical invoices, posted quantities or historical batch price basis; affected future operations use a versioned audit trail. | F08/F11: metadata lacks audit; repeat import can replace historical basis. |
| INV-04.5 | PARTIAL | Duplicate identity warnings distinguish same product/different batch from a duplicate master. Ambiguous identities are not merged silently. | F08/F09: barcode conflicts bypassed and sibling identities are conflated. |

## INV-05 — Data quality and location queues — PASS (source only)

Trace: [WorkspaceStock.tsx:39](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:39), [inventory-workspace.service.ts:23](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:23), [inventory-workspace.service.ts:67](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:67). Baseline obligation: `inventory-quality-complete-scope`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-05.1 | PASS | Missing location, min/max, category and HSN each opens a repairable queue with a defined denominator and current count. | Quality issue counts and missing-field filters open repairable item lists. |
| INV-05.2 | PASS | All relevant categories, including cosmetic invoice stock, and every server page contribute to the queue totals. | Quality counts inspect all branch categories before paging. |
| INV-05.3 | PASS | Unmapped product rows and items waiting for mapping remain distinct when their scope differs; overlapping counts are not summed. | Mapping status distinguishes pending from unmapped; no combined summed backlog. |
| INV-05.4 | PASS | Location can be assigned individually or in a reviewed bulk action. Refresh confirms the saved rack/shelf/bin and updates its queue. | Single-item and transactional versioned bulk locations are reachable. |
| INV-05.5 | PASS | The sample PDF numbers (254/251/92/23 and 58/62) are test examples only; production counts are calculated, never hardcoded. | Queues derive from stored rows; no sample dashboard constants are used. |

## INV-06 — Item detail, batches and unit conversion — PARTIAL (source only)

Trace: [WorkspaceStock.tsx:28](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:28), [inventory-workspace.service.ts:89](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:89). Baseline obligation: `inventory-item-batch-workspace`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-06.1 | PARTIAL | Item detail has Batches, Purchases, Purchase returns, Sales, Sales returns, Ledger, Blocked stock and Additional information views, plus a clear return to Stock. | F09: all tabs exist, but some histories/batches are matched by name instead of saved identity. |
| INV-06.2 | PARTIAL | Each batch shows batch number, expiry, base-unit balance, pack-equivalent balance, location, MRP, PTR, landing price, margin and GST with units. | F09: base equivalent exists; inverse pack equivalent is missing. |
| INV-06.3 | PASS | Hide zero-stock batches is reversible and does not delete batches or their history. | Hide-zero is local filtering; it does not mutate history. |
| INV-06.4 | PARTIAL | For a verified 10-tablet strip, 140 tablets displays as 14 strips. Paid and free packs convert once; unknown conversion blocks posting, rather than guessing. | F09: 140 base units do not display 14 verified strips; no fixture execution in this audit. |
| INV-06.5 | PARTIAL | GSH-like conflicting master and batch prices trigger a price-basis explanation/review; no code infers a conversion solely from the price ratio. | F09: unknown basis is labelled but conflicting bases have no review/explanation flow. |

## INV-07 — Stock value and price basis — PARTIAL (source only)

Trace: [inventory-workspace.service.ts:83](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:83), [WorkspaceStock.tsx:41](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:41), [inventory-stock.ts:28](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-stock.ts:28). Baseline obligation: `inventory-valuation-basis`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-07.1 | PARTIAL | Current and expired stock have separate PTR, landing price, MRP and base-price views. Every amount states date, branch, tax treatment and unit basis. | F10: all server values are not exposed as four current/expired UI views. |
| INV-07.2 | PASS | For 14 packs at PTR 5112.36 per pack, PTR value is 71573.04; it is not 140 times the pack price. | Per-stock-unit quantity × PTR formula supports this arithmetic; no execution claimed. |
| INV-07.3 | PASS | For 10 units at cost 25, stock value is 250, not 10. Values cover the complete filtered set, not just visible rows. | Complete filtered rows are summed as quantity × cost. |
| INV-07.4 | PARTIAL | Landing price, scheme/free-unit allocation, margin, rounding and base-price tax treatment have an explicit versioned formula and fixture tests before acceptance. | F18: formulas/snapshots exist, but analytics can mix unlike units; fixtures require separate evidence. |
| INV-07.5 | PARTIAL | Unresolved price-basis discrepancies are shown as unresolved, not silently converted; the four historical dashboard amounts in the PDF are not assumed reconciled. | F09/F10: unknown landing is shown, but conflicting basis and missing tax are not fully surfaced. |

## INV-08 — Opening stock and migration — PARTIAL (source only)

Trace: [inventory-import.service.ts:185](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-import.service.ts:185), [inventory-import.service.ts:626](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-import.service.ts:626), [WorkflowDocumentEditor.tsx:45](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:45). Baseline obligation: `inventory-opening-import-retry`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-08.1 | PASS | Opening stock is a clearly named setup/import task distinct from receiving a supplier invoice; manual opening entry and migration/template upload are reachable. | Named manual opening and Opening stock Excel routes exist. |
| INV-08.2 | PASS | Preview maps item identity, pack, batch, expiry, quantity, prices, tax, location and min/max and marks errors at the exact source row before posting. | Preview/source-row validation covers identity/stock/price/tax/location/targets. |
| INV-08.3 | PASS | One opening-stock ledger effect per accepted row records user, branch, import ID and source; it never creates a supplier payable. | Import movements use source/import/user/branch; no supplier payable is created. |
| INV-08.4 | PASS | Retry does not double stock. Duplicate same-item/same-batch rows are surfaced; partial success reports exactly which rows succeeded and which did not. | Retry/source hashes and row duplicate checks are implemented; accepted/rejected rows are reported. |
| INV-08.5 | PARTIAL | An existing operating batch cannot be silently reset by a repeated migration; changing its opening balance requires an explicit reconciliation/correction decision. | F11: quantities cannot reset, but existing historical pack/expiry/cost can change. |

## INV-09 — Supplier selection and maintenance — PARTIAL (source only)

Trace: [PurchaseInvoiceWorkbench.tsx:2200](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:2200), [pharmacy-purchase-invoice.service.ts:174](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:174), [InventoryWorkspace.tsx:81](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:81). Baseline obligation: `purchase-supplier-inline-resolution`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-09.1 | PASS | Invoice review shows extracted supplier name and GSTIN beside saved-supplier matches and a source link; similar names with different GSTINs remain distinct. | Invoice review exposes extracted identity and saved supplier comparison/source controls. |
| INV-09.2 | PASS | A reviewer can select a saved supplier or verify/create supplier details on that same screen, subject to existing permissions. | Same-screen supplier selection/creation is permission gated. |
| INV-09.3 | PASS | Inactive, cross-branch, duplicate or ambiguous matches cannot silently qualify for automatic intake; the next corrective action is explicit. | Saved supplier matching requires active branch/GST identity; ambiguity blocks automation. |
| INV-09.4 | PASS | Name/GSTIN corrections persist on Save & Process without clearing invoice lines, source links or other reviewed values. | Supplier corrections share the current purchase draft payload. |
| INV-09.5 | PARTIAL | Supplier account detail exposes contact/address, GSTIN/licences, active state, bills and dues. Deactivating a supplier preserves its historical documents. | F12: basic editor lacks licences and account/bill links. |

## INV-10 — Capture and retain originals — PASS (source only)

Trace: [PurchaseInvoiceWorkbench.tsx:1300](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:1300), [pharmacy-purchase-invoice.service.ts:182](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:182), [pharmacy-purchase-invoice.service.ts:301](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:301). Baseline obligation: `purchase-original-byte-retention`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-10.1 | PASS | Mobile camera/photo selection and desktop photo/PDF upload accept every invoice page in order; several photos can belong to one invoice. | Multi-file photo/PDF flow retains input order and camera/photo entry. |
| INV-10.2 | PASS | The exact original photo/PDF is retained with filename, MIME, byte size, hash, uploader, branch and timestamp; preview rotation never changes original bytes. | Archive records filename/MIME/size/hash/uploader/branch/time before extraction. |
| INV-10.3 | PASS | OCR failure leaves a recoverable original upload with Retry extraction or Enter manually; the invoice is not claimed to be saved if only its file was archived. | Extraction failure retains original and offers retry/manual entry. |
| INV-10.4 | PASS | Empty, corrupt, unsupported and oversized inputs produce an actionable error; extraction timeout remains distinguishable from a rejected file. | File validation and extraction failure paths are distinct in service/UI. |
| INV-10.5 | PASS | Originals remain downloadable after correction and posting. An unauthorized branch/user cannot retrieve or annotate another branch’s source. | Authenticated branch lookup protects retained originals; append does not replace bytes. |

## INV-11 — OCR extraction and completeness — PARTIAL (source only)

Trace: [pharmacy-purchase-invoice.service.ts:301](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:301), [pharmacy-purchase-invoice.service.ts:1640](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:1640), [PurchaseInvoiceWorkbench.tsx:1350](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:1350). Baseline obligation: `purchase-ocr-completeness-before-auto`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-11.1 | PARTIAL | Extract supplier identity, invoice/date/terms, all product rows, pack, batch, expiry, paid/free quantity, MRP/PTR, discount/scheme, tax and totals. | F14: manual scheme field exists, but alternate extraction/mapping parity is incomplete. |
| INV-11.2 | PARTIAL | A 20-item list and a 20-item two-page invoice return 20 distinct rows in source order, including repeated products on different batches and page-boundary rows. | Source enforces ordered rows and completeness; this audit did not execute both 20-row OCR inputs. |
| INV-11.3 | PASS | Independent-read disagreements and unreadable/missing values remain explicit; derived values are distinguishable from directly printed values. | Independent extraction/verification preserves disagreements and original reported values. |
| INV-11.4 | PASS | An incomplete page, truncated response, unsupported date or total mismatch blocks automatic stock posting and offers a visible repair/retry action. | Completeness/flags/receipt/totals checks prevent automatic posting until repaired. |
| INV-11.5 | PASS | Printed document text is treated as invoice data, not instructions to the application or OCR agent. No inferred manufacturer, bill type or unit is accepted without evidence or review. | OCR prompts explicitly treat document text as data and prohibit guessed identity/units. |

## INV-12 — Linked source image and PDF review — PASS (source only)

Trace: [PurchaseInvoiceWorkbench.tsx:1631](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:1631). Baseline obligation: `purchase-source-links-honest`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-12.1 | PASS | Clicking an extracted header or line value reveals its original page and highlighted region; clicking a region focuses the matching field. | PurchaseSourcePreview field icons and region buttons navigate both directions. |
| INV-12.2 | PASS | Zoom, rotation and page selection preserve alignment. Reordering/deleting invoice lines cannot move a source link to another batch. | Stable OCR source references and transformed coordinates preserve page/rotation linkage. |
| INV-12.3 | PASS | Missing, derived or uncertain locations display No reliable printed location; an approximate box is labelled estimated rather than exact OCR truth. | Missing/estimated source regions are explicitly distinguished from printed certainty. |
| INV-12.4 | PASS | Edited values keep their original captured value/source context. Source navigation remains usable after stock commit when editing is locked. | Source context uses original values and remains viewable when posted fields are locked. |
| INV-12.5 | PASS | On desktop the form and source can be compared side by side; on mobile a persistent source action returns to the same field without losing edits. | Responsive preview and source actions preserve current field; actual device usability requires separate evidence. |

## INV-13 — Product matching and pack identity — PASS (source only)

Trace: [PurchaseInvoiceWorkbench.tsx:2200](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:2200), [pharmacy-purchase-invoice.service.ts:1830](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:1830). Baseline obligation: `purchase-match-identity-before-stock`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-13.1 | PASS | Review candidates compare printed product, strength/form where relevant, pack, classification and batch context, not name similarity alone. | Candidate product/pack/form/classification context is visible in matching flow. |
| INV-13.2 | PASS | Automatic matching requires one compatible active product in the current branch. Ambiguous matches block auto-posting. | Automatic resolution requires a unique compatible active branch product. |
| INV-13.3 | PASS | Reviewer can choose or create the correct medicine/cosmetic/consumable in the same invoice screen and return to the exact unresolved row. | Inline product creation supports medicine/cosmetic/consumable and returns to current row. |
| INV-13.4 | PASS | Manufacturer is optional in creation, saving, review and commit. Missing manufacturer never becomes a hidden blocker. | Manufacturer is optional; missing-manufacturer flags are removed from blocking requirements. |
| INV-13.5 | PASS | The selected product and verified pack conversion persist after save/reload and are the identity used for inventory and subsequent dispensing. | Selected product and stock-unit/pack mapping are saved for commit and later stock use. |

## INV-14 — Complete manual purchase entry — PARTIAL (source only)

Trace: [PurchaseInvoiceWorkbench.tsx:64](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:64), [PurchaseInvoiceWorkbench.tsx:636](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:636), [PurchaseInvoiceWorkbench.tsx:2729](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:2729). Baseline obligation: `purchase-entry-field-coverage`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-14.1 | PARTIAL | Header supports supplier, invoice/bill number, order reference, invoice date, received date, due date, staff/entered-by and payment/bill terms. | F21: order reference and visible entered-by header are absent. |
| INV-14.2 | PASS | Rows support item, batch, expiry, pack/unit, paid quantity, free quantity, MRP, PTR/purchase rate, scheme amount, discounts, taxable base, GST and total. | Manual rows include paid/free, pack, scheme, discounts, tax and calculated/original totals. |
| INV-14.3 | PARTIAL | Footer shows row/item count, paid/free quantities, taxable value, GST, adjustments/rounding, net and margin with a stated basis. | F21: footer lacks paid/free totals and explicit margin basis. |
| INV-14.4 | PASS | Header/row edits immediately recompute derived totals while preserving original reported totals for comparison; no unsupported term is silently dropped. | Current edits recompute totals while original printed amounts remain editable comparison evidence. |
| INV-14.5 | PARTIAL | Reproduce PDF bill SB-26-43742: 10 x 983.05 = 9830.50 taxable, 1769.49 GST, 11599.99 before rounding and 11600 net, batch WWD0040, expiry 02/28. | Formula/source fixture exists, but SB-26-43742 was not executed by this read-only audit. |

## INV-15 — Reconciliation and human review — PASS (source only)

Trace: [PurchaseInvoiceWorkbench.tsx:1660](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:1660), [PurchaseInvoiceWorkbench.tsx:1900](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:1900), [pharmacy-purchase-invoice.service.ts:997](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:997). Baseline obligation: `purchase-review-blockers-enforced`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-15.1 | PASS | Every blocking issue has a visible field link, correction control or explicit evidence-based acknowledgement on the same page; required controls are not hidden in collapsed sections. | Issues link to visible fields/matching/receipt controls or acknowledgement. |
| INV-15.2 | PASS | Duplicate OCR/AUTO versions of the same issue appear once. Unresolvable issues offer recapture/manual entry or a clear explanation, not a dead-end button. | Current blocker normalization and retry/manual paths avoid duplicate known optional flags. |
| INV-15.3 | PASS | APPROVAL BILLS remains uncertain until a reviewer establishes bill terms; the application does not default it silently to Cash or Credit. | Unknown approval-bill terms require review rather than assumed Cash/Credit. |
| INV-15.4 | PASS | Physical received paid/free quantities, pack conversion, batch and expiry are verified against the actual receipt before posting; discrepancies remain reviewable. | Receipt confirmation and required pack/batch/expiry validation precede stock addition. |
| INV-15.5 | PASS | Direct API review with unresolved flags, totals or missing required receipt details fails without posting stock. Clearing a flag without resolving its underlying invalid value does not pass validation. | Review/commit revalidate invalid data, unresolved flags and reported totals server-side. |

## INV-16 — One primary save and process action — PARTIAL (source only)

Trace: [PurchaseInvoiceWorkbench.tsx:1423](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:1423), [PurchaseInvoiceWorkbench.tsx:1562](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:1562), [PurchaseInvoiceWorkbench.tsx:1720](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:1720), [pharmacy-purchase-invoice.service.ts:1090](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:1090). Baseline obligation: `purchase-process-visible-outcome`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-16.1 | PASS | One context-sensitive primary button saves current corrections and advances only as validation permits. Incomplete review fields can persist in an unposted server draft without invented defaults; there is no competing Save Corrections action. | Contextual save/process plus secondary incomplete server draft is present. |
| INV-16.2 | PASS | Valid high-confidence intake saves and commits automatically. Human-verified exceptions can complete review and commit through the same page without navigation to another tool. | Automatic valid intake and human review/commit run on the same screen. |
| INV-16.3 | PASS | Button copy states its current consequence: Save & Process, Review & Add stock, or Stock added. Optional Save draft is a secondary action with Stock not added wording. | Primary copy and saved-unposted/stock-added states depend on current persisted status. |
| INV-16.4 | PASS | After processing, persistent feedback names the invoice, saved state, blocking reason or added quantities, and links to resulting batches. | Commit result exposes saved invoice state and resulting batches. |
| INV-16.5 | PARTIAL | Double clicks, retries and uncertain network responses cannot create a second invoice/receipt. An unconfirmed response triggers status lookup rather than a success guess. | F01: effect idempotency exists, but stale-recovery preconditions and receipt reset can overwrite work. |

## INV-17 — Transactional receipt posting — PARTIAL (source only)

Trace: [pharmacy-purchase-invoice.service.ts:997](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:997), [pharmacy-purchase-invoice.service.ts:1090](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:1090), [inventory-stock.ts:28](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-stock.ts:28). Baseline obligation: `purchase-commit-once-atomic`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-17.1 | PASS | Only a valid reviewed receipt or a fully validated automatic intake may add stock, with authenticated user and branch recorded. | Reviewed/validated automatic receipt with actor/branch is the stock gate. |
| INV-17.2 | PASS | Paid plus free quantities are converted once into each correct item/batch balance; purchase movement references the invoice, source and conversion used. | Paid plus free are declared stock units; snapshots preserve conversion without remultiplication. |
| INV-17.3 | PASS | Invoice posted state, all inventory changes and all purchase movements commit together or roll back together under injected failure. | Serializable invoice/stock/movement transaction implements all-or-none behavior. |
| INV-17.4 | PASS | Two concurrent process/commit requests and a retry after a lost response produce one receipt effect; reload displays the authoritative posted state and quantities. | Idempotent stockCommitted state/request paths protect repeated commits; live race evidence belongs to separate tests. |
| INV-17.5 | PARTIAL | For the original Eucerin bill, verify two batches with 9 and 7 total packs and invoice net 45602 in an isolated fixture. No production stock is modified by acceptance tests. | Original Eucerin 9/7 packs and 45602 is a live-fixture criterion; this audit did not execute it. |

## INV-18 — Purchase register and draft recovery — PARTIAL (source only)

Trace: [InventoryWorkspace.tsx:73](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:73), [PurchaseInvoiceWorkbench.tsx:930](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:930), [PurchaseInvoiceWorkbench.tsx:1575](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:1575). Baseline obligation: `purchase-register-complete`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-18.1 | PASS | Register searches by bill number and supplier and filters date, status and intake channel with pagination across all saved invoices. | Purchase register offers bill/supplier search, dates, status/channel and server pagination. |
| INV-18.2 | PASS | Draft, OCR review required, reconciliation failed, reviewed, stock added and cancelled are distinct; stock effect is stated in words. | Saved workflow status and Stock not added/added text distinguish draft and posting states. |
| INV-18.3 | PASS | Unfinished original uploads and server drafts are recoverable after logout/browser restart; more than 8 invoices or 20 uploads remain discoverable. | Retained uploads/server intake drafts have recovery paths beyond recent-eight list. |
| INV-18.4 | PARTIAL | Opening, correcting and returning to the register preserves selected filters and position; duplicate candidates link to the existing invoice. | F01/F06: recovery and remaining receipt query state can interfere with register return. |
| INV-18.5 | PASS | Register exports the chosen full result set with totals and status. A notification opens the exact saved record rather than a blank OCR form. | Purchase export now maps the same date/status/GST/source/search parameters as the list and includes all saved rows. |

## INV-19 — PO, gate pass and inward challan links — PARTIAL (source only)

Trace: [ReplenishmentCenter.tsx:97](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx:97), [WorkflowDocumentEditor.tsx:25](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:25), [PurchaseInvoiceWorkbench.tsx:1583](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:1583), [pharmacy-purchase-invoice.service.ts:1090](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:1090). Baseline obligation: `purchase-related-document-links`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-19.1 | PARTIAL | A receipt can link an approved PO, gate pass or inward challan, and each linked document is viewable without losing invoice work. | PO pagination and SENT selection fixed; direct bill selection of a gate-pass reference is not exposed. |
| INV-19.2 | PASS | Expected, physically received, previously posted and remaining quantities are distinct; partial receipts do not mark the whole order received. | Receipt context distinguishes ordered/previously received/remaining; partial state is persisted. |
| INV-19.3 | PASS | Converting an inward challan to an invoice posts only any not-yet-posted stock delta and establishes the bill/accounting effect once. | workflowReceiptId requires a posted matching inward receipt and posts no second physical delta. |
| INV-19.4 | PASS | The UI explains which document stage changes stock and supplier dues before submission; a reference-only gate pass does not quietly post stock. | Workflow definitions describe stock-only inward, reference-only gate pass, and bill payable stages. |
| INV-19.5 | PASS | Inward-challan/gate-pass posting policy is recorded explicitly before implementation acceptance; the PDF observed controls but did not verify their posting rules. | Policy is explicit in workflow model/definitions and receipt-bill service guards. |

## INV-20 — Purchase document actions and audit trail — PARTIAL (source only)

Trace: [PurchaseDocumentActions.tsx:69](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/PurchaseDocumentActions.tsx:69), [pharmacy-purchase-invoice.service.ts:810](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:810), [inventory-stock.ts:28](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-stock.ts:28). Baseline obligation: `purchase-posted-correction-traceable`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-20.1 | PASS | Purchase detail exposes Edit/correct, Return, Return history, Print QR, Set location & discount, PDF, Excel, Purchase CSV, original upload/download and Logs. | Purchase action panel exposes requested originals, logs, QR, exports and correction/return controls. |
| INV-20.2 | PARTIAL | Draft edits are allowed subject to validation. Posted stock/financial changes require a linked correction or reversal with reason, user and before/after values. | F02/F22: source recovery fixed; price-only credit initialization and generic correction routing remain. |
| INV-20.3 | PASS | Adding a supporting original does not overwrite previously retained originals or change stock; download preserves original bytes. | Supporting source upload appends retained records without changing stock. |
| INV-20.4 | PASS | Exports include bill header, all rows, paid/free units, taxes, rounding and status; PDF/Excel/CSV agree with the saved record. | Export service builds saved headers/all rows including units, tax, status and rounding. |
| INV-20.5 | PASS | Logs connect capture, OCR, corrections, mapping, review, commit, returns and payment events with actor/time; ledger-linked batches cannot be hard-deleted. | Actor/time lifecycle and related document/financial history is present; hard deletion is blocked for linked stock. |

## INV-21 — Supplier dues and payments — PARTIAL (source only)

Trace: [pharmacy-purchase-ledger.service.ts:48](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-ledger.service.ts:48), [pharmacy-purchase-ledger.service.ts:478](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-ledger.service.ts:478), [PurchaseLedger.tsx:599](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseLedger.tsx:599). Baseline obligation: `purchase-payables-posted-only`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-21.1 | PARTIAL | Supplier account shows posted bills, due dates, paid amount, credits and outstanding with drill-down to each source document. | F12/F13: ledger omits credits/source links and account-level allocation affordance. |
| INV-21.2 | PASS | Drafts and OCR-review records are displayed separately as unposted, not added to posted dues; a cancelled draft has no payable effect. | Payables select STOCK_COMMITTED only; purchase register labels unposted records. |
| INV-21.3 | PASS | One payment can allocate across invoices for the same supplier and branch; allocation sum must equal the payment and cannot exceed remaining outstanding. | Payment requires same supplier/branch, positive exact allocation sum and remaining balance. |
| INV-21.4 | PASS | Cash/UPI/NEFT and supported modes record payer, payment date, reference and audit event. Duplicate/retried payment submission cannot double an allocation. | Stable request key and stored payer/date/mode/reference implement retry-safe payment records. |
| INV-21.5 | PARTIAL | Concurrent payments and supplier credits cannot over-allocate the same bill. Aging and overdue totals recompute from the same posted balances. | F19: current concurrency checks align balances; historical as-of aging reads current effects. |

## INV-22 — Credit notes and voucher adjustments — PARTIAL (source only)

Trace: [inventory-workspace.service.ts:173](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:173), [InventoryWorkspace.tsx:82](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:82), [PurchaseLedger.tsx:133](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseLedger.tsx:133). Baseline obligation: `purchase-credit-adjustment-visible`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-22.1 | PARTIAL | Eligible supplier credit notes/vouchers can be inspected and applied from purchase review or supplier account without retyping the original document. | F13: eligible credit selection is separate from purchase review/supplier account. |
| INV-22.2 | PARTIAL | Application shows original credit value, previously used amount, amount applied and remaining credit with supplier/branch checks. | F13: original/used/available and allocation exist, but target bill/history links are absent. |
| INV-22.3 | PASS | An applied credit cannot exceed either available credit or eligible bill amount; concurrent/retried application cannot consume it twice. | Serializable credit/bill checks and unique request key protect limits and retries. |
| INV-22.4 | PASS | Final supplier returns create their accounting credit once; applying that credit to a bill never deducts returned stock again. | Supplier-return credit is separate from physical return and allocation adds no stock effect. |
| INV-22.5 | PARTIAL | Removing or correcting a finalized application creates an auditable reversal; prior balance history remains visible. | F13/F19: reversal exists, but account UI/history and historical as-of reconstruction are incomplete. |

## INV-23 — Purchase CSV and optional Gmail intake — PARTIAL (source only)

Trace: [inventory-intake.service.ts:15](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-intake.service.ts:15), [AlternateInvoiceIntake.tsx:8](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/AlternateInvoiceIntake.tsx:8), [PurchaseInvoiceWorkbench.tsx:1604](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:1604). Baseline obligation: `purchase-intake-channel-equivalence`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-23.1 | PASS | Purchase CSV import on desktop/mobile maps supplier header and rows, previews errors and retains the source file before creating a purchase draft. | CSV file retention and preview errors feed purchase draft review. |
| INV-23.2 | PASS | Purchase CSV is labelled separately from Opening stock Excel; it produces a supplier bill, not an unexplained balance reset. | Purchase CSV and Opening stock Excel are separate named tasks. |
| INV-23.3 | PARTIAL | Gmail shows Connected/Not connected, mailbox/source, last fetch and recoverable failure. Connection and fetch require explicit authorized setup. | F14: connection state exists, but last fetch and recoverable status-loading failure are incomplete. |
| INV-23.4 | PASS | Email attachment ID/hash and supplier/bill duplicate checks prevent repeat imports; email instructions cannot bypass invoice validation. | Gmail verifies attachment metadata/hash; common supplier/bill duplicate and review checks remain. |
| INV-23.5 | PARTIAL | Manual, camera/photo, PDF, CSV and Gmail imports converge on the same review, posting and audit rules, while preserving the original intake channel. | F14: channel/source preserved, but schemeAmount is not carried by CSV mapping. |

## INV-24 — Batch-aware sales and dispensing — PARTIAL (source only)

Trace: [WorkflowDocumentEditor.tsx:62](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:62), [WorkflowDocumentEditor.tsx:74](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:74), [inventory-workflow.service.ts:272](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:272). Baseline obligation: `sales-batch-visible-before-confirm`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-24.1 | PASS | Sale supports customer lookup or counter bill, doctor, bill date, staff, payment mode and pickup/order type without requiring a fabricated patient. | Walk-in customer/phone, doctor/date/actor, payment and order type are supported. |
| INV-24.2 | PASS | Rows show product, pack/unit, location, batch, expiry, quantity, MRP, discounts, GST and line total before confirmation. | Rows expose product/unit/location/batch/expiry/quantity/MRP/discount/tax/total. |
| INV-24.3 | PARTIAL | Eligible batches are proposed by earliest expiry; an allowed override is explicit and recorded. Expired, held or insufficient stock cannot be sold. | F15: first-30 client-side FEFO and no recorded override; server rejects ineligible stock. |
| INV-24.4 | PASS | Confirmed sale deducts the actual allocated batches once, records sale movements and exposes those batches on the invoice and item history. | Confirmed workflow sale creates batch movements once; item history has sources. |
| INV-24.5 | PASS | Repeated products/package contents, simultaneous sales and stock changes between preview and confirmation cannot oversell or deduct the wrong batch. | Serialized current balance checks and aggregate same-batch deductions protect concurrent sales. |

## INV-25 — Sales drafts and quotations — PASS (source only)

Trace: [InventoryWorkspace.tsx:76](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:76), [WorkflowDocumentEditor.tsx:45](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:45), [inventory-workflow.service.ts:395](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:395). Baseline obligation: `sales-draft-quotation-no-posting`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-25.1 | PASS | Draft and Quotation are named, searchable states with edit, resume and duplicate-safe convert-to-sale actions. | Quotation register now has reference search plus status/date filters, edit and duplicate-safe conversion. |
| INV-25.2 | PASS | Saving a draft or quotation does not post stock or revenue. If reservations are enabled, reserved and available balances are separate from physical on-hand. | Unposted documents have no physical or financial effect; reservation policy is explicitly none. |
| INV-25.3 | PASS | Converting a quotation creates or links one sale while retaining source quotation and any agreed price changes. | Conversion retains one linked sale and now routes back using the actual quotation source kind. |
| INV-25.4 | PASS | Cancelling/expiring an unposted draft releases only its own reservations, with no purchase or sales-return movement. | Cancelling unposted document has no stock movement; there are no implicit reservations to release. |
| INV-25.5 | PASS | Draft stock is revalidated at final confirmation; a previously valid quotation cannot bypass current expiry, hold or quantity checks. | Final sale transition revalidates expiry, holds and available quantity. |

## INV-26 — Customer sales returns and refunds — PARTIAL (source only)

Trace: [WorkflowDocumentEditor.tsx:31](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:31), [WorkflowDocumentEditor.tsx:62](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:62), [inventory-workflow.service.ts:288](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:288). Baseline obligation: `sales-return-original-batch`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-26.1 | PARTIAL | Find the original sale and select partial/full line quantities, original batch and reason from a visible Sales returns action. | F03/F04: original sale search still stops at 100 and initial price preview uses current terms. |
| INV-26.2 | PASS | Return quantities cannot exceed sold-minus-already-returned units, including concurrent returns; unit conversion uses the original sale basis. | Source-quantity accounting limits partial and concurrent returns to remaining sold units. |
| INV-26.3 | PASS | Explicit disposition chooses saleable restock, quarantine or loss; only accepted saleable units increase available stock. | RESTOCK/QUARANTINE/LOSS are explicit and held stock is unavailable. |
| INV-26.4 | PARTIAL | Stock, refund/credit and return-document effects are transactional and retry-safe, and link to the original sale and item ledger. | F03: refund method/status now match server; displayed return totals still use a different calculation. |
| INV-26.5 | PASS | Return history and refund status remain visible; reversing a final return creates a linked correction rather than erasing it. | Refund status/amount is now visible; RELEASED return reversal is offered and retains linked history. |

## INV-27 — Signed item and batch movement ledger — PARTIAL (source only)

Trace: [WorkspaceStock.tsx:32](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:32), [inventory-workspace.service.ts:98](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:98), [inventory-stock.ts:8](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-stock.ts:8). Baseline obligation: `inventory-ledger-closing-balance`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-27.1 | PASS | Each movement shows date/time, type, source document, batch, in/out, unit, running balance, user and reason where applicable. | Ledger has actor/time/source/batch context, signed delta and deterministic running balance. |
| INV-27.2 | PASS | Opening + receipts + accepted returns - sales - supplier stock-out returns/losses + signed adjustments equals the current stored batch balance. | Signed movement algebra supports reconciliation; unknown historical direction stays explicitly unresolved. |
| INV-27.3 | PARTIAL | For the GSH fixture, 2570 - 2390 - 10 - 30 = 140; both negative adjustments are represented as stock out and retain reasons. | Arithmetic handling is supported; this audit did not execute the exact GSH movement fixture. |
| INV-27.4 | PARTIAL | Source links open the purchase, sale, count or return without losing item context; chronological ordering is deterministic for equal timestamps. | F09/F22: source-kind routing fixed; identity matching and source-owned correction routing remain. |
| INV-27.5 | PASS | History is not silently rewritten by editing/deleting a posted movement; corrections appear as linked reversal/replacement entries. | Posted movements reject in-place edits/deletes and preserve reversal/replacement lineage. |

## INV-28 — Staged supplier returns — PARTIAL (source only)

Trace: [WorkflowDocumentEditor.tsx:64](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:64), [WorkflowDocumentEditor.tsx:74](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:74), [inventory-workflow.service.ts:210](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:210). Baseline obligation: `supplier-return-stage-effects`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-28.1 | PASS | Guided return entry covers supplier, item preference, return base, return type and review, preserving progress and showing stock/accounting effect before submission. | Return type/base and review flow exist; linked workflow recovery now includes source purchase identity. |
| INV-28.2 | PASS | Rows include item, pack/unit, batch, expiry, MRP/PTR basis, paid/free quantities, discounts, scheme amount, taxable value and GST. | Rows include unit/batch/expiry/price/paid-free/discount/scheme/tax. |
| INV-28.3 | PASS | Draft is editable/deletable and changes neither ledger. Challan affects item stock only; edits/deletion adjust or reverse its stock delta with history. | Draft is unposted; challan stock-only changes/reversals are versioned and transactional. |
| INV-28.4 | PASS | Final Return invoice affects stock and supplier ledger once. Converting an existing Challan adds the accounting effect without a second stock deduction. | Final supplier credit and challan conversion do not double-deduct physical stock. |
| INV-28.5 | PARTIAL | Final Return invoice cannot be edited/deleted in place. Return register/history supports date/year/GST/status filters and linked corrections; no-results is scoped to the filter. | Final immutability and date/GST/status controls exist; date basis is unstated (createdAt), with no full register export. |

## INV-29 — Breakage and loss — PASS (source only)

Trace: [WorkspaceStock.tsx:26](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:26), [WorkflowDocumentEditor.tsx:67](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:67), [inventory-workflow.service.ts:272](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:272). Baseline obligation: `inventory-loss-no-supplier-credit`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-29.1 | PASS | Choose item/batch, quantity and unit, expiry, disposition and reason from a visible Breakage & loss action. | Named loss task selects batch/unit/expiry/quantity/reason and preserves held-source choice. |
| INV-29.2 | PASS | Preview clearly states stock will decrease and supplier balance will not change; quantity cannot exceed eligible on-hand. | Definition explains stock decrease and no supplier credit; service checks eligible stock. |
| INV-29.3 | PASS | Posting writes a final loss document and signed stock movement atomically and once, with actor and source evidence. | Loss document/movement is one serializable idempotent effect. |
| INV-29.4 | PASS | Final loss is immutable; a correction links an authorized reversal and replacement without erasing history. | Final loss correction preserves linked reversal and original history. |
| INV-29.5 | PASS | Loss and supplier return remain separate choices so damaged goods are not credited to a supplier by assumption. | Loss and supplier return remain distinct named actions and accounting paths. |

## INV-30 — Expiry queues and disposition — PARTIAL (source only)

Trace: [WorkspaceStock.tsx:39](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:39), [inventory-workspace.service.ts:38](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:38), [inventory-workflow.service.ts:272](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:272). Baseline obligation: `inventory-expiry-complete-windows`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-30.1 | PARTIAL | Expired and next 1/2/3/6-month queues show item, batch, expiry, quantity unit, supplier, location and selectable valuation basis. | F10: required windows exist, but selectable valuation and supplier/detail coverage are incomplete. |
| INV-30.2 | PARTIAL | Calendar boundaries and date interpretation are defined; a batch on the boundary appears consistently in UI, backend and export. | F10: inclusive-day UI contradicts exact timestamp backend expiry comparison. |
| INV-30.3 | PASS | Queues cover all matching pages. Counts above 200 remain accurate and navigable rather than silently truncated. | Stock filters count all rows before pagination; export reads every page. |
| INV-30.4 | PASS | Each batch offers a valid next action: inspect, quarantine, supplier return or loss; opening a queue alone changes no stock. | Stock queue opens detail with hold/return/loss; reads have no physical effects. |
| INV-30.5 | PASS | Delete expired batches cannot erase ledger-linked history or silently remove nonzero stock; use documented disposal then archive with a recoverable audit trail. | Nonzero/linked stock cannot be hard-deleted; disposal then status archive preserves history. |

## INV-31 — Stock audit and counting — PARTIAL (source only)

Trace: [ReplenishmentCenter.tsx:110](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx:110), [WorkflowDocumentEditor.tsx:74](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:74), [inventory-workflow.service.ts:314](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:314). Baseline obligation: `inventory-audit-approval-before-post`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-31.1 | PARTIAL | Audit can be configured On/Off with owner, cadence/daily item count and explicit stock-adjustment mode; disabled tracking is explained. | F16: owner/count/enablement exists but adjustment mode is not exposed. |
| INV-31.2 | PASS | Select by item/location/batch or filters. Record physical counts in labelled units; blank means not counted, zero requires an explicit entered zero. | Scoped count creation and blank-versus-zero input preserve explicitly counted units. |
| INV-31.3 | PASS | Preview system stock, physical stock and variance before posting. Negative/fractional unsupported counts fail; concurrent sales trigger refreshed comparison. | System/physical/variance preview and stale-stock validation exist; fractional/negative input fails. |
| INV-31.4 | PASS | Every nonzero variance requires a reason. Required approvals leave stock unchanged and create a visible pending action until an authorized reviewer approves. | Required reason/approval leaves stock unchanged until authorized approval. |
| INV-31.5 | PARTIAL | Audit history exposes Pending/Completed/Blocked, actor, reason, before/after quantities and source movements; retries do not reapply a stale physical count. | F16: state/effects are stored, but generic history omits before/after reason detail. |

## INV-32 — Stock adjustment integrity — PARTIAL (source only)

Trace: [inventory-stock.ts:28](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-stock.ts:28), [inventory-workflow.service.ts:314](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:314), [inventory-workspace.service.ts:248](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:248). Baseline obligation: `inventory-adjustment-direction`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-32.1 | PASS | Each adjustment stores reason, actor, timestamp, branch, batch, before balance, after balance and signed delta. | Adjustment movement metadata records signed delta, balance, actor/time/branch/source/reason. |
| INV-32.2 | PASS | A -3 adjustment on stock 10 records an outflow of 3 and new balance 7; a +3 adjustment records an inflow and balance 13. | Signed delta algebra supports both outflow and inflow without absolute-value ambiguity. |
| INV-32.3 | PASS | Movement and stock update succeed atomically or neither persists. Failure injection after movement creation must leave no orphan movement. | Movement/balance changes share transactions; injection/race tests are separate execution evidence. |
| INV-32.4 | PASS | Outbound quantity 15 from stock 10 is rejected without changes; the service must not store an outflow of 15 while clamping the balance to zero. | Current availability guard rejects excessive outflow rather than clamping balances. |
| INV-32.5 | PARTIAL | Posted adjustments cannot be edited/deleted in place; correction/reversal preserves the original effect and checks current stock and permissions. | F22: backend owner protections hold; UI offers an invalid standalone correction for owned movements. |

## INV-33 — Blocked and quarantined stock — PARTIAL (source only)

Trace: [WorkspaceStock.tsx:31](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:31), [inventory-workflow.service.ts:373](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:373). Baseline obligation: `inventory-hold-availability-visible`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-33.1 | PARTIAL | Item detail lists active/released holds with batch, quantity, unit, reason, owner and time; hold is a named action, not an undocumented stock status. | F16: named holds exist but item hold history omits remaining balance/owner/time/reason/unit. |
| INV-33.2 | PASS | Physical on-hand, held/reserved and available balances are separately labelled and reconcile according to an explicit hold policy. | Physical, held and available are separately labelled; hold effects change availability only. |
| INV-33.3 | PASS | A held batch is excluded from sale allocation and automatic reorder availability according to that policy; concurrent holds cannot over-reserve. | Sale and replenishment use current-minus-held; transactions prevent over-holding. |
| INV-33.4 | PARTIAL | Release restores only the held availability and retains history; disposal/return uses its own stock movement rather than silently deleting the hold. | F04: source-specific release/disposal logic exists but source selectors silently truncate. |
| INV-33.5 | PASS | Hold and sales-draft reservation policies are documented before acceptance; the PDF did not establish their exact eVitalRx semantics. | Source-specific hold ownership and no unposted-sale reservations are documented. |

## INV-34 — Manual min/max targets — PARTIAL (source only)

Trace: [WorkspaceStock.tsx:27](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:27), [inventory-workspace.service.ts:110](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:110), [inventory-replenishment.service.ts:52](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-replenishment.service.ts:52). Baseline obligation: `inventory-minmax-valid-units`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-34.1 | PARTIAL | Edit min, max and reorder level per item with visible pack/base-unit basis and valid nonnegative min <= max. | F17: min/max units/validation exist, but active editor lacks reorderLevel. |
| INV-34.2 | PASS | Low/high stock queues use each item’s configured thresholds, not a fixed global stock <= 10 test. | LOW/HIGH use configured item thresholds. |
| INV-34.3 | PARTIAL | Missing min/max appears as unconfigured, not zero demand. Bulk target edits preview changes and record actor/reason. | F08/F17: missing values stay missing; reviewed bulk edits/actor-reason history are absent. |
| INV-34.4 | PARTIAL | Manual targets and exclusions are distinguishable from automatic proposals; automatic refresh cannot silently replace them. | F17: manual override preservation exists, but explicit exclusions are not editable in active UI. |
| INV-34.5 | PASS | The deprecated legacy min/max action redirects to the supported target editor/review screen with existing values preserved; no dead Turn on button. | Active Reorder target/setup destination replaces the old inactive button path. |

## INV-35 — Shortbook replenishment queue — PARTIAL (source only)

Trace: [ReplenishmentCenter.tsx:130](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx:130), [inventory-replenishment.service.ts:125](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-replenishment.service.ts:125), [inventory-workflow.service.ts:449](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:449). Baseline obligation: `inventory-shortbook-workflow`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-35.1 | PASS | Shortbook lists item, supplier, priority, min/current stock, required quantity, status, request source and requester. | Shortbook displays required metadata; generated shortage payload preserves min/current. |
| INV-35.2 | PARTIAL | Users can add/edit a manual request, search and date-filter it, and download the full chosen result set. | F06: search/date/export exist, but filters do not survive record navigation/reload. |
| INV-35.3 | PASS | Automatic suggestions and manual requests are merged without silently duplicating the same demand; source and overrides remain visible. | Open demand de-duplication and source/requester/override retention are implemented. |
| INV-35.4 | PASS | Select supplier and quantities, then create/approve a linked PO. Shortbook alone never changes stock or supplier dues. | Explicit supplier choice and selected request-to-PO conversion do not change stock/dues. |
| INV-35.5 | PASS | Ordered, partially received, fulfilled and cancelled requests update from linked PO/receipt effects; failed updates remain actionable. | PO receipt/cancellation updates Shortbook with partial/fulfilled/cancelled state. |

## INV-36 — Automatic min/max review — PARTIAL (source only)

Trace: [ReplenishmentCenter.tsx:77](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx:77), [ReplenishmentCenter.tsx:105](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx:105), [inventory-replenishment.service.ts:50](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-replenishment.service.ts:50). Baseline obligation: `inventory-auto-targets-review`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-36.1 | PASS | Off/On, owner, schedule, last/next run and Summary are explicit; disabled controls explain why and offer the correct setup action. | Setup exposes enablement, owner, schedule, last/next run, model and history. |
| INV-36.2 | PASS | Configure demand lookback, minimum order history, bounce/refill inputs, model/version, min/max cover days and refresh cadence; inputs actually affect the calculation. | Lookback/minimum history/cover days/cadence and bounce/refill flags affect demand. |
| INV-36.3 | PASS | Preview old/proposed targets and impact for every eligible item, including cold-start/no-sales cases, with evidence scope and exclusions. | All active categories and cold-start/excluded/manual evidence enter proposal review. |
| INV-36.4 | PARTIAL | Accept/reject per item or reviewed bulk selection. Manual exclusions and overrides survive refresh; accepted values can sync to Shortbook. | F17: per-item/bulk decisions and sync work; explicit exclusion editing remains absent. |
| INV-36.5 | PASS | Historical examples 60 days, 1 order, 10/60 cover days and 112/128 included are editable fixture values, not global hardcoded business rules. | Examples are saved editable settings; counts derive from actual eligible rows. |

## INV-37 — Supplier recommendations, Auto PO and monitoring — PASS (source only)

Trace: [ReplenishmentCenter.tsx:93](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx:93), [ReplenishmentCenter.tsx:119](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx:119), [inventory-replenishment.service.ts:152](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-replenishment.service.ts:152), [inventory-workflow-scheduler.service.ts:23](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow-scheduler.service.ts:23). Baseline obligation: `inventory-auto-po-observable`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-37.1 | PASS | Supplier selection shows availability/history, price basis and chosen supplier; a recommendation is not a silent supplier change. | Supplier history and stock-unit price basis are explicit; live availability is labelled not connected. |
| INV-37.2 | PASS | Auto PO setup states who approves, what may run automatically, schedule and enabled state; an Off configuration sends no order. | Enablement/approval owner/schedule are displayed; Off prevents automatic PO work. |
| INV-37.3 | PASS | Each run exposes proposed/created/approved/sent/failed outcomes and links to POs; retry does not create duplicate orders. | Stable request/run history shows created/proposed/failed outcomes and record links; delivery remains setup-required. |
| INV-37.4 | PASS | Monitoring charts explain demand/stock coverage, supplier choices and actual order/receipt outcomes, with date scope and underlying records. | Monitor exposes date-scoped events, demand coverage, supplier choices and underlying exports. |
| INV-37.5 | PASS | Forecast coverage includes all eligible stock categories or clearly states an exclusion; a top-30 sample cannot be labelled a complete replenishment plan. | Demand proposals inspect all eligible active categories; no top-30 claim. |

## INV-38 — Purchase orders and partial receipt — PARTIAL (source only)

Trace: [ReplenishmentCenter.tsx:97](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx:97), [inventory-workflow.service.ts:449](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:449), [inventory-replenishment.service.ts:250](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-replenishment.service.ts:250). Baseline obligation: `inventory-po-no-stock`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-38.1 | PASS | PO has supplier, ordered item quantities/units, prices, expected date, creator, status and links to Shortbook and received documents. | PO details/receipt history exist and source Shortbook link now uses the actual source kind. |
| INV-38.2 | PASS | Creation and approval do not add stock or create a supplier payable; sending is an explicit authorized action and records delivery/failure. | Creation/approval are nonposting; dispatch explicitly records setup-required failure without fake sending. |
| INV-38.3 | PASS | Valid transitions distinguish draft/pending approval, approved/sent, partially received, received and cancelled; arbitrary status strings do not bypass receipt validation. | Known transitions and server guards protect receipt/cancel/approval states. |
| INV-38.4 | PASS | Partial receipts update received and remaining quantities from posted purchases; duplicate receipts do not over-receive, and over-delivery needs a documented decision. | Posted inward receipts aggregate remaining units and reject over-receipt; bill linking adds no duplicate stock. |
| INV-38.5 | PARTIAL | Receive opens Purchases with PO context. Deleting a completed PO cannot erase links or receipt history; cancellation preserves prior receipt effects. | F05: PO selector now supports SENT/all pages; duplicate partial cancellation action still calls wrong endpoint. |

## INV-39 — Barcode and QR operations — PARTIAL (source only)

Trace: [WorkspaceStock.tsx:23](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx:23), [WorkflowDocumentEditor.tsx:30](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:30), [inventory-workspace.service.ts:52](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:52). Baseline obligation: `inventory-code-lookup-and-labels`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-39.1 | PARTIAL | Typed/scanned item barcode works from Stock and Sales with the same identity rules, visible matched item/pack and explicit unknown-code recovery. | F15: typed/scanned lookup is shared, but sales eligibility/unknown recovery is generic first-page search. |
| INV-39.2 | PASS | Batch-specific codes select the correct item/batch/expiry; item-level codes still require valid batch allocation before a sale. | Encoded inventory ID resolves branch batch; sale revalidates it before stock effect. |
| INV-39.3 | PASS | Print QR is available on item/batch and purchase detail, producing readable labels with item, batch, unit and expiry context. | Batch and purchase labels/QR exports are reachable with saved context. |
| INV-39.4 | PASS | Scanning a supplier payment QR is not treated as an inventory code or an instruction to pay; lookup never changes stock or supplier balances. | Encoded IDs/search are read-only; payment QR content is never interpreted as an instruction to pay. |
| INV-39.5 | PARTIAL | Unknown, duplicate, inactive or cross-branch codes cannot silently select a product; barcode assignment conflicts are actionable. | F08: active metadata route lacks actionable barcode/SKU conflict handling; database uniqueness prevents duplicate assignment; inactive rows remain selectable in generic search. |

## INV-40 — Access, branch isolation and reliable effects — PARTIAL (source only)

Trace: [inventory-workflow.service.ts:33](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:33), [pharmacy-purchase-invoice.service.ts:114](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:114), [inventory-workspace.service.ts:103](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:103). Baseline obligation: `purchase-role-permission-boundary`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-40.1 | PASS | Reception with the corresponding existing Inventory permissions can import, correct, review and commit invoices; missing permission produces a clear UI reason and backend denial. | Existing reception permissions feed service authorization and purchase action capabilities. |
| INV-40.2 | PASS | Read-only users can inspect authorized originals/status without mutation controls. Disabled UI is not the only enforcement: direct API calls are checked. | Read-only capabilities hide mutations while authenticated backend services enforce permission checks. |
| INV-40.3 | PASS | All record/source lookups and writes use authenticated branch scope; a foreign record ID, supplier, product or source cannot cross branches. | Reads/writes check authenticated branch for documents/products/suppliers/sources. |
| INV-40.4 | PARTIAL | Every stock/payment/order effect records actor, time and source with retry/concurrency protection; logging excludes credentials and unnecessary source document content. | F08: transactional effects carry actor/time/source, but active metadata changes lack required audit. |
| INV-40.5 | PASS | Acceptance tests run with isolated fixtures and database namespaces, not production accounts or balances. Permission denial or network failure leaves prior records intact. | Diagnostic scripts use isolated local branch fixtures; no runtime or permission-denial execution is claimed by this audit. |

## INV-41 — Clear responsive states and accessible controls — PARTIAL (source only)

Trace: [InventoryWorkspace.tsx:45](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:45), [WorkflowDocumentEditor.tsx:73](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx:73), [PurchaseInvoiceWorkbench.tsx:2356](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx:2356). Baseline obligation: `purchase-required-controls-visible`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-41.1 | PARTIAL | At 1440px desktop and 390px mobile widths, essential actions, status and source access remain visible without page-level horizontal scrolling. | Source uses responsive grids/local table overflow; actual 1440px/390px checks were not run here. |
| INV-41.2 | PARTIAL | Every input has a label/unit, required vs optional meaning and inline error; errors move focus to the relevant field without erasing valid edits. | F20: labelled units mostly exist; workflow errors do not consistently focus inline fields. |
| INV-41.3 | PARTIAL | Keyboard users can complete selection, edit, source navigation and submission; focus is visible, modal focus is managed and status updates are announced. | No keyboard completion/focus-management run was performed by this source audit. |
| INV-41.4 | PARTIAL | Loading, empty, validation error, permission denied, timeout, stale record and success each show an accurate next action; stock-added feedback comes from persisted server state. | F01/F07/F20: recovery, stale, empty/error and retry-state gaps remain. |
| INV-41.5 | PASS | With a 20-row invoice, all rows remain reachable and the primary action identifies remaining blockers. Required product/supplier/unit confirmations are not randomly collapsed. | Twenty-row rendering has no row truncation and blocker controls are reachable in source; empirical test separate. |
| INV-41.6 | PARTIAL | Three representative clinic staff can receive a bill, find a batch, record a count and start a return from the proposed workspace without browser-only back navigation; record completion and any assistance. | Human acceptance requires three clinic staff and recorded assistance; source cannot prove it. |

## INV-42 — GST, cost analysis and exports — PARTIAL (source only)

Trace: [InventoryWorkspace.tsx:60](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx:60), [ComplianceCenter.tsx:264](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/ComplianceCenter.tsx:264), [pharmacy-purchase-invoice.service.ts:913](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:913). Baseline obligation: `inventory-reports-posted-scope`.

| Criterion | Source verdict | Requirement | Evidence / remaining work |
|---|---|---|---|
| INV-42.1 | PASS | Retain GST input/output/slab summaries, monthly stock/purchase/sales summaries and distributor cost/discount/free-stock analysis as named reachable tools. | GST/monthly reports and distributor analytics are named active destinations. |
| INV-42.2 | PARTIAL | Posted financial totals exclude purchase/sales drafts; pending work is separately labelled rather than counted as posted tax or supplier liability. | F18: GST/monthly uses posted records, but distributor financial totals include REVIEWED without separate pending totals. |
| INV-42.3 | PARTIAL | Filters include branch/date and explicit document statuses. Table, totals, drill-down and full-result export use exactly the same eligible records. | F06/F18/F19: export/filter/drill-down parity and historical financial scope are incomplete. |
| INV-42.4 | PARTIAL | Cost comparisons normalize pack/unit and distinguish MRP, PTR, landing price, tax, discounts and free goods so unlike price bases are not ranked together. | F18: analytics grouping omits unit type and product identity; unknown historic costs hidden. |
| INV-42.5 | PARTIAL | Recreate the worked 18% invoice arithmetic and add mixed-tax, free-quantity and rounding cases using the configured formula; this verifies arithmetic, not a new legal tax policy. | Configured arithmetic and fixture code exist; mixed-tax/free/rounding execution belongs to separate acceptance evidence. |

## Scope, contract procedure and four passes

Integration recheck: during this audit, parent changed F01–F06 UI paths. The findings/matrix above include only their verified remaining scope; repaired URL isolation, source-specific workflow recovery, refund method/status/released correction, PO pagination/SENT, dynamic source-kind navigation, and purchase export/generic register controls are reflected. Later edits must be audited against the recorded hashes.

1. **Coverage pass:** read the 42-feature baseline and traced every criterion through active InventoryWorkspace destinations to Workbench/WorkflowDocumentEditor/WorkspaceStock/ReplenishmentCenter and their Nest services. Did not reuse old FAIL/PASS assessments.
2. **Domain pass:** compared quantity, source identity, original receipts, staged stock/accounting effects, paid/free units, tax/refunds, current payables and target-review policy with the baseline and applicable source contracts. Found F03, F08–F19.
3. **Defect pass:** followed source selection, recovery initialization, direct URL transitions, partial-order actions, older-than-first-page records, exports and failure states. Found F01/F02/F04–F07/F20–F22; sent actionable integration findings to parent during work.
4. **Adversarial recheck/polish:** reread decisive current lines, separated active components from legacy unused controls, corrected path assumptions, retained all criteria verbatim, measured statuses, and checked file links/tooling. This audit made no implementation changes and cannot close runtime or staff gates.

The review targets current active inventory behavior, without a commit diff. No ancestor CONTRACTS files were found in the repository or parent directories. Relevant local contracts were read at implementing methods and active consumers. Target obligations in the baseline remain obligations even when their former declaration is now inactive. Existing syntax annotations were not weakened.

Caller boundary: import/reference search returned 46 declaration-import references across active modules, controllers, UI, the legacy PharmacyInventoryControl and pharmacy-agent service. The active workspace/controller/service chains were followed; the legacy control and pharmacy-agent execution flow were classified as outside this active-workspace audit. Per-declaration production caller sets found were all below 64 (the entire combined search returned 46), so no 64-caller cap was reached. This is not a transitive audit of every unrelated application route or every call site in the repository. Shared storage/stock helper implementations were inspected; unrelated prescriptions remained untouched.

Command evidence:

- `rg` searched baseline IDs, active imports, route decorators, guards, fields, source selectors, effects, filter/export consumers and caller references; decisive source was read with line numbers.
- `/tmp/clinic-cc-audit/node_modules/.bin/cc-check format <file>` and `list <file>` ran on the source inventory below. Format checks syntax and duplicate IDs only; list confirms discoverability. It does not establish semantic compliance.
- Source inventory/hash/tool output is retained at `/tmp/inventory-coverage-contracts.json`; caller-search output at `/tmp/inventory-coverage-callers.txt`. These temporary logs are supporting evidence, not substitutes for the durable findings and matrix here.
- `node /Users/nshah/.agents/skills/unlazy/scripts/gate-check.mjs --timeout 60 gates/inventory/coverage-audit.md` checks the audit ledger. No new executable tests were necessary for a read-only review.

Tooling measured: 34 source files, 34 format passes, 34 successful contract listings. Source snapshot SHA-256 values below allow later edits to be distinguished from this audit.

| Source | SHA-256 at audit |
|---|---|
| [frontend/src/app/dashboard/inventory/page.tsx](/Users/nshah/Clinic_Management_System/frontend/src/app/dashboard/inventory/page.tsx) | `045f1324d62970e43fce43cf2d5c16b28774a39b5d83b71d9a31d956a36e807b` |
| [frontend/src/components/inventory/InventoryWorkspace.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/InventoryWorkspace.tsx) | `acde65289701a5191d96877e0eee6f9d0df4e8c9d2604c63ae44d09df2220959` |
| [frontend/src/components/inventory/WorkflowDocumentEditor.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkflowDocumentEditor.tsx) | `becd8c404feff7254e4032176311d3c8b4928500f43335b97d1ef89c7d29caf2` |
| [frontend/src/components/inventory/WorkspaceStock.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/WorkspaceStock.tsx) | `f15257a555d120fc962b762d84238b50e99c5a0f940ea9f35558dd75d2318e04` |
| [frontend/src/components/inventory/ReplenishmentCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/ReplenishmentCenter.tsx) | `20f1fcace6b4af54b34d5e01b0b8b8a67f9e20a640d8f27a93d7556c30c0f71e` |
| [frontend/src/components/inventory/PurchaseDocumentActions.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/PurchaseDocumentActions.tsx) | `8bbe92d5860037b8456a14832e529d1ed5603e338c6f778a6cae04ec1a6480e8` |
| [frontend/src/components/inventory/AlternateInvoiceIntake.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/AlternateInvoiceIntake.tsx) | `3ecf935b3a90ace14c37fdedd07043d49f5e3aa67cdc7ba9145faa4a785af9ac` |
| [frontend/src/components/inventory/AddInventoryItemDialog.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/AddInventoryItemDialog.tsx) | `112a891b384e921a193d1f3b59e864a60c644ddcbb63c92d2afb62215d8794b2` |
| [frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx) | `9b037480c0834ace91bb75923251d5216b5f9f7217826608054c630360e80eec` |
| [frontend/src/components/pharmacy/PurchaseSourcePreview.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseSourcePreview.tsx) | `ac16f3faa92e498193b1497ce757c08665a52f1b8ecbd42abefe2c5b42bac575` |
| [frontend/src/components/pharmacy/PurchaseLedger.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PurchaseLedger.tsx) | `d6c3ea1dc9043b6f18f62098a9a0982363af812380579602a93bbb03b0149905` |
| [frontend/src/components/pharmacy/ComplianceCenter.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/ComplianceCenter.tsx) | `b674fe00991790d06a082257417a879f1d56d62b5320950450b7840386d88eb1` |
| [frontend/src/components/pharmacy/DistributorAnalytics.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/DistributorAnalytics.tsx) | `7ec3187443fc31a16f8da1a746ad8ca7d7ded481b5f4b2fefb22adf590ff2049` |
| [backend/src/modules/inventory/inventory-workflow.controller.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.controller.ts) | `ce43fd60e17ce8501c9aec45b47d96b08403dbee6432f204a49b1cd2fe015545` |
| [backend/src/modules/inventory/inventory-workflow.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts) | `9244817ba76ccd019d752c4e4f05a3d079f4bcb46800aa69f98a21386d893842` |
| [backend/src/modules/inventory/inventory-workspace.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts) | `3b9a29e7fa7fef7d31980c69a0fee84311e4a80cf4bb8fc81c09e3de87dd540d` |
| [backend/src/modules/inventory/inventory-replenishment.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-replenishment.service.ts) | `7c872eb30ff04fa390ce5ccc572b1441bf4f8ff4792e725e8f1d7d9666cadb0c` |
| [backend/src/modules/inventory/inventory-workflow-scheduler.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow-scheduler.service.ts) | `6ace895a1c015663737493ae834f65de9743b717ae6999c3dfbed4dd51f2e8d1` |
| [backend/src/modules/inventory/inventory-stock.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-stock.ts) | `68a6a3f4e019f234b8a70b648a54fdd8cd117124bb838ff62dffaa63a30d4601` |
| [backend/src/modules/inventory/inventory-import.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-import.service.ts) | `4a971043a981c6e42a923a02f7310419fa4a9e1709d0e7a7fce1914f9953664d` |
| [backend/src/modules/inventory/inventory.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory.service.ts) | `691efc32db009cd3336b4f6a82812d8716c4d286c9444013e6b50104166ebb5f` |
| [backend/src/modules/inventory/inventory-label.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-label.service.ts) | `60a4cd7d5bc389cf440977ca0c89c63ce7c5c12d3e768c6762f9ab329bd98b47` |
| [backend/src/modules/inventory/inventory-intake.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-intake.service.ts) | `f6ae0342f858674c810597a63e5440e7d7d553b70e7b725be4d600aa56262fb3` |
| [backend/src/modules/inventory/inventory-purchase-actions.controller.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-purchase-actions.controller.ts) | `a47af71dfc5b4007970919ecd1a11eac83103a82a6f82bd44a7f133b1eba68e5` |
| [backend/src/modules/inventory/inventory-purchase-actions.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-purchase-actions.service.ts) | `c96686a0a1b027d691947bf30a77eaccc700cd055abb1d946becf4a6e2950f30` |
| [backend/src/modules/pharmacy/pharmacy-purchase-invoice.controller.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.controller.ts) | `2259b67678da78eabc6878e31e03b21c2a8eb9c5cb3dd104bbc7d8da78c4a2a8` |
| [backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts) | `5ac5137b7fd2aebd59f43e0c13baa12d92b057597b44e2b3fefdbcae7f375528` |
| [backend/src/modules/pharmacy/pharmacy-purchase-ledger.controller.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-ledger.controller.ts) | `5c1b8d955d106dd364ca5cd6992ea0c10cd62a2f7d86e995ba5fa17fb5de3b93` |
| [backend/src/modules/pharmacy/pharmacy-purchase-ledger.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-ledger.service.ts) | `f636d22757a4ce6524259e2ebd629fb72dd996913eaf9d528fd0ac98d3919f99` |
| [backend/src/modules/pharmacy/pharmacy-compliance.controller.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-compliance.controller.ts) | `06d0dacac4ceacb8dcadd86bfc11e44b02fc20e86ce07bdb18bb55e42d024ba9` |
| [backend/src/modules/pharmacy/pharmacy-compliance.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-compliance.service.ts) | `48e723213a21dd6cf83de4304a9b97aebc8b444c593e571070b47be7ce8a4747` |
| [backend/src/modules/pharmacy/pharmacy-invoice.service.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-invoice.service.ts) | `94aefa70244e08cd95e883c80d352af4ce8191082192577caf098bbada40efa9` |
| [backend/src/modules/pharmacy/purchase-invoice-ocr.prompts.ts](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/purchase-invoice-ocr.prompts.ts) | `1390576d23fa3d96f628349800f746bf9488473e85d8b0dcbbaf61d177534f9c` |
| [frontend/src/components/pharmacy/PharmacyInventoryStarterImport.tsx](/Users/nshah/Clinic_Management_System/frontend/src/components/pharmacy/PharmacyInventoryStarterImport.tsx) | `cef1da7022f3a09fe8f8d481833579bbdbf8562a8e50163a4bab8057362f728a` |

## Backend completion addendum

After the hashed source audit, the assigned backend completion leaf fixed audited metadata CAS/conflict handling, exact product/pack grouping and unit equivalents, UTC-day expiry, complete/paged sale and hold source reads, movement-owner navigation metadata, and historical supplier cutoffs including later credit reversals. GST/monthly responses now expose all eligible source records for UI drill-down/export; monthly stock values explicitly identify the current snapshot. This addendum does not replace other owners’ UI or analytics acceptance evidence.

Evidence: [backend gap gates](/Users/nshah/Clinic_Management_System/gates/inventory/backend-gaps.md), [15 isolated PostgreSQL regression results](/Users/nshah/Clinic_Management_System/output/diagnostics/integrity-backend-gaps-db.json), and [runnable probe](/Users/nshah/Clinic_Management_System/scripts/diagnostics/integrity-backend-gaps-db.cjs). The prior integrity probe also passed 15/15 and ledger/compliance unit suites passed 10/10. The matrix above remains the explicitly scoped earlier source snapshot; it is not a claim that remaining UI or human acceptance criteria have passed.
