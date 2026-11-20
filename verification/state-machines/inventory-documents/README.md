# Shortbook, purchase order and receipt

A shortbook is a request for stock. Making a purchase order from it moves the shortbook to ORDERED. An inward challan (the receipt) posts stock against the order, and the order and shortbook follow the received quantity. All three are `InventoryWorkflowDocument` rows with a free-text `status` and an integer `version`.

This is one of the best-built machines in the repo. Every write compares the version, and every request runs in one Serializable transaction. TLC finds that all six rules hold in `code` mode. Before the fix one rule broke. Cancelling or rejecting an order through the document's Cancel or Reject button left its shortbook ORDERED forever, and no action could close it. `before` mode keeps that behavior as a regression control.

## Model

`InventoryDocuments.tla` holds one shortbook (`sb`), the order made from it (`po`), and one receipt (`rc`) linked to the order. The order wants 2 units. The receipt carries 1 or 2, chosen at the start, so the order can end part or fully received.

Two people, `clerk` and `manager`, work at once. Both may send any action, because the server is the boundary and a screen can be stale. A request carries the version the person saw (`UserSends`). The server then commits or refuses the request in one step (`ServerCommits`), because `transaction()` runs it as one Serializable transaction. While both people have a request in flight, the database may abort one (`ServerAborts`). `transaction()` retries twice, then fails the request.

| Model variable | Code |
| --- | --- |
| `st[d]`, `ver[d]` | `InventoryWorkflowDocument.status` and `.version` for the shortbook, order and receipt. `ABSENT` means the order is not yet created. |
| `req[a]` | the request a person has in flight, with the version they sent and the retry count |
| `posts` | times the receipt's stock effects were applied by `applyStockDocument` |
| `final[d]` | the first CANCELLED, REJECTED or REVERSED status a document reached |
| `staleWrote` | a request changed its document although the version had moved on |

## Model to code

All paths are in `backend/src/modules/inventory/`.

| Model | Code |
| --- | --- |
| `ServerCommits`, `ServerAborts` | `transaction()` with `isolationLevel: 'Serializable'` and two retries on P2034, `inventory-workflow.service.ts:171-182` |
| version compare | `transition`, `inventory-workflow.service.ts:919`, then `update` where `version: dto.version`, `:1046`. `cancelRemaining` uses `version()`, `inventory-replenishment.service.ts:370`. |
| `SbCreatePO` | `convert`, `inventory-workflow.service.ts:2423-2477`. FINAL check `:2438`, idempotent request key `:2442-2448`, shortbook to ORDERED `:2467`. |
| `SbCancel`, `PoCancel` | `move` CANCEL, `:968-990`. An order with posted receipts is refused at `:976-989`. A cancelled order closes its ORDERED or PART_RECEIVED shortbook, `:1097-1114`. |
| `SbReject`, `PoReject` | `move` REJECT, `:991-996`. A rejected order closes its shortbook the same way, `:1097-1114`. |
| `PoSubmit`, `PoApprove` | `move` SUBMIT and APPROVE, `:997-1011` |
| `PoCancelRemaining` | `cancelRemaining`, `inventory-replenishment.service.ts:319-335`. It cancels the source shortbook with no status check, `:330`. |
| `RcPost` | `move` POST, `:1026-1037`, then `applyStockDocument` and `updateOrderReceipt`, `:1096` |
| `RcReverse` | `reverse`, `:2481-2618`, then `updateOrderReceipt(..., true)`, `:2611` |
| `ReceiptOutcome` | `updateOrderReceipt`, `:2659-2770`. A cancelled order stays cancelled, `:2732`. A cancelled or rejected shortbook is skipped, `:2753`. |
| `FINAL` | `inventory-workflow.service.ts:52-59` |

## Rules

| Rule | Kind | `code` | Guard that keeps it, or the bug |
| --- | --- | --- | --- |
| `TypeOK` | invariant | holds | |
| `StaleNeverWrites` | invariant | holds | the version compare in `transition` and `cancelRemaining` |
| `PostedOnce` | invariant | holds | POST accepts only DRAFT, APPROVED and CHALLAN |
| `TerminalStaysTerminal` | invariant | holds | `convert`'s FINAL check and `updateOrderReceipt`'s skip of a closed shortbook |
| `ShortbookFollowsOrder` | invariant | holds | `move` CANCEL and REJECT close an ORDERED or PART_RECEIVED shortbook with the order, `:1097-1114` |
| `RequestsFinish` | property | holds | `transaction()` retries at most twice |

The census flagged `cancelRemaining`, which cancels the source shortbook without checking its status. TLC shows that write is safe. While an order is open, its shortbook is always ORDERED or PART_RECEIVED. CANCEL and REJECT refuse an ORDERED shortbook, closing the order closes the shortbook in the same transaction, and the order and shortbook reach RECEIVED in the same transaction. The `rejectOrderedShortbook` control shows the write matters as soon as an ORDERED shortbook can be closed another way. The missing check is a latent hazard, not a live bug.

## The fix

Before the fix, `move` CANCEL and REJECT closed a purchase order and left its shortbook ORDERED. CANCEL refuses an ORDERED shortbook (`:968-975`), REJECT refuses it (`:991-995`), `cancelRemaining` refuses a cancelled order (`inventory-replenishment.service.ts:324`), and CREATE_PO returns the cancelled order through its request key (`:2442-2448`). Nothing could close or re-order the request.

- `inventory-workflow.service.ts:1097-1114`. When CANCEL or REJECT closes a purchase order that has a `sourceId`, `move` reads the source shortbook. If it is ORDERED or PART_RECEIVED, it sets it to CANCELLED with a version compare and records an `ORDER_CANCELLED` or `ORDER_REJECTED` event, in the same transaction. This is what `cancelRemaining` already does, and it is the `fixed` mode's `CloseShortbook`, so `code` takes the same branches as `fixed`.

A rejected order also leaves its shortbook CANCELLED, not REJECTED. REJECTED on a shortbook means a reviewer turned the request down, and here the request was ordered and the order was closed.

`backend/src/modules/inventory/tests/inventory-documents.formal-replay.database.spec.ts` replays TLC's shortest path from `results/before.md` through the real `InventoryWorkflowService`, for Cancel and for Reject. Each asserts the order is closed and the shortbook is CANCELLED.

## Negative controls

Each control is `fixed` with one guard removed. Each breaks the rule named.

| Mode | Mistake | Breaks |
| --- | --- | --- |
| `noVersionCheck` | `transition` skips `doc.version !== dto.version`. A request built on an old screen writes. | `StaleNeverWrites` |
| `noPostedCheck` | POST accepts any status. Posting a receipt again after a reload adds its stock twice. | `PostedOnce` |
| `convertIgnoresFinal` | `convert` drops the FINAL check. Making an order from a rejected shortbook reopens it as ORDERED. | `TerminalStaysTerminal` |
| `receiptIgnoresClosedShortbook` | `updateOrderReceipt` updates the shortbook even when it is cancelled. Reversing a receipt after Cancel remaining sets the shortbook back to ORDERED. | `TerminalStaysTerminal` |
| `rejectOrderedShortbook` | REJECT accepts an ORDERED shortbook. `cancelRemaining`'s unchecked write then turns REJECTED into CANCELLED. | `TerminalStaysTerminal` |
| `retryUnbounded` | `transaction()` retries P2034 with no limit. Two clashing requests can abort each other forever. | `RequestsFinish` |
| `typeProbe` | `posts` starts outside its type. | `TypeOK` |

Two guards sit behind `PostedOnce`. A double click sends two POSTs with the same version, and the version compare refuses the second. A POST sent again after a reload has the new version, and only the status check refuses it. `noPostedCheck` reaches the second case.

## Liveness and fairness

`Spec` has one fairness clause, `\A a \in Actors : WF_vars(Server(a))`. It says the database eventually answers a request already sent, with a commit, a refusal or an abort. That is an assumption about the environment. No one is assumed to send a request. Everything in this subsystem moves because a person acts, so the only liveness question is whether a request the server took always finishes.

`RequestsFinish` holds because a request aborts at most three times. `ServerAborts` lets the database abort a request whenever another request is in flight. Real Serializable conflicts need overlapping reads and writes, so this is an over-approximation. It is the strong side for a liveness check.

## What the model leaves out

- Document kinds other than SHORTBOOK, PURCHASE_ORDER and INWARD_CHALLAN, and COUNT, TARGET_REVIEW, holds and credit notes.
- Shortbook SUBMIT and APPROVE. `convert` accepts DRAFT, AWAITING_APPROVAL and APPROVED alike, so they do not change any rule.
- Draft edits through `writeDocument`, `resolveOutcome`, and `dispatchOrder`, which never writes SENT.
- A purchase order saved through the API with a hand-set `sourceId`. The editor offers a source only for INWARD_CHALLAN and GATE_PASS. With a hand-set source, `cancelRemaining`'s unchecked write could change a shortbook that is already terminal.
- More than one receipt, over-receipt checks, supplier and line matching, and billed receipts that block a reversal.
- Permissions and roles. Both people may send every action.
