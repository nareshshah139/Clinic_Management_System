# Invoice completion and stock posting

The primary invoice action now saves the current fields, reviews the saved invoice, and posts stock. New bills no longer need a separate save before this action becomes available. The final confirmation sits beside **Save & add stock** in a footer that remains reachable while scrolling. **Save draft** keeps unfinished work without changing stock.

Bills linked to an earlier inward receipt use **Save & post bill** and report that no stock was added again. The optional receipt chooser starts collapsed for ordinary bills. Automatic processing remains under **More options**.

## Cause and fix

The former **Save invoice** and **Save corrections** actions called only the draft endpoint. The local browser reproduction returned `DRAFT`, with no review or stock-posting request. The backend intentionally keeps these operations separate.

One private coordinator now owns manual posting for new, editable, and reviewed invoices. It captures the ID returned by saving, checks the saved result, and refreshes that exact record after an uncertain review or commit response. A failed status read blocks further writes. A reviewed invoice resumes at commit. Existing server validation, transactions, receipt handling, and duplicate-stock protection remain in place.

The strict automatic processor is unsuitable for this manual action because it can reject corrected OCR readings below its confidence threshold.

## Original local verification

The following results describe the initial fix before porting it onto the newer production branch. Release verification is recorded separately below.

- The new and saved invoice regressions failed before the change and passed afterward.
- All 71 invoice-editor tests passed. Coverage includes draft-only saves, confirmation reset, stale revisions, exact-ID recovery, failed status refresh, repeated clicks, permissions, and receipt-linked wording.
- All 10 real PostgreSQL purchase tests passed in a disposable local database. These verify actual stock quantities, duplicate retries, concurrent invoices for one batch, and rollback.
- Browser acceptance passed for a new manual bill and a corrected saved bill. Each produced one draft save, one review, one commit, and `STOCK_COMMITTED`.
- The existing inventory acceptance script passed its six checks with no page errors. Scan and draft saving remain stock-neutral. Stock correction approval and expiry correction still work.
- Desktop and 390px phone layouts were inspected. The confirmation checkbox keeps its size, and the expanded options panel stays within the phone viewport.
- The frontend production-source TypeScript check passed. `cc-check format` and `cc-check list` passed for the workbench, with 15 contracts discovered. The checker does not support `.cjs`; the browser script contract was inspected manually and JavaScript syntax checks passed.
- Independent review found no actionable issue in the implementation delta or added comments. The parent reviewed the final incremental changes.

Browser evidence uses synthetic API data and proves UI sequencing and status. The PostgreSQL suite separately proves inventory quantities and transaction behavior. Obscura reproduced the original issue. Its repeated navigation later timed out, so Chrome provided the final acceptance and visual checks.

The browser command writes its results and screenshots to `output/invoice-stock-flow/`.

```text
Before: {"invoiceStatus":"DRAFT","draftSaves":1,"reviewRequests":0,"stockCommitRequests":0}
After:  {"invoiceStatus":"STOCK_COMMITTED","draftSaves":1,"reviewRequests":1,"stockCommitRequests":1}
```

## Reproduce locally

Start the synthetic API and frontend in separate terminals from the repository root.

```sh
node scripts/diagnostics/inventory-simplicity-fixtures.cjs
NEXT_PUBLIC_API_PROXY=http://127.0.0.1:4026 npm run dev --workspace=frontend -- --hostname 127.0.0.1 --port 3126
```

Run the saved-invoice check, then the new-invoice check. Restart the synthetic API before repeating the saved-invoice check. These scripts use isolated Chrome sessions and synthetic authentication.

```sh
node scripts/diagnostics/invoice-stock-flow-browser.cjs
node scripts/diagnostics/invoice-stock-flow-browser.cjs --new
```

The `--before` option records the failing assertion against the original implementation. `--obscura` uses a local Obscura CDP server at port 9224 with `--allow-private-network`.

## Decisions and limits

Fix Root Causes kept the server posting boundary and changed the misleading completion flow. Model the Domain produced a typed posting phase carrying the saved ID. Experience First put confirmation beside completion. Laziness Protocol removed duplicate posting orchestration. Build the Lever produced the rerunnable browser check. Prove It Works required browser and database evidence. Test Behavior, Not Implementation kept assertions on visible status, saved values, and stock effects.

The release is isolated from the original working tree and based on production commit `69c1934`. It preserves the newer catalogue-readiness checks, generation-scoped responses, and authoritative stock readback. The reported live invoice has not been inspected or altered. New invoice creation retains the existing API idempotency behavior.

## Release verification

The release was ported onto production base `69c1934` in an isolated worktree. Application commit: `dcaffcd6e41bf901e21b6ff88632fbb9477b8df5`. A clean dependency install and `npm run build` passed for all three workspaces, including frontend and backend production type checks. All 693 frontend tests passed across 66 suites, including all 142 workbench tests. Contract format and discovery checks passed. The source correspondence record updates only the workbench and its tests; no proof assertion was disabled.

Independent browser checks on this exact application commit reproduced the old draft-only behavior and then confirmed both new and saved invoices reach `STOCK_COMMITTED` with one save, one review and one commit. The checked-in synthetic fixture supplies the same indexed catalogue-readiness shape required by the current UI and a timestamp for authoritative committed readback.

The existing finite-state invoice model passed 27,500 states and 150,745 transitions, with four negative controls. Its five verifier unit tests passed. Inventory presentation, knowledge and recovery checks also passed: 18,900 presentations, 22 knowledge states and the unchanged guarded recovery graph. Generated graph files were unchanged; four generated counterexample lists differed in ordering, so the previous historical model-results artifact is retained.

A pre-existing contract discrepancy remains visible: `reviewed-bill-recovery-ui` requires an operator reason when reopening review, while the current API accepts a saved revision and records `REVIEW_REOPENED` without a reason field. This release preserves both that contract and the existing reopening behavior. Reopening does not post stock.

Independent fault scenarios also passed through the browser: stock-neutral draft saving, receipt-linked posting with zero additional stock, retry after a lost review response, readback after a lost commit response, and blocked writes after a failed readback until status recovery. The reviewer returned PASS+NOTES; the note is the pre-existing reopening-contract mismatch described above.
