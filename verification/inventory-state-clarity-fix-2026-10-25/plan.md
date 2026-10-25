# State clarity fix

- [x] Read Principles in full.

1. Reproduce it yourself on the matching surface via the control skill (Non-negotiables). Don't hand the repro to the user. A debug or instrumentation protocol that says to ask the user does not override this; you drive the instrumented runtime. Ask the user only with a stated, specific reason the control surface cannot reach the target, and only after driving it as far as it goes. Won't reproduce directly, force it: synthesize the trigger, tighten conditions, or instrument until it fires. A bug you can't reproduce, you can't prove fixed.
2. Binary-search the cause. Form the candidate hypotheses, then rule them out until one survives. Seed them with `how` over the affected subsystem and the **why** skill for regression history. Each pass, take the split that cuts the most remaining problem space, get runtime evidence, eliminate. When program state is unclear, add instrumentation or logging and read it as the code runs. Don't guess. Drive a long or stubborn hunt with an authorized Codex thread heartbeat. Confirm the surviving *mechanism* with runtime evidence before the step-3 architect1 fan-out; a design grounded on a plausible-but-unconfirmed cause can be unanimously wrong while the real cause sits one subsystem over.
3. Plan the fix. If it crosses a function boundary, `architect` first. Delegate implementation to a subagent using your configured bug-fix model (default the configured instruction-following profile) with a specific scope; review the diff.
4. Verify on the same surface; the original repro now passes. "Inconclusive" or wrong-surface is not a pass; flag it. Unit tests show branch behavior, not bug absence.
5. Stage the commits so the failing repro lands before the fix in git history; the diff tells the story. See the **tdd** skill for the failing-test-first cadence when the bug has a cheap local test path; skip it when the test would be expensive, integration-heavy, or unclear.
   This is the canonical **sequence-verifiable-units** principle skill, the failing test first and the fix on top.
6. Run **Opening a PR**.


## Task units

- [x] Reproduce baseline diagnostic observations.
- [x] Compare certainty/recovery designs and settle data shape.
- [x] Commit failing behavior regressions, then implement workflow certainty and summaries.
- [x] Fix OCR explanations and controls; fix stock ledger, permissions and guard recovery.
- [x] Verify matching UI surfaces and independent review.
- [x] Update state graphs and executable proofs for all 47 audit families.
- [x] Run full build, frontend and backend suites and contracts.
- [x] Record limits and deliver local changes.

Throughput checkpoint: three independent seams (workflow editor, purchase OCR, stock/permission guards), then integration and proof review. Keep production ownership disjoint; root alone stages commits. All edits are local; Opening a PR external publication is skipped because this request does not authorize a new PR.

Acceptance: every audited family has truthful event/stock-effect copy and a visible action or explicit authority/evidence handoff. Unknown outcomes never authorize another write or assert no stock change. Proofs establish modeled reachability and observable UI invariants, not guaranteed eventual recovery or human comprehension.

Completion: all task units passed. Opening a PR preparation and independent review are complete; external PR publication is skipped because this request is local. No push, merge, or deployment was performed.
