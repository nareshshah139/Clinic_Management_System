# Recovery end-to-end tests

Run from the repository root after `npm ci` and `npm run build --workspace=shared-types`:

```bash
RECOVERY_E2E_DATABASE_URL=postgresql://recovery_test:recovery_test@127.0.0.1:5432/clinic_recovery npm run test:recovery:e2e
```

Use Node 22, Chrome or Chromium, and a disposable loopback PostgreSQL 14 database. The database role must be able to create schemas. No optional database extension is required by these scenarios. The default browser path is the standard macOS Chrome location; set `RECOVERY_E2E_BROWSER_EXECUTABLE` for another installation. CI supplies `/usr/bin/google-chrome`. Missing prerequisites fail the command.

The runner creates synthetic data in a unique schema and owns its local application processes, browser profile, generated Prisma client and private frontend runtime. It does not use the ambient `DATABASE_URL` or repository environment files. Cleanup removes only those owned resources. Screenshots and results remain under `output/diagnostics/recovery-e2e/<run-id>/`.

## Scenarios

| Area | Entry point | Required evidence |
| --- | --- | --- |
| Partner sales | Real pharmacy desk | Initial partial commit, corrected batch match, outstanding-only retry and unchanged completed replay |
| Supplier payments | Real purchase ledger | Reallocation and reversal, preserved original allocations, restored invoice balances and one correction after response loss |
| Opening stock | Real opening-import page | Real workbook upload, row failure inside PostgreSQL, failed-row retry, preserved successful rows, outcome recovery and ambiguous legacy reconciliation |
| Direct and bulk stock | Authenticated HTTP APIs | Stable operation and row IDs, lost-response replay, partial/subset/reordered retries, outcome lookup and changed-payload rejection |

Interactions run at desktop width. The runner also captures responsive mobile states; it does not independently execute the journeys at mobile width. Stock screenshots are labeled API/database results because the stock-correction component is not mounted in the current product navigation. The report must not present them as a production screen.

Business responses come from production controllers and services. A forwarding proxy can discard a response only after the upstream has succeeded and the test confirms the committed state. PostgreSQL can reject an import row's success marker to prove its stock and catalogue changes roll back. The assertions check literal persisted balances, movements, allocations and row statuses.

## CI and coverage limits

`.github/workflows/recovery-e2e.yml` runs the same command for every pull request, pushes to main and manual dispatch. It supplies a disposable PostgreSQL service and uploads evidence even when a scenario fails. Incomplete scenario or screenshot coverage must fail the run.

The focused Nest application imports production feature modules and preserves their authentication, authorization, validation, request context, idempotency and Prisma behavior. It omits unrelated scheduled jobs and integrations. This suite does not prove full AppModule startup, Railway deployment wiring or browser-only production failures. Schema setup uses the current Prisma schema; the separate migration tests cover upgrade SQL.

Existing simulated-response browser fixtures remain component checks. Existing service/database tests continue to cover concurrency and other cases beyond these visible recovery journeys.

## Verified run

The parent independently ran the command on Node 22.12.0 against a new PostgreSQL database containing only the default `plpgsql` extension. All four families passed, with 25 persisted-state assertion groups and 26 PNGs. The final local artifact is `output/diagnostics/recovery-e2e/2026-10-15T18-16-02-751Z-708778e4/index.html`; its manifest records the runtime, base revision and dirty-source status. Generated artifacts are not committed.

Additional checks passed: six supplier-payment component tests, frontend production TypeScript, CJS syntax and formatting, and clean workspace installation plus shared-type compilation. Missing and remote database URLs failed before boot. SIGTERM after real startup exited unsuccessfully and left zero owned schemas. Parent visual review covered the recovery checkpoints and the final compact API report.

Independent correctness review found no actionable issue. Comment review removed one redundant ignore-file comment and retained the four observable code contracts. PurchaseLedger contract format and discovery passed. This cc-check version does not support CJS, so runner contracts were reviewed manually. Reviewers inherited the parent model; no cross-model review is claimed.

The E2E run exposed adjacent supplier panels with identical React keys. Distinct supplier-specific keys removed that warning. The final run had no page errors or duplicate-key diagnostics. Expected negative-authentication, injected transport-failure and validation responses remain in the browser diagnostics.

The workflow has been added; hosted execution is reported separately from these local results. No deployment or production-data change is part of this test work.
