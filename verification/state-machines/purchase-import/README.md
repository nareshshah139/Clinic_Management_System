# Purchase import attempt

An automatic purchase import reads a supplier bill with OCR, saves a draft bill, and adds its stock. `PharmacyPurchaseImportAttempt` is the durable fence around that work. The client picks an attempt id before it uploads, so a lost response or a retry finds the same row.

This is one of the best-built machines in the repo. TLC finds that all eight rules hold in `code` mode. The negative controls show which guard each rule rests on. Before the fix one rule broke. A manager's recovery could turn an import that already saved its bill into a rejected one, and that bill could then never add stock. `before` mode keeps that behavior as a regression control.

## Model

`PurchaseImport.tla` holds one attempt, the bill its worker may save, and these actors.

- Two requests with the same attempt id. The first upload and the client's retry. Each registers the attempt, reads the bill with OCR, saves the draft in the claim-and-bind transaction, adds stock, and records the outcome. Either may die at any point after it registers.
- The pharmacist, who may stop the import and may press Add to stock on the saved draft.
- A manager, who may recover the import through `recoverDelegated`. The request may name an original that is linked to another, already saved bill (`stray`). The workbench adds the original it has open to `sourceDocumentIds` (`PurchaseInvoiceWorkbench.tsx:2122`).

| Model variable | Code |
| --- | --- |
| `status` | `PharmacyPurchaseImportAttempt.status`. `ABSENT` means no row yet. |
| `link` | `purchaseInvoiceId`. `mine` is the bill this attempt's worker saved. `other` is a bill that already existed. |
| `saved`, `committed`, `posts` | the bill row created in `createDraft`, its `stockCommittedAt`, and the number of stock postings |
| `history` | every status the row has held, so rules can talk about the past |

The CHECK constraint `purchase_import_outcome` is in the model as `CheckOK`. A write that would break it fails, as it does in PostgreSQL. The trigger `purchase_recovery_commit` is `Blocked`. It refuses stock for a bill that a rejected attempt names.

## Model to code

| Action | Code |
| --- | --- |
| `WorkerRegisters` | `execute` creates the RUNNING row, `purchase-import-recovery.ts:180`. A second request gets P2002 and only reads, `:181-186`. |
| `OcrReadsBill` | `run()`, which is `importWithRecovery` to `extractMany` to `importFromDocument`, `pharmacy-purchase-invoice.service.ts:396-505`. The `other` outcome is the duplicate path, `:473-477` and `:490-496`. |
| `WorkerSavesDraft` | `createDraft`, `pharmacy-purchase-invoice.service.ts:911-945`. `preparePurchaseWrite`, then `claimPurchaseImport` (`updateMany` where status RUNNING, `purchase-import-recovery.ts:230-233`), the bill insert, and `bindPurchaseImport` (`:240-242`) in one transaction. A failed claim becomes NOT_SAVED, `pharmacy-purchase-invoice.service.ts:498-500`. |
| `WorkerReadsBill`, `WorkerAddsStock` | `processInvoice` to `commitStockInTransaction`, `pharmacy-purchase-invoice.service.ts:503`, `:1376-1410`. The claim is `updateMany` where status REVIEWED and `stockCommittedAt` null, `:1399-1410`. |
| `WorkerRecordsOutcome` | `execute`, `updateMany` where status RUNNING, `purchase-import-recovery.ts:191-200` |
| `WorkerDies` | the Node process stops |
| `PharmacistOpensDraft`, `PharmacistAddsStock` | `commitStock`, `pharmacy-purchase-invoice.service.ts:1357-1368`, which shares `commitStockInTransaction` |
| `PharmacistStopsImport` | `resolve`, `purchase-import-recovery.ts:212-222`. A tombstone create, or `updateMany` where status RUNNING. |
| `ManagerRecovers` | `recoverDelegated`, `purchase-import-recovery.ts:96-175`. A saved bill that exists is looked up first, `:135-138`. The decision is `:143-148`. |
| `CheckOK` | `migrations/20261024150000_unlinked_purchase_recovery/migration.sql:4-8` |
| `Blocked` | the same migration, `purchase_recovery_guard` and trigger `purchase_recovery_commit` |

## Rules

| Rule | Kind | `code` | Guard that keeps it, or the bug |
| --- | --- | --- | --- |
| `TypeOK` | invariant | holds | |
| `NeverRunningAgain` | invariant | holds | `execute` uses `create`, never an upsert |
| `TerminalStaysTerminal` | invariant | holds | the claim in `createDraft` and the RUNNING predicate in `execute`'s final write |
| `SavedStaysSaved` | invariant | holds | `recoverDelegated` keeps an INVOICE_SAVED attempt's existing bill before it counts the originals, `:135-144` |
| `InvoiceRecorded` | invariant | holds | the bind shares the bill's transaction |
| `StockOnce` | invariant | holds | the stock claim's `stockCommittedAt: null` predicate inside the transaction |
| `ResolveAlwaysPossible` | invariant | holds | `resolve` accepts RUNNING |
| `RunningSettles` | property | holds | `execute`'s catch block records NO_STOCK_WRITTEN |

## The fix

`recoverDelegated` gathered bill ids from the attempt and from every original in the request, `purchase-import-recovery.ts:143`. When the workbench sent an original linked to another saved bill, that made two ids, `invoice` was null, and the status became RETRY_REJECTED. The trigger then refused stock for the import's bill and for the other bill. The contract at `:93` says a saved invoice must win by exact identity.

- `purchase-import-recovery.ts:135-137` looks up the attempt's own bill when the attempt is INVOICE_SAVED. `:144` makes that bill the decision whenever it exists, so stray originals no longer count. The recovery still records its reason and audit, as it does for any first recovery of a saved import. The repeat-recovery shortcut at `:138` reuses the same lookup.
- `recoverUnlinked` had the same shape, `:63-77`. `:63` returns the attempt unchanged when it names a bill that exists. Its contract covers legacy and orphaned imports, and an attempt whose bill exists is neither. An orphaned attempt, whose bill is missing, still goes to RETRY_REJECTED.

In the model, `KeepsSaved` is now true in every mode but `before`. A recovery of a saved import with a stray original rewrites INVOICE_SAVED and the same bill, which changes no model variable, so `code` takes the same branches as `fixed`.

`backend/src/modules/pharmacy/tests/purchase-import.formal-replay.database.spec.ts` replays TLC's shortest path from `results/before.md` through the real `PharmacyPurchaseInvoiceService` with only OCR stubbed. It pauses the worker after the save, recovers with another bill's original, then lets the worker continue. It asserts the attempt stays INVOICE_SAVED with its bill, the worker adds the bill's stock, and the other bill can still add stock. `purchase-import-delegation.database.spec.ts` covers the same request through `recoverUnlinked` and `recoverDelegated` directly.

## Negative controls

Each control is `fixed` with one guard removed. Each breaks the rule named.

| Mode | Mistake | Breaks |
| --- | --- | --- |
| `noClaim` | The draft transaction skips `claimPurchaseImport`. A worker that finishes OCR after the pharmacy stopped the import saves its bill anyway. | `TerminalStaysTerminal` |
| `bindOutsideTx` | The bill commits before `bindPurchaseImport` runs. A stop between the two leaves a saved bill under a NO_STOCK_WRITTEN attempt. | `InvoiceRecorded` |
| `finalizeByIdOnly` | `execute`'s final write drops `status: 'RUNNING'` from its where. A late worker overwrites a stopped attempt. | `TerminalStaysTerminal` |
| `checkOutsideTx` | The stock claim reads `stockCommittedAt` in one step and writes in another without re-checking. The worker and Add to stock both post. | `StockOnce` |
| `retryReregisters` | Registration is an upsert. A request delayed past a stop sets the attempt back to RUNNING. | `NeverRunningAgain` |
| `resolveRefusesRunning` | Stop refuses a running attempt, as `recoverUnlinked` does at `:55`. | `ResolveAlwaysPossible` |
| `noFinalizeOnError` | `execute`'s catch block rethrows without recording NO_STOCK_WRITTEN. A failed OCR leaves the attempt RUNNING. | `RunningSettles` |
| `typeProbe` | `link` starts outside its type. | `TypeOK` |

The CHECK constraint is a second guard that the controls run into. A `resolve` without its RUNNING predicate would try to write NO_STOCK_WRITTEN over a saved bill's id, and the CHECK refuses it. That is why no control removes `resolve`'s predicate alone.

## Liveness and fairness

`Spec` has one fairness clause, `\A w \in Workers : WF_vars(Server(w))`. It says the server process keeps running, and the database and the OCR provider eventually answer or fail. That is an assumption about the environment, not a guarantee in the code. No person's action has fairness. The pharmacist may close the tab and the manager may never come.

`RunningSettles` uses that assumption. A worker that is still alive always moves the attempt out of RUNNING. A worker that dies leaves the attempt RUNNING with no lease or timeout. Only a person can end it, and `ResolveAlwaysPossible` checks that the pharmacist always can. It is an invariant with `ENABLED`, because the exit is a user action. The chart shows this state as "Import running, worker gone".

## What the model leaves out

- `recoverUnlinked`, legacy imports with no attempt row, and orphan rows whose bill is missing. The FK with `ON DELETE RESTRICT` makes a missing bill impossible for new rows.
- `read()`'s derived outcomes DRAFT_SAVED, STOCK_COMMITTED and UNKNOWN. The chart shows the stored state.
- The `requestHash` check on retry, branch and user scoping, and permissions.
- Original-document linking and the `purchase_recovery_link` trigger.
- Bill edits, review, rejection and reopening after the save. The model posts stock straight from the draft.
- Multi-page assembly and the six-page limit.
