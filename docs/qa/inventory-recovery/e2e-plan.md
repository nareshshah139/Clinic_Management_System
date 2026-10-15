# Recovery end-to-end testing

- [x] Read the Poteto Principles section in full.

1. `how` over the affected subsystem.
2. `architect` for parallel design exploration. Skipping stays as `architect skipped: <reason>`; do not fold the design decision silently into implementation.
3. Write the throughput checkpoint as four todo items. A dimension that genuinely does not apply (single file, no fan-out) keeps its item with `n/a: <reason>` rather than being dropped:
   - **Blocking first steps.** Gates run before fan-out.
   - **Independent workstreams.** Disjoint files, services, or layers parallelize. Shared writes serialize.
   - **Shared mutable state.** Default to splitting the target (the **separate-before-serializing-shared-state** principle skill). Serialize only for real invariants.
   - **Smallest safe decomposition.** If one worker is best, name why.
4. Delegate code-writing to a subagent using your configured feature model (default the configured fast profile) with a specific scope (file paths, named data shape and its organizing structure per **principle-model-the-domain** — a state machine over scattered booleans, a table/registry over branching, a typed model over repeated shape assumptions, chosen before the delegate writes logic — and success criteria); review its diff yourself. When the implementation admits multiple valid shapes (error handling, abstraction layer, test structure), delegate via the **arena** skill instead so the runners surface the alternatives and the cross-judge guards the pick. Mandatory: no skip-with-reason escape, and Laziness Protocol does not override it (the gain is review separation, not lines saved). You can spawn a subagent even though you are one; "the app is small" and "a subagent cannot spawn one" are both wrong. A subagent forbidden to spawn satisfies this by owning the diff directly with the same review separation; no "standing by" reply that waits on a nested agent. Comments per **Comments**. Surgical edits, re-ground against the source for upstream-derived files. Port shared-primitive improvements to all consumers and verify each. Commit liberally.
5. Verify on the matching surface. "Inconclusive" or wrong-surface is not a pass; flag it.
6. Rebase into small, ordered commits; stack follow-ups.
   Use the **sequence-verifiable-units** principle skill, building, verifying, and committing each small unit before the next.
7. If the design is contested, `interrogate` before shipping.
8. Run **Opening a PR**.


## Task checklist

- [x] Trace current browser fixtures, HTTP handlers, database proof and CI.
- [x] Compare two independent designs and cross-judge.
- [x] Implement real HTTP and PostgreSQL recovery scenarios with one command.
- [x] Capture desktop and mobile screenshots of failure and recovered states.
- [x] Integrate scenarios and screenshots into the testing process.
- [x] Parent-run verification, independent review and evidence.
- [ ] Publish PR. GitHub rejected the workflow file because the configured token lacks `workflow` scope; SSH authentication is unavailable. The user has been asked about authorization.

## Throughput checkpoint

- Blocking first steps. Trace the fixture and backend boundaries before selecting the runner.
- Independent workstreams. Read-only design alternatives can share the checkout. One owner writes the coupled test runner.
- Shared mutable state. Parent owns branches, package scripts, CI integration, authoritative runs and the decision trail. No shared Prisma client generation.
- Smallest safe decomposition. A single owner keeps backend fixture lifecycle and browser assertions coherent; parent integrates CI after the command works.

Exact Poteto profiles are unavailable. Generic agents inherit the parent model and read the portable persona. Model diversity is unverified. No deployment or production data is in scope.

## Selected design

Candidate A won the independent rubric 9/10 against B at 7/10. The runner imports production Auth, Inventory, Users and Reports modules, including Inventory's Pharmacy module. It preserves production HTTP guards, interceptors, validation and PrismaService. This is focused feature E2E coverage. Full AppModule startup and deployment wiring remain outside its scope.

The implementation uses real mounted pages, actual cookie login, synthetic PostgreSQL data, and literal balance and movement assertions. A private generated client and sanitized frontend source tree prevent writes into shared dependencies and loading local environment files. Cron registration is omitted. The stock component has no production route, so direct and bulk stock tests produce explicitly labeled HTTP/database evidence.

Grafts from candidate B are the initial partner partial commit, the complete stock arithmetic sequence and domain replay with a changed transport idempotency key. A dropped response occurs only after the real upstream success and a database assertion. The import failure occurs on its row success marker, proving rollback of preceding catalogue and stock writes.

One registry determines required scenarios, result rows and screenshots. The command is `RECOVERY_E2E_DATABASE_URL=<disposable loopback PostgreSQL URL> npm run test:recovery:e2e`. Each invocation owns its schema, processes, private runtime and output directory. Missing prerequisites or incomplete coverage fail the command. CI uploads its evidence even on failure.
