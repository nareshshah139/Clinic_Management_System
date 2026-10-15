# Recovery verification

All four recovery units were integrated and checked on 2026-10-15 using synthetic local data. No production records or deployments were changed.

## Behavior

| Area | Recovery | Preserved effects and fallback |
| --- | --- | --- |
| Partner sales | Staff correct an unresolved batch match and retry outstanding quantities | Cumulative committed quantities remain unchanged by matching; held stock is protected. A version conflict requires refreshed state. Malformed acknowledgements remain unconfirmed. |
| Supplier payments | Reverse a payment, or reallocate its unchanged total across the same supplier’s invoices | Original records and allocations remain auditable. Reversal and replacement share one effective instant. Changed request-key reuse conflicts. Correcting an amount requires reversal then a new payment. |
| Opening imports | Retry failed rows using durable per-row outcomes | Successful rows are untouched, including zero-stock rows. Existing-batch metadata imports cannot overwrite a concurrent sale. Ambiguous or malformed legacy evidence requires reconciliation. |
| Direct stock writes | Retain operation and row IDs; query outcomes or retry unchanged input | One committed movement per row, even after lost responses or concurrent retries. Unknown is not proof of failure. Changed payloads under an existing identity conflict. |

## Evidence

- Combined backend run: **130 tests passed in 11 suites**, including real PostgreSQL partner, payment and import tests.
- Combined frontend run: **23 tests passed in four suites**.
- Direct-stock PostgreSQL probe: **nine checks passed**, covering replay, concurrency, partial bulk recovery, rollback, changed input, branch scope and missing IDs.
- All four additive SQL migrations applied to a disposable schema created from catalogue-recovery baseline `daa6527`. Prisma schema comparison returned no differences.
- Frontend production TypeScript passed. Backend comparison against the same baseline and generated client found **155 baseline diagnostics, 151 current diagnostics, zero newly introduced diagnostics**. The full backend type check is therefore not green. Jest behavior checks ran without ts-jest diagnostic gating; the standalone TypeScript comparison was run separately.
- Contract format/discovery checks passed on 36 affected TS/TSX files. Directory-contract format passed and discovery was verified through its child fixture. The checker cannot directly list a `CONTRACTS` file or inspect JS/CJS, so harness contracts also received manual review.
- Actual recovery components passed desktop/mobile browser scenarios with synthetic API responses. Obscura interaction limitations required Chrome fallback. Browser fixtures prove controls and retry payloads; the separate database tests prove persisted effects.

The failing regressions were retained before implementation. Independent reviews found and then accepted fixes for a payment effective-time gap, an importer stock overwrite race, an incomplete partner response guard, and malformed legacy import evidence. No local independent-review findings remain open. Comment review found no deletions or suppressions needed. Reviewers used the inherited model; this was not a cross-model review.

## Repeatable checks

Backend database suites require explicit loopback URLs through `PARTNER_RECOVERY_TEST_DATABASE_URL`, `PAYMENT_RECOVERY_TEST_DATABASE_URL`, and `OPENING_IMPORT_TEST_DATABASE_URL`. They create isolated schemas. Generate a Prisma client from the current schema in an isolated location and map `@prisma/client` to it when dependencies are shared. Partner tests also accept `PARTNER_TEST_PRISMA_CLIENT`.

Run these browser scripts from the repository root after installing dependencies:

```sh
node frontend/scripts/verify-stock-recovery.cjs
node frontend/scripts/verify-supplier-payment-recovery.js --browser=chrome
OPENING_IMPORT_BROWSER=chrome node scripts/verify-opening-import-recovery.cjs
node frontend/scripts/verify-partner-recovery.cjs --chrome
```

The stock database probe is `scripts/diagnostics/inventory-movement-recovery-db.cjs`; supply `RECOVERY_DATABASE_URL` for an isolated localhost `clinic_recovery` database and `RECOVERY_PRISMA_CLIENT` for its generated client. Browser scripts retain local screenshots and summaries in `output/diagnostics/` and remove their temporary routes.

## Rollout and limits

Merge the catalogue-recovery dependency and recovery PR stack in order. Apply migrations before the matching backend/frontend release. Direct-stock writes now require operation IDs, so refresh old clients and update any external callers before release. Do not assign invented identities to historical unkeyed operations.

Legacy imports whose effects cannot be reconstructed remain manual reconciliation cases. Browser-only network failures remain unknown unless an outcome query or unchanged retry confirms them. These changes do not establish that historical failed saves were recovered.

## Published review stack

Merge order: catalogue dependency [#6](https://github.com/nareshshah139/Clinic_Management_System/pull/6), stock retries [#7](https://github.com/nareshshah139/Clinic_Management_System/pull/7), supplier payments [#8](https://github.com/nareshshah139/Clinic_Management_System/pull/8), opening imports [#9](https://github.com/nareshshah139/Clinic_Management_System/pull/9), partner recovery [#10](https://github.com/nareshshah139/Clinic_Management_System/pull/10). The four new PRs are open for review; none is merged or deployed.

Hosted Tenki reviews were still running at handoff. The existing catalogue dependency's GitHub CI failed before frontend tests with `jest: not found` (exit 127), as confirmed in [the CI run](https://github.com/nareshshah139/Clinic_Management_System/actions/runs/38763264358). The workflow installs dependencies separately in each npm workspace; its setup failure is outside these four recovery fixes. Local acceptance results above do not imply green hosted CI. Repair and rerun that CI gate before release.
