# CR-02: Medicine smart defaults

Implemented for Visits → Prescription → medicine selection.

## Behavior

- Removed the fixed 5-day duration and quantity from inventory selection and newly created drugs. The explicit **5d** shortcut remains a doctor-selected preset.
- `GET /prescriptions/drugs/:drugId/regimen-defaults` uses the authenticated user's ID and branch. It does not accept a caller-supplied doctor identity.
- Uses saved prescriptions created in the preceding 12 calendar months, excluding the current visit. At least three prescriptions for this medicine by the signed-in doctor selects that doctor's history; otherwise uses the branch's history.
- Computes each field's most common nonblank value; ties use the most recent prescription. Duration and unit vote together; the displayed frequency pattern and its underlying frequency stay together. Duplicate medicine rows count once per prescription. Invalid legacy JSON is skipped.
- Catalog IDs identify new prescription items. Legacy items use exact names, case- and whitespace-insensitive, including explicitly linked inventory-item names. Different strengths or partial/fuzzy matches are not pooled.
- History is paged in batches of 500 without a recent-N sample or cap. The new prescription creation-date index supports the time filter. The response includes only the regimen, source and count, with no patient records.
- With no matching history, uses optional inventory defaults. With neither history nor defaults, fields stay empty. When several active items are linked to one catalog medicine, each configured field comes from the most recently updated item supplying that field (ID breaks timestamp ties). Blank fields in existing history do not fall back to inventory.
- **Default duration / unit, frequency, when, instructions** are available in Add Inventory Item and Edit product details. They can be cleared; changes through product details use the existing optimistic revision check and audit log.
- Each suggested field has **Suggested · Accept** and a source tooltip. Editing or accepting protects that field. Previously entered values—including deliberately cleared fields—are protected. Untouched suggestions are replaced or cleared when changing medicines.
- Requests are associated with a selection token on the row and the current patient/doctor/visit context. Late responses cannot populate a replaced or removed row. Failures leave fields editable with a retry instruction.
- Duration inputs retain a readable width; the table scrolls horizontally in narrow panels.

## Validation

The initial component regression tests failed with **actual 5** for both an empty duration and a doctor-entered 3-week duration. Both now pass.

- 69 frontend tests passed across medicine defaults (10), search, stock, diagnosis autopilot, clinical saving, inventory default editing, inventory creation and inventory batch views. Re-ran all 10 picker-default tests after the layout adjustment.
- 37 backend tests passed across regimen voting (12), inventory-default persistence/validation, inventory batch editing, drug search and prescription print names.
- Backend build passed; frontend production-source TypeScript check passed.
- Applied the migration to an isolated local PostgreSQL database initialized with the previous schema. Synthetic SQL checks verified cutoff dates, doctor/clinic selection, branch isolation, current-visit exclusion, and inventory defaults through create/read/clear. Test records were rolled back. No production data was changed.
- Chromium synthetic browser checks passed all four requested acceptance cases: Fucibet 10 days, a typed 3 weeks preserved, a never-prescribed medicine blank, and two medicines with independent 10-/14-day suggestions. No uncaught browser errors. Checked control widths at desktop and mobile sizes.
- Screenshot: `output/cr02-regimen/medicine-suggestions.png`; browser report: `output/cr02-regimen/browser-report.json`.
- Reproducible synthetic harnesses: `scripts/diagnostics/cr02-regimen-browser.cjs` and `scripts/diagnostics/cr02-regimen-db.cjs` (the latter is pinned to the isolated local test database).

## Existing check limitations

The wider prescription-print test file has seven failures expecting a `Numeric dosage for …` input that the current table does not render; these are outside this change. Full-project TypeScript checks also have existing errors in unrelated test files and backend modules (including missing app module imports and outdated enum usage). No CR-02 production-source TypeScript errors were reported. The design detector reported three existing findings outside the changed table (two template accent borders and the intentional print alignment grid).

## Release validation (isolated CR-02 branch)

The production release is based on deployed commit `436e4cadb1eadc106d043cc45ba19000cc2ed042` and excludes unrelated local changes. Its targeted checks passed: 49 frontend tests, 34 backend tests, both production builds, synthetic PostgreSQL service checks, and all four browser acceptance cases plus responsive control widths.

## Migrations and rollout

Run the normal `prisma migrate deploy` during backend startup, before the new backend accepts requests:

1. `20260927120000_medicine_regimen_defaults`: five nullable inventory columns, no populated defaults or existing-row rewrite. Its transaction uses a 3-second lock timeout and a 15-second statement timeout.
2. `20260927120100_prescription_history_date_index`: creation-date index built concurrently outside a transaction.

Both files have explicit `.gitignore` exceptions. The isolated local rehearsal starts from the deployed schema and migration metadata with synthetic inventory data. Both migrations succeeded; old values were unchanged, new defaults were NULL, the index was valid, and a second deploy was a no-op. No production clinical data was copied locally.

Deploy backend first, verify migrations/health, then deploy frontend. The previous application remains compatible with the additive columns/index, allowing application rollback without removing data. A Railway-native PostgreSQL snapshot named `Pre-CR02-smart-defaults-2026-09-27` was created before rollout (backup ID `707a8006-86e5-4ca1-a56c-bd8dc653d650`). Production rollout results are recorded separately.

Optional usual-regimen text inside the search dropdown was not added.
