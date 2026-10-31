# Invoice recovery verification

The finite model checks whether a pharmacist can recover the current invoice after product-check, product-save, review, or stock-response failures. The checked workflow includes asynchronous callbacks that arrive after another invoice opens or after the current editor changes.

[The generated state graph](results/state-graph.svg) groups concrete states by the displayed workflow phase. Every green node means **all** concrete states in that group have a verified path to readiness or confirmed stock. A path can require a successful service response or an authorized colleague. The displayed step count bounds the shortest available modeled path. It does not bound user effort, elapsed time, or repeated failures.

The checked result is **bounded formal model checking**, with executable UI regression tests providing separate implementation evidence. This is not a theorem about all React executions or the production database.

## Checked properties

`InvoiceRecovery.tla` defines the transitions independently of the application. TLC checks `Safety` over every reachable model state. `verify.py` also checks the exported graph edges independently of the model's observer variables.

- Stale callback completions cannot change the active editor's phase, readiness, approval, saved-product fact, retained-entry flag, busy indication, or focus indication. They may retire their own operation slot. A previously authorized stock operation may finish for its originating invoice.
- The combined review-and-stock path cannot dispatch review without explicit approval and exact current readiness. The separate reviewer-only action is outside this approval property.
- Product checks, retry checks, product saves, corrections, handoffs, and stock-status reads cannot write stock. Only a modeled commit response can change a stock count.
- A successful product save remains distinguishable from a failed subsequent check. Failed product saves retain the indication that typed entries are present.
- An unknown stock outcome requires status readback before the workflow can attempt stock posting again.

The runner computes backward reachability from `ready` and `committed` over the complete exported graph. Recovery edges preserve the invoice identity and exclude `ReplaceEditor` and `InvalidateEditor`. An operator cannot satisfy the proof by abandoning the failed invoice. The resulting property is `AG EF (ready or committed)` over this restricted recovery relation. Every reachable state has an available recovery path. The model also permits endless failed requests or no user action, so it does not establish unconditional eventual completion.

## Finite bounds and assumptions

The model contains two invoice identities, one possible invoice replacement, two reusable asynchronous operation slots, and two product-edit permission profiles. Request identities use an equality abstraction. Each captured operation is either current or permanently stale until its slot is retired. This avoids generation-counter wraparound. Retries have no numerical limit, so the finite graph includes retry cycles.

One aggregate readiness value represents **all current invoice lines having exact, complete matches**. Incomplete, missing, ambiguous, malformed, and ready responses remain distinct outcomes. This model does not enumerate every line count, identity-string value, or catalogue field value. It also does not cover three or more simultaneously outstanding operations.

Recovery assumes that a successful service response remains possible, correct product information or authorized assistance is available, and stock readback can return a decisive status. Handoff is an intermediate state, not a completed recovery. Permanent outages and permanent denial of assistance are outside the claim.

The exact-match endpoint is assumed to report readiness truthfully. Backend stock posting is modeled as an authorized, atomic, idempotent operation per invoice. The model therefore checks which workflow actions can invoke stock effects. It does not prove the database implementation's atomicity or idempotence.

Locked invoices, existing reviewed invoices, explicit reopening, cancellations, supplier reconciliation, malformed HTTP payload parsing, medication correctness, and layout usability are outside this bounded model. Existing tests and the browser diagnostic cover portions of those behaviors separately. No liveness claim depends on unmounting or replacing an editor.

## Implementation correspondence

| Model boundary | Application boundary | Separate implementation evidence |
| --- | --- | --- |
| Current or stale operation | `sameCatalogueRequest`, `catalogueCurrent`, `attemptCurrent` | Request identity unit tests and deferred-response component tests. |
| `BeginCheck`, check response and failure | `refreshMasterMatches` | Exact-readiness parsing, check-only retry, stale-response component tests. |
| Product edit, save, failure, saved recheck | `saveProductDetails`, `PurchaseProductDetails` | Saved-check-failed browser path, retained-form tests, no stock call assertions. |
| `DraftSaved`, review response, catch and cleanup | `reviewAndCommit`, `captureCatalogueFailure` | Late rejection after switching invoices and post-await identity regressions. |
| `ReviewCleanup`, `FocusCallback` | `focusActionFeedback` | Queued-focus generation check and current-editor feedback tests. |
| Commit, lost response, readback | Commit API call and `refreshStockStatus` | Existing stock uncertainty and readback tests. Database semantics remain an assumption. |

These symbols live in [PurchaseInvoiceWorkbench.tsx](../../frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx), [purchase-invoice-catalogue.ts](../../frontend/src/lib/purchase-invoice-catalogue.ts), and [PurchaseProductDetails.tsx](../../frontend/src/components/pharmacy/PurchaseProductDetails.tsx). The formal model preserves the intent of `current-invoice-catalogue-check`, `catalogue-save-and-recheck`, and `explicit-exact-readiness`. The graph does not import production transition decisions and therefore cannot automatically establish implementation correspondence.

## Evidence

[summary.json](results/summary.json) records the model bounds, source hashes, checker hash, complete state and edge counts, and checks against nonempty sets of relevant transitions. [witnesses.json](results/witnesses.json) contains a longest shortest recovery witness for each displayed phase. [negative-controls.json](results/negative-controls.json) contains TLC counterexamples for four deliberately broken variants.

The variants publish a stale review error, dispatch review before readiness and approval, write stock while checking products, and clear the saved fact after a check failure. The runner fails unless each variant violates its expected observer. Those controls also protect against accidentally encoding an invariant as a transition guard that silently removes the failing execution.

The complete DOT graph, TLC logs, and optional compressed adjacency file remain in the run's output directory. Published files are compact projections derived only after successful exploration. TLC uses fingerprints to identify states and reports collision estimates in its raw log. The runner pins the checker bytes and records source hashes so another engineer can reproduce the result.

Model the Domain drove the explicit transition system. Prove It Works drove the independent graph checks, negative controls, and separate tests against the real workbench.

The commands and prerequisites are in [RUNNING.md](RUNNING.md).
