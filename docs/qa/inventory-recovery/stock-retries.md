# Stock operation recovery

Direct movements and adjustments require a stable `operationId`. Bulk movements also require a distinct `rowId` for every submitted row. Keep those IDs when retrying, including after a timeout. Reordering or retrying a subset of bulk rows is supported. An existing ID with changed input returns a conflict before any new stock effect.

`GET /inventory/operations/:operationId` returns the branch-scoped submitted rows and committed movements. A missing movement is `UNKNOWN`. It does not prove that the request failed. Retry unchanged input with the same IDs to resolve the outcome safely.

The submission manifest records row identities and fingerprints. The stock movement stores its retry identity in the same serializable transaction as its balance change. A unique constraint prevents two concurrent attempts from committing the same row. A losing transaction rolls back before reading the winner.

Shelf cycle-count corrections keep unconfirmed request details and IDs, disable edits during recovery, and retry only unconfirmed rows. A malformed success response remains unconfirmed. Persisted pharmacy-agent action IDs supply the stock operation ID for agent adjustments.

## Validation

- Before the fix, replaying a +2 adjustment changed 100 to 104 and returned a different movement ID.
- After the fix, the same replay returns the original movement and leaves 102 units.
- Nine PostgreSQL checks cover replay, concurrency, conflicting input, partial bulk success, filtered/reordered retry, duplicate row IDs, rollback after receipt failure, branch scope and missing IDs.
- Seventy-six nearby service/controller/agent tests and two shelf component tests pass.
- The browser harness verifies actual shelf controls at desktop and mobile widths with synthetic responses. It covers lost-response retry and no page overflow. Browser fixture evidence is separate from persisted-state evidence.
- Backend diagnostic comparison reports 155 pre-existing diagnostics and no added diagnostics. Frontend production TypeScript passes.

Run the database proof against a disposable local database after applying the migration and generating a private Prisma client:

```sh
RECOVERY_DATABASE_URL=postgresql://recovery_test@127.0.0.1:55461/clinic_recovery RECOVERY_PRISMA_CLIENT=/tmp/clinic-recovery-stock-client node scripts/diagnostics/inventory-movement-recovery-db.cjs
node frontend/scripts/verify-stock-recovery.cjs
```

The browser harness uses Chrome after Obscura could not drive React inputs reliably. Contract format and discovery checks pass for affected TypeScript and TSX declarations. The checker does not support CJS, so the local-only harness contracts were inspected manually.

## Rollout

Apply the additive stock-operation migration before the matching backend and frontend release. Unkeyed API writes are rejected. Refresh older browser clients after release. Existing movement rows retain their history and are not assigned invented retry identities. Old unkeyed requests with uncertain outcomes still require reconciliation.
