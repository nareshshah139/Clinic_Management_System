# Inventory production deployment — 15 September 2026

The verified inventory release is live on [Railway production](https://frontend-production-703e.up.railway.app/dashboard/inventory). Both application services passed their Railpack builds and deployment health gates. The production migration completed, authenticated application checks passed, and the actual page's **Extract Draft** button successfully read the supplied Eucerin photo.

## Release and migration

Application commit: `3e9b37f5c0c98f03a5d6fb201ff77b9e6218f24b` — **Complete inventory workflow and preserve declared invoice stock units**. Unrelated local prescription changes were excluded.

| Service | Active deployment | Status | Health gate |
|---|---|---|---|
| Frontend | `3442093b-6fbe-447b-9ab7-b43861425b81` | SUCCESS | `/login`, 300 seconds |
| Backend | `3a1c949e-2328-4b4a-bdb2-f97b4374177d` | SUCCESS | `/health`, 300 seconds |

Backend startup applied `20260914143000_inventory_workflow` at **05:03:38 UTC / 10:33:38 IST**. The database now has 22 successfully applied migrations, including this migration with checksum `c21f0ff724d2b1f05ee6b080b23d64e22c1260044c41b289559a97b1b52102b9`. No failed migration remains. Startup seeding was disabled.

The migration added nine workflow tables, eleven fields on existing tables, and associated indexes/foreign keys. It did not reset the database, delete rows, import invoices, recommit stock, relabel historical stock units, or reprocess saved drafts.

## Actual database effects

A read-only snapshot immediately before deployment was compared with production after migration. Every existing application table's old columns matched except two expected startup changes: three existing permission timestamps were refreshed and their audit records were added. Permission definitions and grants were verified unchanged. This is existing `PharmacyAgentService.ensureAgentPermissions` startup behavior, not a data backfill in this migration.

The final comparison after production smoke testing additionally verified:

- All existing invoice, stock, patient, payment, supplier and other business data stayed unchanged. Stock remained **135 batches**, with no negative balances. The aggregate count across declared stock units remained 81; it is not a count of interchangeable pieces.
- All four archived originals retained identical bytes, hashes, metadata and invoice links. Extraction filled previously missing **source-map highlight metadata** on the Eucerin original. No new original or invoice was created.
- Invoice states remained one reconciliation failure, three reviewed invoices and one stock-committed invoice. The existing Eucerin draft still needs review; the posted Folitrax invoice was not committed again.
- Login, startup and extraction added normal audit activity. One new appointment appeared during live clinic operation at **05:13:45 UTC**; every appointment present before deployment remained byte-for-byte identical in its original columns. Deployment tests did not call appointment-writing endpoints.

Production tests used extraction only. The full invoice-to-stock commitment tests were performed against the isolated database before release, as documented in the [readiness assessment](inventory-production-readiness-2026-09-15.md).

## Production checks

Authenticated production checks passed for capabilities, inventory overview/stock/suppliers/settings, replenishment status/targets, Gmail connection status, purchase listing/details/actions, and PDF export. Both linked invoice originals downloaded with matching SHA-256 hashes and working image previews. Anonymous stock access returned 401.

Chrome browser checks verified the loaded posted-invoice state, draft review controls, original images, **Back to list**, purchase register, return to invoice upload, and stock navigation. The completed run reported no browser exceptions or failed API responses. Obscura was attempted first but did not render the authenticated application, so Chrome was used for visual verification.

The real Eucerin photo (`PHOTO-2026-09-11-22-39-16 2.jpg`) produced invoice **SB-26-136543**, two lines and net **₹45,602**. The API extraction verified paid/free quantities 6 + 3 and 5 + 2, with batches B43140712HT and B51221608WA. The existing archived photo was reused. The **Extract Draft** button then completed in **81 seconds** and displayed the original with its invoice-number highlight. Uncertain bill terms and supplier GSTIN remained review flags; no stock was added by this check.

### OCR connection observation

The first frontend-proxied extraction encountered `ECONNRESET` and returned HTTP 500, although the backend completed extraction afterward. A direct backend probe then returned 201 in 87 seconds, a repeat through the frontend returned 201 in 82 seconds, and the actual browser button returned 201 in 81 seconds. The running frontend's effective proxy timeout was inspected over Railway SSH and confirmed as **300,000 ms**. No configuration change was made on the basis of the single non-reproducing reset. These successful checks establish current operation; they do not establish a long-run provider or network reliability rate.

## Backup and boundaries

The predeployment Railway snapshot **Pre-inventory-workflow-2026-09-15**, ID `96bab26b-a138-44e7-b640-84b8019d51a1`, was created before migration and retained without an expiry. The separate full logical backup was restored into an isolated local database, where all 72 tables and 270,989 rows matched the backup snapshot and the migration succeeded. Production was never restored or reset. See the readiness assessment for the restoration evidence and storage details.

Railway health gates check deployment startup, not continuous service health. See [Railway health-check behavior](https://docs.railway.com/deployments/healthchecks). The four supplied photos' full local acceptance evidence remains in the readiness assessment. Gmail ingestion, outbound supplier delivery and clinic-staff usability acceptance retain the previously documented validation limits; a status endpoint response does not prove an external mail workflow.

## Evidence

Local evidence is under `output/diagnostics/inventory-production-readiness/`:

- `production-release-deployments.json`: deployment IDs, release commit and health settings.
- `production-deploy-integrity-before.json`, `production-deploy-integrity-after.json`, `production-startup-differences.json`: migration and immediate data comparison.
- `production-final-business-integrity.json`: final unchanged invoice/stock/original-byte proof and explained concurrent activity.
- `production-release-smoke.json`: authenticated API, exports, originals and access checks.
- `production-ocr-direct-response.json`, `production-ocr-proxy-response.json`, `production-ocr-smoke.json`: real provider extraction results.
- `production-browser-smoke.json`: actual UI navigation and extraction-button assertions.
- `production-posted-invoice.png`, `production-draft-review.png`, `production-stock-workspace.png`, `production-live-ocr-extraction.png`: visually inspected production screenshots.

![Production extraction with retained original and invoice-number highlight](../../output/diagnostics/inventory-production-readiness/production-live-ocr-extraction.png)
