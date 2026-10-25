# Inventory rejection recovery

Staff need a next action after a rejected import. This change adds UI recovery for missing invoice links and colleague-owned import attempts. It preserves stock safety checks and original attempt ownership.

## Rejection and recovery paths

| State | UI action | Safe result |
|---|---|---|
| Fresh URL points to a missing invoice | Recover legacy or missing invoice | Exact invoice readback or retained uncertain-history rejection |
| Original operator cannot complete an import | Recover interrupted import, enter the retained reference and reason | Authorized colleague resumes the exact invoice or fences the original attempt |
| Attempt has not registered | Include original operator ID from handoff | Branch-validated attribution and a durable tombstone prevent delayed writes |
| Missing or conflicting historical links | Recover import outcome | RETRY_REJECTED retains UNVERIFIED history and links to physical counting |
| Malformed recovery reference | Correct the input | Client validation prevents dispatch and leaves the input editable |
| Lost recovery response | Retry the same retained attempt | Stable terminal replay preserves the first decision |
| Stale stock count | Start fresh count | Current snapshot and blank observation precede another guarded post |
| Incomplete OCR pages | Complete originals or enter the complete invoice manually | Fresh review precedes stock posting |
| Insufficient permissions | Copy recovery handoff | A colleague must hold the complete read, create and review capabilities |

Inventory guards still reject unsafe stock changes. No software path can establish a truthful physical quantity without evidence, or recover a lost identity without a reliable reference. Authority and service availability remain explicit conditions.

## Architecture and tradeoffs

The durable shape is a branch-scoped import attempt with an immutable original owner. Existing owner-only endpoints retain their scope. The new delegated command has its own permission gate and records the authenticated recovering actor in the audit. Existing ownership comes from persisted state. Attribution for an absent attempt comes from the handoff and must name an operator in the authenticated branch, including an inactive operator. It is supplied attribution, not proof of historical ownership.

The command serializes against purchase admission, locks the attempt row, validates source references, and commits the outcome with its audit. It does not execute OCR or create stock. A saved worker returns its exact invoice. A recovery that wins prevents the delayed worker from creating another invoice. Missing historical evidence remains UNVERIFIED.

Two independent design candidates and an independent cross-judge selected permission-based delegation. The selected design avoids ownership transfer and keeps recovery available when the original operator is absent. Persisted-owner derivation and selectable handoff text came from the second candidate. Manager-only recovery would exclude authorized pharmacists.

Model the Domain separated persisted ownership from supplied absent-attempt attribution. Make Operations Idempotent required stable terminal replay and one audited transaction. Build the Lever reused the rerunnable browser and formal checks. Prove It Works required clicking the mounted controls and reading persisted outcomes. Fix Root Causes kept stock guards and repaired the missing UI entry and ownership handoff.

## Formal verification

The physical-count model retains all seven COUNT statuses and the guarded checkpoint proof. The updated intake model adds direct missing-invoice entry, delegated recovery, and absent-attempt attribution. Six evidence classes separate no historical write, exact draft, exact committed invoice, missing link, conflicting links, and lost originals. Its target is an exact saved outcome, safe no-stock fence, or explicit uncertain-history rejection. That target is separate from a verified physical inventory checkpoint.

The CTL property AG EF means that every modeled state has some finite safe recovery path under the stated conditions. It does not promise automatic eventual completion. The model is a source-mapped witness graph, not a verified extraction of the entire program. Unbounded SMT obligations establish integer stock and ledger implications under their assumptions.

[Physical inventory graph](inventory-recovery.svg). [Updated intake graph](intake-recovery-gaps.svg). [Runnable checker](check_model.py).

## Failing reproduction

The original live browser probe reproduced both failures on f63e24bd113fa296b6694bf4109dcb3e30c0b971. The new regression failed before the fix.

```text
stock: AssertionError [ERR_ASSERTION]: fresh missing-invoice URL exposes unlinked recovery action

false !== true
```

Two focused component regressions also failed before production edits. A strengthened database test caught repeat saved-invoice recovery replacing the first reason and timestamp. The implementation was corrected to preserve its initial audit and result.

## Verification results

- Full root build passed after the final corrections. See [build output](build-output.txt).
- Backend suite passed 845 tests across 79 suites. 78 tests were skipped: 75 tests in six unrelated opt-in database suites, one live OCR-provider test, and two existing skipped signature/PDF cases. The purchase automation and new delegation database suites were enabled against disposable loopback PostgreSQL. See [suite results](suite-results.json).
- Final frontend suite passed all 563 tests across 63 suites with no skips. See [suite results](suite-results.json).
- The focused reconciliation component proof passed 14 tests. The final two handoff regressions and existing malformed-reference case passed 3 targeted tests. See [component results](component-results.json), [review failures](review-red.txt), and [review passing output](review-green.txt).
- Real browser verification passed 20 assertions after real login, authorization checks, and mounted production UI. It covered missing-invoice entry, malformed-reference correction, colleague recovery, uncertain-history rejection, count links, stale-count rejection, and a posted reconciled checkpoint. Stock stayed unchanged throughout intake recovery. See [passing browser evidence](browser-after.json).
- The browser used Chrome after Obscura timed out on CDP Runtime.callFunctionOn. Interactions were desktop-driven; 12 responsive screenshots cover 1280px and 390px widths. Mobile touch behavior, full AppModule startup, and external OCR-provider execution were not verified. No browser page errors occurred; expected negative HTTP probes produced console errors.
- The bounded stock model checked 7,630 states for the authorized-team profile with zero unreachable recovery targets. All 24 intake control states have a safe terminal path for the original operator and an authorized colleague under the recorded conditions. All 30 evidence combinations satisfy their permitted outcome rule. Four stock reachability mutations, nine intake reachability mutations, and four unsafe-outcome mutations were detected. Six unbounded integer SMT obligations returned UNSAT. Restricted-authority, unavailable-service and missing-evidence profiles retain counterexamples. See [model results](model-results.json).
- Contract format/discovery passed for 11 changed source, test and proof files using the repository-local cc-check. CJS annotations were inspected manually. Source fingerprints passed before and after model execution.

Passing counterpart to the original live regression, verbatim from the recorded result:

```json
{"label":"fresh missing-invoice URL exposes unlinked recovery action","expected":true,"actual":true}
```

The proofs establish conditional reachability and safety in the stated model. They do not prove automatic eventual completion, arbitrary lost-identity recovery, or whole-program refinement. A safe rejected intake remains historically UNVERIFIED even after a new physical count establishes a current quantity checkpoint.

## Reproduce

Run the root npm build. Run frontend and backend Jest suites with --runInBand. Set PURCHASE_DELEGATION_TEST_DATABASE_URL to a disposable loopback PostgreSQL server to run purchase-import-delegation.database.spec.ts. Run check_browser.cjs with RECOVERY_E2E_DATABASE_URL pointed at that disposable server. Use --chromium for the Chrome fallback after the recorded Obscura CDP timeout. Run check_model.py in a Python environment with z3-solver==5.3.1.0.

## Scope and review

No production migration is required. Existing recovery migrations provide the fencing protocol. No deployment, push or merge is part of this change. Independent semantic review found and verified two corrections: malformed invoice-backed links remain locked until exact readback, and retries persist the replacement operator/source reference before dispatch. No remaining actionable finding was reported. The independent proof reviewer required evidence-partitioned outcomes; the parent compared that correction to the backend decision rule. Comment review passed with only public @cc contracts added and no suppressions. Generic delegates inherited the parent settings; no model-diversity claim. The unavailable deslop skill was replaced by manual diff cleanup. The CJS contract comments were checked manually because cc-check does not support CJS.

[Independent review record](review.md) and [append-only decision trail](decisions.tsv). Changes are local on `codex/inventory-ui-recovery`.
