# Inventory reconciliation guarantees

The module supports **conditional physical-stock reconciliation**. The current implementation does **not** justify an unconditional guarantee that every inventory entry or document history can be reconciled.

Clinic staff can use a fresh reviewed count to bring a valid batch balance to a verified physical count. Maintainers must still address two missing recovery transitions and a writer that can bypass the balance invariant. This report provides the state graphs, proofs, counterexamples, and rerunnable checks.

The inspection covers the local working tree on 24 October 2026, based on commit `86fdce0dc90eac4b697be912aa7d3ad64f77788e` plus existing local changes. [Source fingerprints](source-baseline.json) identify the inspected files. Application code and production data were not changed.

## Define what must reconcile

The state is `S = (branch, batch, q, h, r, D, E, M, P)`.

- `q` is persisted on-hand stock in the batch's stock unit.
- `h` is held stock. Available stock is `q - h`.
- `r` is the batch revision. Imported counts use `updatedAt` as well as a quantity snapshot.
- `D` contains workflow documents, statuses, versions, and request keys.
- `E` contains the signed quantity and hold effects linked to each document.
- `M` is the movement history.
- `P` is an independently verified physical count in the same unit. The application cannot prove the shelf count is truthful.

Three goals must be distinguished. `Q(P)` means `q = P`. `Posted(d)` means a particular document successfully posts. `Corrected(d)` means the erroneous document's history has a valid linked compensation. A quantity adjustment can establish `Q(P)` while leaving `Corrected(d)` false.

For ledger reconciliation, let `L = B + sum(signed movements)`, where `B` is an independently verified opening balance. The stronger predicate is `q = P = L` with valid product, batch, and source-document identity.

## State graphs

Green identifies successful quantity states. Amber identifies a conditional recovery or assurance limit. Red identifies a demonstrated blocked path. These are source-derived abstractions, not a complete model of every controller, role, database failure, or UI interaction.

### Stock quantities and holds

![Stock quantity transitions](stock-state.png)

[Scalable graph](stock-state.svg) · [Graph source](stock-state.dot)

This graph describes the stock-bearing effects. Opening stock additionally requires a zero-stock batch without prior movements. Sales returns marked LOSS add no inventory quantity because those units are not restocked. Purchase orders, quotations, saved drafts, and supplier-credit allocation do not themselves receive inventory.

### Stock-workflow document lifecycle

![Generic stock-workflow lifecycle](workflow-lifecycle.png)

[Scalable graph](workflow-lifecycle.svg) · [Graph source](workflow-lifecycle.dot)

A supplier-return CHALLAN already removes stock. Final posting creates its credit without a second stock debit. Cancelling it compensates the stock effect if its dependency guards permit that operation. A reversal retains the original and creates a linked posted CORRECTION. Released HOLD documents have no reopen or reverse edge. Released SALES_RETURN documents can be reversed subject to their guards. See the [transition handler](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:739), [challan finalization](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:1285), and [reversal handler](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:1613).

### Physical count and restart paths

![Count recovery state graph](count-recovery.png)

[Scalable graph](count-recovery.svg) · [Graph source](count-recovery.dot)

`STALE` and the held-stock blocker are analytical states, not persisted status strings. An unsuccessful transition retains the prior document status. CANCEL and a new COUNT are separate operations. A rejected document cannot be reopened. A cancelled count cannot be resumed by retrying its old request key.

An ordinary COUNT can be created with a fresh request key. Stocktake import instead hashes the file bytes and trimmed reason. Identical reimport returns the original document even if that document is CANCELLED or REJECTED. Recount and start a genuinely new attempt with a new key. For the import route, the file or reason must change. Saving the same draft line also retains its original quantity snapshot and imported revision.

Evidence is in [COUNT creation](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:338), [snapshot retention](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:552), [request-key lookup](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:312), and [stocktake import](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-stocktake.service.ts:140). The [stocktake UI](/Users/nshah/Clinic_Management_System/frontend/src/components/inventory/StocktakeTools.tsx:38) instructs staff to pause billing and receipts and recount changed stock.

### Purchase entry and a blocked reviewed document

![Purchase recovery state graph](purchase-recovery.png)

[Scalable graph](purchase-recovery.svg) · [Graph source](purchase-recovery.dot)

Original files survive OCR failure. Editable drafts and partial intake do not post stock. Successful purchase commitment claims the invoice and posts its effects in one serializable transaction. An already committed retry returns the saved invoice. Billing a matching posted inward challan adds no second stock receipt.

These guarantees follow [original retention](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:207), [OCR failure handling](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:309), [commit transaction](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:1238), [conditional claim](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:1280), and [receipt-linked billing](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:1341).

## Formal proofs and their boundaries

### P1. A protected stock movement preserves the held-stock floor

Assume `q` and `h` are valid persisted integers, `0 <= h <= q`, and the actor and batch are valid. Let `d` be a nonzero integral stock delta and `c` the consumed held quantity. The helper requires `0 <= c <= h` and `q + d >= h - c`.

It assigns `q' = q + d` and `h' = h - c`. Therefore `h' >= 0` and `q' >= h'`. It records `quantityDelta = d`, so the movement's signed quantity equals `q' - q`.

The update predicate includes the observed branch, on-hand quantity, and held quantity. A competing change that leaves either observed balance different causes rejection. The predicate alone does not detect every intervening write or a change followed by a restoration of the same values. If the caller supplies the required transaction, failure rolls back both balance and movement.

This is a local Hoare-style proof for [writeStockMovement](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-stock.ts:44), particularly its guards at line 78 and update at line 91. It is **not a proof that every writer uses this helper**. The import counterexample below prevents that promotion.

### P2. A successful fresh COUNT reconciles quantity exactly

Assume an existing branch batch, a truthful nonnegative `P` that fits the database integer type, correct stock units, authorization, required approval, and `P >= h`. Assume the transaction commits and the count snapshot remains current.

Saving the count captures `systemStock = q0`. Posting checks `q = q0` and, for imported counts, the batch revision. The effect is `d = P - q0`. Thus:

```text
q' = q + d
   = q0 + (P - q0)
   = P
```

If `P = q0`, no quantity movement is needed. The successful count still records its audit and count metadata. Blank rows are excluded rather than interpreted as zero.

For each effect-bearing line, the workflow computes `new delta = target delta - sum(previous line effects)`. The cumulative effect therefore converges to the target rather than adding the target again. Document-version checks and unique effect keys provide additional replay guards. A repeated HTTP transition may reject a stale version; at-most-once effect does not mean every retry returns success.

The [stale-count guard](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:1028), [count delta](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:1349), [effect difference](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:1450), and [atomic count audit](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:906) establish this mapping. Database uniqueness is declared in [workflow models](/Users/nshah/Clinic_Management_System/backend/prisma/schema.prisma:1538).

### P3. A recovery path exists under explicit operational conditions

Let `C(S,P)` mean all P2 preconditions can be established. In addition, obstructing holds have valid source records and an authorized, legitimate resolution that reduces `h` to at most `P`. A fresh request key is available. Actors can obtain approval and a sufficiently stable interval for a successful commit.

For any state satisfying `C`, construct the path as follows:

1. Resolve obstructing source holds through the appropriate authorized release, loss, or return action.
2. Cancel a stale open count if necessary. Leave a terminal historical count intact.
3. Recount and save a fresh COUNT with a new request key and current snapshot.
4. Obtain approval if required, then post successfully.

P2 gives `Q(P)` at the final state. In temporal notation, the intended property is `AG(C => EF Q(P))`. From every reachable state meeting these conditions, some finite recovery path exists. The proof concerns a fixed verified `P` during the recovery interval. It does not promise perpetual agreement while goods continue moving.

The bounded checker establishes reachability in its nine-state abstraction. The algebra above applies to all representable values meeting the preconditions. No automated refinement proof connects every application instruction to this abstract machine.

### P4. Unconditional eventual success is false

`AG AF Q(P)` would require every execution to reconcile. An execution can remain awaiting approval forever. Repeated concurrent changes can invalidate every snapshot. All three serializable transaction attempts can fail. These are counterexamples without any database corruption.

The [transaction wrapper](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:128) retries only `P2034`, twice after the initial attempt. Availability, actor cooperation, scheduling fairness, and a stable interval are essential assumptions, not consequences of the state graph.

### P5. A normal count preserves a pre-existing ledger gap

Assume an independently anchored ledger total `L` and stock `q` already differ. A normal count applies the same `d = P - q` to stock and the ledger.

```text
q' - L' = (q + d) - (L + d) = q - L
```

Therefore a count repairs physical quantity but cannot remove an existing discrepancy between stock and independently verified movement history.

![Ledger gap counterexample](ledger-counterexample.png)

[Scalable graph](ledger-counterexample.svg) · [Graph source](ledger-counterexample.dot)

The current item ledger derives `openingBalance = currentStock - sum(movement deltas)`. Its final displayed close equals current stock by construction. That equality is not an independent conservation check. Historical unsigned adjustments produce an unknown delta and null opening/running balances. See [ledger calculation](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:183) and [movementDelta](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-stock.ts:33).

## Concrete gaps that prevent the broad guarantee

### Released hold prevents downstream correction

![Released hold counterexample](hold-counterexample.png)

[Scalable graph](hold-counterexample.svg) · [Graph source](hold-counterexample.dot)

Starting with `q=10,h=0`, post HOLD H for 5, post LOSS L for 3 against H, then release H's remaining 2. The result is `q=7,h=0,H.status=RELEASED`.

If those three units are found, reversing L calls `holdBalances(H,L)`, which requires H to remain POSTED. Reversing H also rejects a released HOLD. Editing the original is disallowed. The ledger correction endpoint rejects workflow-owned movements. A fresh COUNT can restore `q=10`, but L remains POSTED and its history is not reversed.

This trace was reproduced using the actual service helpers with in-memory data. Evidence is in [source-hold status validation](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:1500), [release](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:1528), [reversal status validation](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:1624), [consumer reversal](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:1656), and [owned-movement correction rejection](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workspace.service.ts:444).

A supported repair needs either a guarded compensation path for a released source or a release rule that preserves downstream correction. Any such design must retain source ownership and avoid restoring a hold against an unrelated source.

### REVIEWED purchase can have no direct repair transition

An otherwise valid draft can supply `workflowReceiptId = "missing-receipt"`. The optional string is persisted without a receipt foreign key. `markReviewed` does not resolve it. Commit later rejects the absent posted inward challan and rolls back to REVIEWED.

`updateDraft` excludes REVIEWED. Automatic processing retries the same failure and can return the response label `SAVED_FOR_REVIEW` while the stored status remains REVIEWED. The inspected purchase actions only permit source attachment and limited metadata changes. The UI locks reviewed editing. No direct reopen or receipt-link repair transition was found in these APIs.

This is a source-backed counterexample, not a live database reproduction. See the [DTO](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/dto/pharmacy-purchase-invoice.dto.ts:247), [stored link](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:881), [edit guard](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:944), [review transition](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:1213), [commit guard](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:1317), and [retry result](/Users/nshah/Clinic_Management_System/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:472).

Validate receipt links before locking a draft and provide an audited reopen path for failed reviewed invoices. A new quantity count would not repair the original bill's state or its source linkage.

### Opening import can overwrite a concurrent decrement

Under Read Committed isolation, this source-permitted schedule is possible:

```text
Import reads q = 10 and calculates stockDelta = 0.
A sale commits q = 9 and its movement delta = -1.
Import updates by item ID and writes its stale absolute q = 10.
Import creates no stock movement because its computed delta was zero.
```

The import takes a branch advisory lock used by opening imports. The inspected stock helper does not take that lock. The importer supplies no explicit serializable option and its update lacks the observed quantity predicate. This invalidates a global conservation proof unless the deployment imposes stronger isolation or writer coordination. The interleaving has not been tested on PostgreSQL.

See [import transaction](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-import.service.ts:599), [zero-delta check](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-import.service.ts:727), [absolute update](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-import.service.ts:797), and [zero-delta movement skip](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-import.service.ts:1218). A metadata-only update of an existing batch must not rewrite its quantity. Any intentional quantity change needs the same guarded transaction discipline as other writers.

## Remaining assurance limits

- Product identity is a precondition. Opening-import drug matching uses name and manufacturer while batch fallback uses name and batch. Import can connect a second product to a batch. Identity merge rejects batches with multiple product links. Other identity-repair routes were not exhaustively traced, so this is an assurance gap rather than a global impossibility claim. See [drug lookup](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-import.service.ts:1120), [batch lookup](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-import.service.ts:1153), [link addition](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-import.service.ts:800), and [merge guard](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-identity-merge.service.ts:38).
- The approval contract says approval must be recorded before an adjustment requiring approval posts. OWNER, ADMIN, and MANAGER can directly post a DRAFT count without the APPROVE transition or `approvedBy`. Clarify whether direct manager posting is intended to constitute recorded approval. See [contract](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:727) and [role shortcut](/Users/nshah/Clinic_Management_System/backend/src/modules/inventory/inventory-workflow.service.ts:835).
- Reversing receipts or restocked returns can require stock that has since been sold or held. Dependency and stock guards are intentional. A fresh count cannot substitute for correct supplier dues, sale refunds, or source-document history.

## Verification and reproducibility

Run from the repository root:

```sh
python3 verification/inventory-reconciliation-2026-10-24/check_model.py
node verification/inventory-reconciliation-2026-10-24/source_probes.cjs
```

The checker uses starting quantities and counts from 0 through 12, and movement deltas from -12 through 12. It checks 8,190 accepted movement combinations, 819 directly postable count combinations, and 1,183 conditional recovery combinations. It also checks 2,197 ledger-gap combinations and reachability in a nine-state abstraction. These finite checks support the algebra; they are not an unbounded implementation proof. The checker rejects source drift against the saved fingerprints.

The six source probes exercise actual TypeScript methods with in-memory Prisma substitutes. They confirm signed movement/overdraft behavior, COUNT effect convergence, stale-count rejection, the held floor, the hold reversal counterexample with separate quantity recovery, and unknown historical deltas. Private helpers are invoked directly. These are not HTTP, authorization, real-database isolation, or production-data tests.

The existing contract-probe script produced seven passes and two failures. One failure is a missing `findMany` dependency in its old fake. The other calls a retired audit endpoint that now rejects with no stock change. Those failures are fixture/API drift, not evidence of a newly observed inventory corruption. [Existing results](existing-probes.json) preserve the exact output.

Relevant declaration contracts were read. No applicable ancestor CONTRACTS files were found in the inspected paths. `cc-check` was unavailable in PATH, so format and discoverability were inspected manually. That does not replace the requested tool checks or prove semantic compliance. Source-level verification is bounded to the paths cited here. No claim is made about every pharmacy integration, production record, or deployed database setting.

[Model results](model-results.json) · [Source probe results](source-results.json) · [Model checker](check_model.py) · [Source probes](source_probes.cjs)

## Decisions and review record

Model the Domain led to an explicit state tuple and separate quantity, document, and ledger predicates. Build the Lever led to retained executable checks and editable graph sources. Prove It Works led to actual service-helper probes and direct inspection of rendered graphs. Sequence Work into Verifiable Units led to checking the algebraic model before adding source counterexamples. Laziness Protocol kept application changes out of this investigation and limited additions to this evidence package.

Two generic read-only exploration agents shared the checkout without write access. One traced count, hold, return, and reversal workflows. The other traced intake, purchase, import, and identity paths. The parent checked cited source and ran the retained probes. Model settings were inherited; no independent model diversity is claimed. Stale retrieval fell back to bounded reads of named inventory targets. No separate chat, goal, automation, commit, or external write was created.

A third read-only agent reviewed the proofs, counterexamples, scripts, and source fingerprints. It found no blocking proof error and requested the compare-and-set wording correction now included in P1. Its no-comments review found no actionable comments. Required contract documentation was retained. No comment deletions, application fixes, or approval requests resulted from that review.
