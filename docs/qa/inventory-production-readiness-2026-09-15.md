# Inventory readiness fixes and database impact — 15 September 2026

**Deployment follow-up:** The release was subsequently deployed and migrated on 15 September. See the [production deployment verification](inventory-production-deployment-2026-09-15.md). The assessment below records the earlier predeployment state.

The three blockers identified in the [14 September assessment](inventory-production-readiness-2026-09-14.md) have been addressed: explicit stock-unit precedence, live Railway deployment health-check settings, and a fresh backup with an isolated full-data restoration/migration rehearsal. The code remains local and uncommitted; no application deployment or production migration was performed. This is predeployment evidence, not a claim that a new Railway release has already passed its deployment checks.

## What changed

- The invoice stock mapper now uses a recognized explicit stock unit before interpreting pack contents. `Pack + 30ML` stores `PACKS`; it no longer becomes `BOTTLES`. The same precedence covers Tube, Vial, Ampoule, Syringe, Box, Kit, Bottle, Strip and individual units. Paid/free quantities are not rescaled. Existing batches with an incompatible unit remain blocked rather than silently relabelled.
- Added `purchase-declared-stock-unit-precedence`, owned by `nareshshah139`, and linked it to **INV-17.5**. The existing 42 features, 211 criterion texts, baseline contract IDs, ownership and obligations remain intact.
- Configured the actual production Railway service settings: backend `/health`, frontend `/login`, both with a 300-second timeout. The frontend login route is public and returns 200 directly. No inactive TOML file was treated as evidence of an applied setting. Readback confirms both settings, unchanged deployment IDs, and live endpoint responses of 200.
- Created Railway snapshot **Pre-inventory-workflow-2026-09-15**, ID `96bab26b-a138-44e7-b640-84b8019d51a1`, at **15 September 2026 04:28:10 UTC** (09:58 IST). Railway reports no expiry. Existing backups were retained; no recurring backup schedule was added.

Railway applies these health gates to the next deployment and does not continuously monitor a running service through them. Backend `/health` is a startup/liveness endpoint; it is not an OCR-provider or ongoing database readiness probe. See [Railway health-check behavior](https://docs.railway.com/deployments/healthchecks). The next release must still pass its build/start health gate and deployment smoke checks.

## Fresh original-photo proof

The original Eucerin JPEG was uploaded again through the built UI and full built backend into a fresh isolated branch, using the real OCR provider. OCR took 89 seconds and returned two expected lines and net **45,602**. Manufacturer remained blank. Commercial payment terms and physical packaging were explicitly reviewed as local test choices, not inferred as verified supplier terms.

The same screen saved the supplier, created the two cosmetic catalog fixtures, saved/processed the bill, and performed explicit review and stock commitment:

| Batch | Paid | Free | Saved inventory |
|---|---:|---:|---|
| B43140712HT | 6 | 3 | **9 PACKS** |
| B51221608WA | 5 | 2 | **7 PACKS** |

The original bytes and SHA-256 matched, rates/MRP/expiry matched the fixture, three repeat-processing calls added no stock, and reloading the saved invoice showed **Stock added**. INV-17.5 now has a targeted pass. The original failing fixture remains preserved; no historical batch was backfilled merely to make the test pass.

The earlier full four-photo evidence remains applicable to the unchanged OCR/UI paths: Folitrax posted 10/2/10 strips, Photostable posted 1/10/9 tubes, and the incomplete SLV page 2 of 2 stayed blocked. Only Eucerin received a fresh OCR/UI run during this follow-up. The incomplete bill still requires the missing page; uncertain terms, supplier details and clinical catalog attributes still require verification.

## What happens to the current database

**No existing production application data has been changed by this work.** Production was accessed read-only for the full backup; all restore and migration writes targeted a newly created database on `127.0.0.1:55443`.

When the candidate backend is eventually deployed, its startup runs `prisma migrate deploy`. The one pending migration, `20260914143000_inventory_workflow`, will:

- Add **9 workflow tables** for documents/events/effects, supplier credits and allocations, settings, intake drafts, mailbox connections and import migrations.
- Add **11 fields** to existing tables, plus indexes and foreign keys. Existing held stock and applied credit start at zero, action version starts at one, and optional links/metadata start empty. Historical signed stock deltas remain null because the migration does not invent a direction for old movements.
- Preserve existing patients, visits, invoices, quantities, payments, supplier records and stored original-document bytes. There are no row updates/deletes, drops, resets, renames or type replacements in the migration.

Deployment alone does not import invoices, add stock, reprocess old drafts or fix old catalog/supplier data. The already committed Folitrax invoice remains committed and must not be recreated under a changed identity. The existing Eucerin draft retains its supplier/catalog review needs. Any existing wrongly labelled stock also remains unchanged; correcting historical inventory would be a separate reviewed action. Future validated invoice processing uses the corrected mapper and writes its invoice/stock/audit records normally.

Schema changes briefly acquire table locks. The restored-copy migration took **683 ms**, but that does not predict timing under concurrent production load. No load/lock rehearsal against the live database was performed.

## Backup and migration verification

A separate full PostgreSQL custom-format logical backup was taken from production under a **read-only repeatable-read exported snapshot**. It was restored only into `inventory_backup_restore_207514a7ca91` on the isolated local PostgreSQL server.

- **72 tables and 270,989 rows** restored identically to that exact source snapshot, using ordered SHA-256 row digests over every column. This includes the existing migration metadata.
- The pending migration applied successfully to the populated restored copy.
- Every pre-existing application column and row remained identical after migration. Migration metadata appropriately gained the new migration record.
- New-column defaults were checked; a second migration invocation reported no pending migrations.

The logical archive is 48,696,166 bytes and remains in a private local directory outside Git, with directory mode 0700 and file mode 0600. Its path/hash are recorded in the local diagnostic manifest. The restore test verifies this logical backup; it does **not** claim to have restored Railway's separate physical-volume snapshot. Production was never a restore target.

## Validation and release boundary

- The new stock-commit regressions failed before the fix and pass afterward. **81 focused backend tests pass**, including 11 declared-unit examples and rejection of an incompatible historical batch. The clean inventory-only candidate also passes the same 81 tests and its backend build.
- The frontend was unchanged in this follow-up; its previous clean build and 71 focused UI tests remain the relevant evidence.
- **53 mapped contracts**, 42 features and 211 unchanged criteria pass syntax, discovery, declaration binding and specification-preservation checks. Contract validation alone is not semantic proof of every feature.
- The clean release candidate still excludes unrelated prescription edits. All three mapper call sites were inspected: new-batch creation, existing-batch comparison and receipt-linked billing.
- The active Railway frontend/backend remain the prior `4586a3e` release. A new Linux Railpack build, actual deployment health gate and post-deployment smoke test are still to be performed when the release is deployed. Gmail, supplier-message delivery and clinic-staff usability acceptance retain their previously documented limits.

Evidence: `output/diagnostics/inventory-production-readiness/` contains `unit-fix/unit-fix-proof.json`, `unit-fix/invoice-1-upload.json`, `backup-restore-rehearsal.json`, `railway-backups-after.json`, `railway-readiness-config.json`, `railway-healthcheck-readback.json`, `production-health-after.json`, `contracts-after-fix.json` and regression/build logs. Earlier failure evidence was retained.

![Fresh Eucerin invoice after stock commitment and reload](../../output/diagnostics/inventory-production-readiness/unit-fix/screenshots/eucerin-fixed-stock.png)
