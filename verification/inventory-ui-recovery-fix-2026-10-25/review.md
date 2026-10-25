# Review record

Independent reviewers used inherited model settings. No model-diversity claim.

## Semantic review

The first review found two P2 defects. A malformed attempt plus an invoice skipped readback and left fresh intake unlocked. An automatic retry could persist a new attempt with the preceding operator/source metadata before a React effect corrected it. Both failed in [review-red.txt](review-red.txt), were corrected, and passed in [review-green.txt](review-green.txt). Independent source re-review found no remaining actionable issue.

Backend review found no actionable issue in permissions, authenticated audit identity, immutable ownership, branch attribution, row/branch locks, or terminal replay. Database regressions cover concurrency, admission ordering and rollback. The final re-review did not rerun suites; the parent ran the final build, frontend suite and browser checks.

## Formal review

The initial graph merged incompatible delegated outcomes. Its EF witness could select no-stock success even for missing historical evidence. The reviewer then authored a correction with six evidence states, a 30-case outcome table, and unsafe-rule mutations. The parent reviewed that correction against the backend invoice/noHistoricalWrite/status decision rule. [check_model.py](check_model.py) and [model-results.json](model-results.json) contain the corrected model and successful results. This is conditional abstract verification with sampled runtime correspondence, not whole-program refinement.

## Comment and contract review

The added contract blocks satisfy the public @cc exception. No added suppression or actionable narration was found. The final two contract edits correctly describe malformed invoice readback and atomic retry-reference persistence. cc-check format/list passed for 11 files; CJS annotations were inspected manually.

## Evidence and trail audit

Independent final review matched the report to the build, 563 frontend tests, 845 backend tests with 78 skips, 20 browser assertions, 12 responsive captures, 24 intake states, 30 evidence cases, 17 mutation checks, and six UNSAT obligations. All report links resolved. It requested two trail corrections: a resolvable Obscura fallback record and a concrete pointer superseding the initial proof-review row. Both were appended to decisions.tsv. [Obscura setup failure](obscura-setup-failure.json) records the 30-second Runtime.callFunctionOn timeout. The parent verified the appended paths.
