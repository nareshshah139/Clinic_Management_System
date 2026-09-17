# Prescription search diagnosis — 17 September 2026

Follow-up: the confirmed medicine-search issue now has a [locally verified repair](../qa/prescription-search-fix-2026-09-17.md). The production observations below describe the initial read-only investigation; the repair is not deployed.

**Medicine search has a confirmed production defect: an invalid Prisma query is retried three times before a slower fallback runs. The separately reported list-search slowdown is not yet reproduced end to end.** Production records, application code and deployments were not changed. This investigation added only diagnostic runners, private evidence and this report.

Checked production backend commit `14382b2ca6a40d6535b42384feaa41c1f422f919` and frontend commit `bdf2c2b2ada04bd1cee2d74da87dd66d991e7cd8`. The runner loads those committed service implementations, rather than the uncommitted local replacement for pharmacy search.

## Confirmed medicine-search failure

`PrescriptionsService.autocompleteDrugs` at `backend/src/modules/prescriptions/prescriptions.service.ts:856` filters on `genericName` and selects `genericName`, `form`, `manufacturer`, `brandNames` and `isGeneric`. Those fields are absent from the current Drug schema. The current equivalents include `composition1`/`composition2`, `dosageForm` and `manufacturerName`; this needs a deliberate response mapping, not merely renaming one filter.

Invoking the deployed method with the actual generated Prisma client against a read-only production connection failed for every tested query (`dolo`, `isotroin`, and a synthetic no-match term), across four rounds:

> Unknown argument `genericName`. Available options are marked with ?.

Prisma rejects the query before issuing SQL. Production backend logs independently contain the same error: the last 100 lines matching `genericName` included 34 error lines between **14:29:14 and 14:32:11 IST**. These are log-line counts, not deduplicated request counts or an error-rate estimate.

The deployed prescription builder waits 300 ms after typing, calls `/prescriptions/drugs/autocomplete`, and only falls back to `/drugs/autocomplete` when the primary call fails or returns nothing. The real deployed `ApiClient` retries HTTP 500 responses twice. A deterministic local replay using that client and synthetic HTTP responses verified:

| Primary response | Requests before results | Retry waits |
| --- | ---: | ---: |
| Persistent HTTP 500 | 3 primary + 1 fallback | 500 + 1,000 ms minimum |
| Successful response | 1 primary | 0 ms |

Random jitter adds up to 498 ms to those two waits. Thus the broken path adds **1.8–2.298 seconds of typing delay and retry waits**, before counting four HTTP requests and fallback database work. This is a verified delay mechanism, not a measured browser latency percentile. Both the medication row and new-template dialog use this sequence.

The search effects only clear pending debounce timers; they do not cancel started requests or guard against stale responses. Older queries can therefore keep retrying and overwrite newer results. This is a source-observed race; no production out-of-order browser trace was captured.

## Fallback database cost

Production has **254,214 drug rows**. Read-only `EXPLAIN (ANALYZE, BUFFERS)` of the actual Prisma SQL measured:

| Query | PostgreSQL execution time | Observed work |
| --- | ---: | --- |
| `dolo` | 201–241 ms | Name-index scan rejects 67,713 rows before collecting 150 candidates |
| `isotroin` | 243–315 ms | Parallel sequential scan across the catalog |
| Synthetic no-match | 242–325 ms | Parallel sequential scan across the catalog |

The fallback uses case-insensitive substring matching across multiple fields, alphabetically limits candidates, and then ranks in JavaScript. Production has B-tree indexes but none of the local `drugs_search_*` indexes. `pg_trgm` itself is installed. The shared search implementation and four migration directories already present in the workspace are **uncommitted and not deployed**. Their previous local evidence must not be presented as production behavior. Merely adding their indexes while retaining the old query expressions is not a verified remedy.

## List search: what was and was not established

The deployed `/dashboard/prescriptions` page redirects to `/dashboard/visits`. Its visible “Search name, phone, or email” field searches patients, with a 250 ms debounce. It does not call the saved-prescription search endpoint. A clarification about the specific list/search box remains pending.

Production held **62 prescriptions, 605 visits and 554 patients** during the check. Tests of the saved-prescription service used empty, diagnosis, medicine and no-match searches. Patient lookup used a common two-letter fragment and a no-match term.

- Saved-prescription SQL statements each executed in **0.038–3.844 ms**. Returning a populated page issued five SQL queries total, including the count and batched related-record reads; this was not one query per prescription.
- Patient-search SQL statements each executed in **0.121–0.651 ms**.
- Local-to-production service timings were higher (saved prescriptions roughly 59–1,543 ms, patient lookup 67–191 ms), but even `SELECT 1` took 121–195 ms over this diagnostic connection. These timings include public-network round trips and initial connection costs. **The deployed backend uses Railway's private database network**, so these are not production API latency measurements.
- The connection snapshot showed 98 idle connections and only the diagnostic query active, against a configured maximum of 500. The bounded pool-error log search returned no matches. This does not exclude transient contention at another time.
- Backend health and frontend login returned HTTP 200. The available Chrome clinic session is logged out, preventing an authenticated browser trace without user sign-in.

There is no measured basis here for attributing list slowness to prescription-table growth, adding prescription search indexes, or declaring its cause resolved. The exact affected page and an authenticated request/render trace are needed to separate API/proxy latency, overlapping requests and browser rendering.

## Repair order and acceptance checks

1. Repair or retire the invalid prescription autocomplete route. Prefer a branch-scoped shared drug lookup with an explicit compatible response mapping. Updating only `genericName` leaves several invalid selected fields. Test against real Prisma validation, rather than an unrestricted `findMany` mock.
2. Ensure each settled medication query takes one healthy route. Add stale-response protection to both prescription search effects. Verify rapid typing cannot display an older query's results. Preserve retries for genuinely transient failures elsewhere.
3. Rehearse and review the existing shared catalog search plus matching indexes, then measure its actual query plans and result compatibility before deployment. Include rare names and no-match searches.
4. Trace the particular list search in an authenticated session. Measure browser-to-API time and render time; do not use the laptop-to-database timings as a substitute.

The source defect predates this investigation; no onset date or before/after production latency series was supplied. The diagnosis establishes current causes, not the date a regression started. The service is marked `@ts-nocheck`, and existing prescription tests do not exercise this autocomplete method against real Prisma validation, explaining a verification gap.

## Reproduction and evidence

Run from the repository root:

```sh
node scripts/diagnostics/prescription-search-performance.cjs
node scripts/diagnostics/prescription-search-performance.cjs --plans
node scripts/diagnostics/prescription-search-client-replay.cjs
```

The first two require the existing Railway session and network access. Database sessions enforce read-only mode, a five-second statement timeout and at most two connections. Searches run sequentially. The third is local and uses synthetic responses, executing no HTTP requests. It asserts both the broken and successful response paths.

Evidence under `output/diagnostics/prescription-search-2026-09-17/`: `baseline.json`, `plans.json`, `client-replay.json`, `production-log-summary.json`, and `connection-summary.json`. Credentials remain in memory; patient names, contact details and clinical text are not emitted. Query plans may include internal record IDs. The reported `statement_timeout=5000` in connection evidence belongs to the diagnostic session, not the application configuration.
