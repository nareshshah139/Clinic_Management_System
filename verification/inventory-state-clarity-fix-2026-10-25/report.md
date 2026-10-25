# Inventory state explanations and safe recovery

All 47 families from the preceding state audit now have a documented explanation and a reachable UI action or an explicit authority/evidence handoff. The UI distinguishes what happened, what is known about stock, and what the user can do next. Unknown outcomes remain unknown until authoritative evidence resolves them. The build, full local test suites, browser regressions, and executable models pass with the limits below.

Production source commit: `beb627c7529808acc7ba8a17dc3f4b729b0c2624`, on `codex/inventory-ui-recovery`. The work is committed locally. No new database migration is required. Existing import-recovery migrations remain covered by the browser harness and database tests. Nothing was pushed, merged, or deployed in this task.

## Changes and coverage

The root cause was the conflation of a document's business status with the client's knowledge of the write outcome. A failed response could leave a locally displayed DRAFT even after a stock-changing transaction committed. That produced a false “no stock change” explanation and an enabled mutation control.

`DocumentKnowledge` now separates new, loading, known, failed-load, and unconfirmed states. A durable recovery envelope records the exact request key, saved record, expected revision, and pending operation before dispatch. If persistence fails, the write does not start. Corrupt or legacy recovery information stays blocked with a reference-bearing handoff. Failed existing-record and source-invoice reads cannot become blank editable documents.

**Check saved status**, **Retry loading**, and **Reload saved record** operate on authoritative records. An unchanged revision after a lost response is insufficient evidence because the original transaction may still be running. An authorized status check can fence that revision: the server atomically advances it and records `RESOLVE_OUTCOME`, without changing stock. A delayed stock-changing transition using the earlier revision can no longer commit. If the original transaction won first, recovery returns its actual committed history. Audit failure rolls back the fence. This fence covers revision-guarded edits and stock transitions; it does not cancel no-stock child creation such as RECOUNT, whose replay is separately idempotent.

Status explanations now cover all seven COUNT statuses, partial receipts, SENT orders, partially reviewed target levels, approved quotation/shortbook conversions, and cancellation with already received stock. Rejection reasons use the recorded event detail. Corrections and released holds no longer advertise unsupported reversals. Guards explain the rejected attempt's stock effect separately from prior stock history and identify the actual batch, source, or blocking document.

Ledger explanations distinguish missing checkpoints, missing movement history, unknown deltas, discrepancies, and agreement. Looking at the ledger changes no stock; agreement is not a new physical observation. Permission retries reload capabilities and discard stale grants. Read-only users receive the required authority and exact reference for a handoff. Count recovery requires truthful observations; it never instructs a user to fabricate a count or force-release held stock.

OCR guidance distinguishes wrong documents from incomplete pages, names the upload control that actually exists, and preserves confirmed no-stock-written evidence. Linked receipts say **Post bill**, explain that goods were already received, and do not imply a second stock receipt. Historical uncertainty exposes **Counts & audit**, retains the exact reference, and separates physical stock reconciliation from supplier accounting.

[State-by-state coverage](state-coverage.tsv) maps every original audit family to its resolution and recovery. [The original state matrix](before-state-matrix.tsv) is retained. Additional cases found during independent review are covered by the editor, permission, API-boundary, and database regressions.

## Final state graphs

- [Client knowledge and write recovery](state-knowledge.svg), with [PNG](state-knowledge.png) and [DOT](state-knowledge.dot).
- [Inventory count and reconciliation](inventory-recovery.svg), with [PNG](inventory-recovery.png) and [DOT](inventory-recovery.dot).
- [OCR recovery and rejection](ocr-recovery.svg), with [PNG](ocr-recovery.png) and [DOT](ocr-recovery.dot).
- [Intake evidence, legacy imports, and missing invoices](intake-recovery-gaps.svg), with [PNG](intake-recovery-gaps.png) and [DOT](intake-recovery-gaps.dot).

## Executable proof obligations

The [production presentation checker](check_presentations.cjs) executes the real presentation helper through TypeScript. It checks 18,900 cases: 15 workflow kinds, 15 statuses, four permission profiles, three stock-effect fixtures, and seven knowledge contexts. All 13,500 uncertain cases prohibit edits/mutations, retain unknown stock effects, and expose a status check or handoff. Every case contains event, stock, and recovery explanations. The cross-product deliberately includes impossible kind/status pairs to verify conservative rejection; it does not declare those pairs backend-reachable.

The [knowledge checker](check_knowledge.py) verifies this finite truth-table relation with SMT and checks recovery reachability over 22 abstract knowledge states. Its second SMT obligation proves that, for positive integer revisions with current revision at least the expected revision, resolution leaves the current revision strictly greater than the pending write's revision. Database tests verify both competing transaction schedules and rollback behavior. [Results](knowledge-results.json) and [UI/test bindings](edge-bindings.tsv) make the abstraction boundary explicit.

The [stock and intake checker](check_model.py) enumerates 7,630 bounded stock states under full team authority and checks `AG EF reconciled`: every modeled state has a path to reconciliation. It covers all seven COUNT statuses at quantity bound 0–3. Six integer SMT obligations establish movement safety, count convergence, held-stock disposition followed by counting, compensation safety, checkpoint agreement, and preservation of unknown historical gaps. Missing authority, physical evidence, source capacity, or service availability intentionally yields counterexamples.

The intake witness graph has 33 states and checks recovery or safe rejection, including wrong documents, incomplete pages, duplicate/stale drafts versus committed invoices, linked receipts, historical holds, legacy imports, and missing links. Its evidence partition checks 30 combinations. Rejecting an intake can still leave physical stock unverified; the UI connects that outcome to the separate count/audit flow.

Across both checkers, eight SMT obligations return UNSAT and 21 destructive mutations are detected: four stock-graph mutations, nine intake-graph mutations, four evidence-partition mutations, and four knowledge/presentation mutations. [Model results](model-results.json), the `.smt2` files, and the source fingerprints are included.

These are bounded reachability checks and source-derived invariants, not whole-program refinement or proof of human comprehension. They establish a safe available route under stated assumptions, not `AF` eventual success. Completing recovery requires appropriate authority, retained exact references, truthful physical evidence, and an available service interval. A handoff does not itself change stock. A count creates a verified baseline; it cannot reconstruct unknown historical movements. OCR factual accuracy and arbitrary concurrent executions are not proved.

## Verification

- Full build: PASS, including shared types, frontend production build, backend typecheck, and compilation of 268 backend files. [Build output](full-build.txt).
- Full frontend suite: **638 passed**, 65 suites, zero failures/skips. [Summary](frontend-test-summary.txt) and [suite inventory](frontend-suites.tsv).
- Full backend suite: **941 passed, 3 skipped**, 87 passing suites and one skipped suite, zero failures. All eight local database test gates were enabled against disposable PostgreSQL. [Summary](backend-test-summary.txt) and [suite inventory](backend-suites.tsv).
- Browser regressions: **29 assertions passed**, 18 desktop/mobile screenshots, no page errors. Desktop interactions were exercised; mobile screenshots do not establish separate mobile interaction coverage. Expected negative API responses appear in console diagnostics. [New recovery run](browser-green/result.json) and [prior regression run](browser-prior-regressions/result.json).
- Code contracts: **36 format/discovery checks passed** using the installed `node_modules/.bin/cc-check`. CJS contract comments were reviewed manually because that syntax is unsupported by the checker. [Results](contract-results.json).
- Independent review: PASS, no blocking findings. [Review record](independent-review.md).

The three skipped backend tests are: real Codex OAuth invoice-pixel extraction; the supplied-signature browser/print/PDF/WhatsApp/Email flow; and the Chromium prescription download workflow. Their external credentials, supplied assets, or separately gated browser setup were not exercised. This task does not claim live OCR-provider or messaging validation.

The exact browser failure before the fix was:

```text
stock: AssertionError [ERR_ASSERTION]: unknown result never claims no stock change

true !== false
```

The real loss had already changed stock from 5 to 4 while the UI showed “Draft • no stock change” and enabled posting. [Baseline result](browser-red.json) preserves that evidence. The passing scenario now verifies unknown stock effect, blocked mutations, an enabled status check once retries settle, and recovery without a duplicate loss. Final suite output includes:

```text
Tests:       638 passed, 638 total
Tests:       3 skipped, 941 passed, 944 total
```

The focused browser run began before the final source commits and records its earlier HEAD plus a dirty worktree. The prior regression run records `beb627c` plus verification-only dirtiness. These metadata are preserved unmodified. [Source fingerprints](source-baseline.json) identify the delivered source; all 33 matched after the full runs. Obscura setup had timed out, so both passing runs used the disclosed Chrome fallback with local synthetic fixtures and production modules.

## Reproduce

From the repository root, with installed workspace dependencies, Graphviz, Python with `z3-solver`, and a disposable loopback PostgreSQL database:

```sh
npm run build
npm run test --workspace=frontend -- --runInBand
export CLARITY_TEST_DB='postgresql://USER@127.0.0.1:PORT/postgres'
PURCHASE_DELEGATION_TEST_DATABASE_URL="$CLARITY_TEST_DB" \
PURCHASE_AUTOMATION_TEST_DATABASE_URL="$CLARITY_TEST_DB" \
INVENTORY_READ_TEST_DATABASE_URL="$CLARITY_TEST_DB" \
OPENING_IMPORT_TEST_DATABASE_URL="$CLARITY_TEST_DB" \
PAYMENT_RECOVERY_TEST_DATABASE_URL="$CLARITY_TEST_DB" \
PARTNER_RECOVERY_TEST_DATABASE_URL="$CLARITY_TEST_DB" \
VISIT_LIFECYCLE_TEST_DATABASE_URL="$CLARITY_TEST_DB" \
INVENTORY_WORKFLOW_RECOVERY_TEST_DATABASE_URL="$CLARITY_TEST_DB" \
npm run test --workspace=backend -- --runInBand
node verification/inventory-state-clarity-fix-2026-10-25/check_presentations.cjs
python3 verification/inventory-state-clarity-fix-2026-10-25/check_knowledge.py
python3 verification/inventory-state-clarity-fix-2026-10-25/check_model.py
RECOVERY_E2E_DATABASE_URL="$CLARITY_TEST_DB" node verification/inventory-state-clarity-fix-2026-10-25/check_browser.cjs --chromium
RECOVERY_E2E_DATABASE_URL="$CLARITY_TEST_DB" node verification/inventory-state-clarity-fix-2026-10-25/check_prior_browser.cjs --chromium
```

The recorded proof runs used `/tmp/reconciliation-ui-proof-venv/bin/python` with Z3 5.3.1. The browser adapter defaults to Obscura; `--chromium` selects the fallback. Set `RECOVERY_E2E_BROWSER_EXECUTABLE` when the installed Chromium path differs. The runner owns and removes its isolated schema and processes.

## Decisions and principles

**Model the Domain** drove the explicit knowledge union, distinct from document status. **Make Operations Idempotent** drove exact request-key retention and revision fencing without automatic stock-transition replay. **Experience First** drove real control labels and reference-bearing handoffs. **Build the Lever** drove the rerunnable production presentation matrix and generated graphs. **Test Behavior, Not Implementation** drove mounted control tests, HTTP authorization tests, PostgreSQL races, and browser assertions against actual committed stock. **Prove It Works** required the same-surface red-to-green evidence and explicit proof limits. **Sequence Verifiable Units** placed failing tests in commits before the fixes. **Laziness Protocol** kept the change within the existing editor and avoided a broad reducer rewrite.

The `deslop` skill was absent; its cleanup checks were applied manually. The [decision trail](decisions.tsv), [completed plan](plan.md), and source/test commits retain the implementation and review sequence.
