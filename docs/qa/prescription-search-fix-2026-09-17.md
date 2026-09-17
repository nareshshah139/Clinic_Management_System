# Prescription autocomplete repair — 17 September 2026

Implemented and verified locally. **Production deployment and migration execution were not part of this validation.**

The production prescription autocomplete queried obsolete Drug fields and failed before issuing SQL. The frontend retried that HTTP failure twice and then called another endpoint. The repair removes that failure path and the duplicate fallback requests.

## Behavior

- `/prescriptions/drugs/autocomplete` now receives the authenticated branch from the controller and calls the same typed catalog search as pharmacy. All candidate reads are branch-scoped, active-only and exclude discontinued products. Missing branch context is rejected.
- A type-checked prescription adapter maps stored compositions to `genericName`, `dosageForm` to the legacy `form` field, and `manufacturerName` to `manufacturer`. Current catalog fields remain available to the editor. Absent generic/brand classification is not invented.
- Shared catalog autocomplete ranks before limiting, supports reviewed aliases and bounded spelling suggestions, and limits responses to at most 50 products. Prescription empty queries still return an empty list. The existing shared matcher retains its strength/form safeguards.
- Medication-row search and new-template search each use one endpoint, retain server ranking, and invalidate older responses when the query, selected row or dialog state changes. Old successes and errors cannot overwrite current results or loading state. Queries shorter than two characters clear suggestions immediately. Cleanup invalidates responses; it does not abort already-started HTTP requests. The API client's normal transient-error retries remain unchanged.

This fixes the confirmed medicine-search issue. The separately reported list-search latency still needs its exact UI location and an authenticated trace; no speculative prescription/patient-list indexes were added.

## Validation

Before the fix, the real Prisma regression failed with `Unknown argument genericName`; eight of the ten new UI checks failed, reproducing stale response, fallback and ranking problems.

After the fix:

- **67 backend tests passed** across prescription service/controller, prescription drug search, shared matching and pharmacy drug suites.
- **43 frontend tests passed** across prescription search, stock display, clinical saving, learned suggestions, API retries and pharmacy search.
- Backend Prisma generation and SWC build passed. The new adapter and shared catalog helper passed strict TypeScript checking. Frontend production-source TypeScript checking passed. The repository-wide backend type check was not asserted; the configured backend build uses SWC without full type checking.
- A local copy containing **254,213 drug rows** was tested through the real Prisma client in enforced read-only sessions. Exact/partial names, a misspelling and a no-match query succeeded; separate checks verified branch isolation, limit handling, compatibility fields, empty search and missing-branch rejection.
- The local Nest HTTP route returned **200**, one result, in **89 ms** with a fixture-authenticated request and the real database. This is a warmed local measurement, not a production latency guarantee. The fixture does not change or bypass production authentication.
- Individual indexed candidate queries took **22–30 ms** and used `drugs_search_name_gist`, `drugs_search_ingredient_gist` and `drugs_search_aux_gist`. Complete service calls in the measured sequence took **421, 238, 129 and 122 ms**, respectively. These local timings must not be compared directly with the production-network diagnostic timings.

Before committing, the exact staged source was exported separately from the working tree. It passed **67 backend tests, 22 frontend tests, and frontend production-source TypeScript checking**. This independently verifies the search fix without the unrelated stock-display, autofill, inventory and OCR edits remaining in the workspace.

Reproduce real-schema and HTTP checks:

```sh
LOCAL_DATABASE_URL=postgresql://invoice_review@127.0.0.1:55443/inventory_names_rehearsal_20260916 node scripts/diagnostics/prescription-search-fix.cjs
```

Evidence: `output/diagnostics/prescription-search-2026-09-17/local-fix-proof.json`. The runner accepts local database hosts only, enforces read-only mode and bounds statements to five seconds.

## Release dependencies

This repair integrates the shared product-search work already present in the workspace. Include `backend/src/shared/search/`, the updated pharmacy service, the prescription adapter/controller/service, both UI search changes, and the four existing `20260916100000`–`20260916100300` product-search migrations in the release. The migrations enable `pg_trgm` and create the three concurrent GiST indexes; they were already applied to the local rehearsal database. Production has the extension but lacked these indexes at diagnosis time.

The existing backend startup runs `prisma migrate deploy` before starting the application. Deploy the backend with its migrations before the frontend, because the updated frontend expects a healthy prescription route. Verify authenticated production name, typo and no-match searches and the absence of the old schema error after rollout. Unrelated in-progress workspace changes were preserved.
