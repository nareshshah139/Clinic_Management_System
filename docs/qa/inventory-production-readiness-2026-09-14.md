# Four supplied invoices: production-readiness assessment

Historical assessment. The identified fixes and full backup/migration verification are recorded in the [15 September follow-up](inventory-production-readiness-2026-09-15.md). The findings below describe the original failed candidate and are retained as evidence.

**Decision: do not deploy yet.** The three complete invoices reached stock commitment through the actual UI, and the incomplete invoice stayed blocked. A separate declared-unit check found a reproducible stock-unit defect. Railway also lacks deployment health checks and a recent database backup.

Assessment date: 14 September 2026. Candidate: HEAD `4586a3e2991edf66b7d2d1105edc81b835710798` plus 68 inventory-related working-tree files, isolated from unrelated prescription edits. No application source was changed by this review. No production database records, schema, deployments or settings were changed.

## Invoice results

All four original JPEGs were uploaded using the built inventory UI, the full built Nest backend (including guards, request context and rate limiting), a Reception account with the approved existing Inventory permissions, and isolated PostgreSQL. OCR used the real configured external Codex service; extraction results were not mocked. The application screenshot was excluded.

| Supplied invoice | Fresh OCR | Local UI/database outcome |
|---|---|---|
| Eucerin SB-26-136543 | 2 rows; ₹45,602; 78 seconds | Supplier GSTIN corrected; explicit review posted 9 and 7 units. **Failed stock-unit check:** entered Pack, inventory stored BOTTLES. |
| Folitrax SB-26-110614 | 3 rows; ₹1,698; 85 seconds | Supplier/payment review and medicine catalog details completed in the same screen; posted 10, 2 and 10 strips. |
| SLV SL2627/CA/1258 | 1 visible row; ₹4,104; 60 seconds | Page 2 of 2 only. Saved as OCR_REVIEW_REQUIRED; no stock posted. Direct review and commit requests returned 400. The repair link opened the upload control. |
| Photostable SB-26-149029 | 3 rows; ₹16,435; 89 seconds | Product/payment/unit review completed in the same screen; posted 1, 10 and 9 tubes in separate batches. |

All nine visible rows matched expected invoice numbers/dates, net totals, batch numbers, paid/free quantities, purchase rates and MRP. The Eucerin and SLV supplier GSTINs were misread and flagged; Folitrax also received an independent-read GSTIN disagreement despite a correct primary read. The incomplete SLV document was explicitly flagged. These images do not support unconditional automatic intake.

For local flow testing only, Cash was selected for ambiguous commercial terms; this does not establish the supplier's actual payment terms. Eucerin Pack and Photostable Tube were explicit test stock-unit choices. Folitrax's missing catalog composition, form and strengths were checked against [Ipca's published product list](https://www.ipca.com/wp-content/pdf/Price-List-of-Scheduled-Products-2022.pdf); category and prescription-required choices were local test catalog settings. Manufacturer stayed blank. Actual clinic staff must verify commercial terms and physical packaging.

## Blocking findings

1. **Explicit stock unit is overridden by pack contents.** `PharmacyPurchaseInvoiceService.mapUnitType`, at `backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts:1858`, concatenates stock unit and pack size, then tests `ml` before `pack`, `tube`, `vial`, etc. Both Eucerin rows retained `packUnitType: Pack` on the invoice but produced `inventory_items.unit: BOTTLES`. The 9/7 quantities and expiry dates remained correct. This can produce incorrect inventory labels and reject later matching receipts on their unit comparison. The mapper predates this change, but the new intake workflow depends on it. Criterion **INV-17.5** now records **FAILED_TARGETED_CHECK**. Fix explicit-unit precedence and rerun the actual commit assertion before release.
2. **Railway deployment health checks are not configured.** The active frontend and backend deployment manifests both have `healthcheckPath: null`. The root `railway.json` service array is not supplying the active deployment settings. Configure backend `/health` and frontend `/` in the actual service configuration and verify the candidate deployment is gated on them.
3. **No current pre-release database backup.** Railway lists its newest database-volume backup at **29 August 2026, 14:24 UTC**, expiring 28 September. Its backup schedule list is empty. Create a fresh pre-release backup and verify restoration into an isolated environment before migration; the schema-only rehearsal below is not a backup-restoration test.

## Checks that passed

- Four original downloads matched uploaded bytes and SHA-256 hashes; uploader and invoice linkage were preserved.
- Three reviewed invoices created exactly eight stock movements. All paid/free quantities, MRP, rates and batch expiry dates matched expectations. No SLV stock movement exists.
- Twelve concurrent/repeated processing attempts, with retries respecting rate-limit responses, did not duplicate stock. All four exact original reuploads reopened their existing invoices through the UI without rerunning OCR or adding stock.
- Reception lacking commit permission received 403. Another branch received 404 for invoice and original-document access.
- Posted outcomes survived reloads and displayed “Stock added”. All four source previews and source-map endpoints worked; selecting invoice number displayed its highlight. The SLV missing-page repair link opened the uploader. Highlights remain OCR estimates, not proof of every field's geometry.
- Clean `npm ci` succeeded in the isolated candidate. Both exact workspace build commands used by Railway succeeded. The full built backend booted against local PostgreSQL. This is a clean macOS/Node build and full-app runtime test, not a newly deployed Linux Railpack image test.
- **69 backend tests and 71 UI tests passed** in the clean candidate.
- All **52 mapped contracts**, **42 features** and **211 unchanged criteria** passed syntax/discovery/traceability checks. This does not override the semantic INV-17.5 failure.

## Production observations, read only

- Both live Railway services report SUCCESS at commit `4586a3e`; backend `/health` and frontend `/login` returned HTTP 200.
- Both use **Railpack at repository root** with workspace build/start commands. The unused frontend Dockerfile's missing standalone output is not a blocker for this active deployment path.
- Startup seeding is off; full boot is enabled; JWT is configured; the frontend proxy points to the backend; the Codex credential directory matches its persistent volume.
- Production has exactly one pending migration, `20260914143000_inventory_workflow`. Applied migration checksums match repository files; none are failed.
- A read-only schema dump was restored locally with migration metadata. The candidate's `prisma migrate deploy` applied successfully; a second invocation reported no pending migrations. Remaining Prisma diff consists only of six pre-existing constraint/index renames. No schema/data diff was applied to production. Earlier populated-sentinel preservation tests remain available separately.
- Production currently has 135 inventory batches, no negative balances, and four retained source files with matching byte lengths. These are observations, not a production reconciliation audit.
- **Folitrax SB-26-110614 is already STOCK_COMMITTED in production.** Reopen/retry the original; do not create another invoice with a changed identity.
- **Eucerin SB-26-136543 is already saved** with an incorrect GSTIN, `36AACCV6142K1ZY`, and reconciliation blockers. Its supplier and catalog details require correction in the existing record. Only the Venkata Sai supplier is currently saved. Existing Eucerin catalog entries contain placeholder strength/category and a Tablet form; the in-page catalog correction path is needed before using those records.
- Gmail is not configured. This review did not exercise live Gmail or supplier-message sending, nor send messages to anyone.

## Evidence and limits

Evidence is under `output/diagnostics/inventory-production-readiness/`: `four-invoice-proof.json`, **`declared-unit-check.json`**, `source-ui-proof.json`, `production-audit.json`, `production-records.json`, `production-backups.json`, `migration-rehearsal.json`, `release-candidate.json`, `contracts.json`, build/test logs and actual UI screenshots.

`four-invoice-proof.json` passes its bounded checks for quantities, retention, blocking, retries and permissions. The additional declared-unit test fails, so the combined release assessment is **NOT READY**. No full historical-data restoration, production-load migration-lock test, fresh production OCR submission or new Railway deployment was performed. No production stock was modified. The current work remains uncommitted; the eventual release must include all intended files and the new migration while excluding unrelated changes.

![Photostable stock result and source highlight](../../output/diagnostics/inventory-production-readiness/screenshots/invoice-4-source.png)

![Incomplete SLV invoice remains blocked](../../output/diagnostics/inventory-production-readiness/screenshots/invoice-3-incomplete-blocked.png)
