# Walk report: admin-users-reports-messaging STORY-010, "Exporting the Patient Analytics report for the auditor, in CSV, then PDF, then Excel"

**Result: FAIL.** No export format works for any report, and every failure is silent.

- **Persona:** ADMIN.
- **Walked:** 2026-11-07, 1280x800. Reports page, Patient Analytics selected, October range.
- **Screenshots:** `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/admin-users-reports-messaging--STORY-010/`
- **Script:** `.../scripts/admin/story009.js` (the STORY-010 section) and `s9b.js`.

## Steps

1. **Export select** (`step-01-export-options.png`). Options: JSON, CSV, PDF, Excel. **CONFIRMED.**
2. **CSV** (`step-02-csv.png`, `step-02b-after-csv-no-feedback.png`).
   - Request body: `{"reportType":"PATIENTS","exportFormat":"CSV","parameters":{...}}`.
   - Response: **400 "Unsupported report type: undefined"**.
   - No download, no toast, no inline message. The select now just reads "CSV". The only trace is console "Error exporting report". **CONFIRMED.**
3. **CSV again** (`step-03-csv-again.png`). **No request is sent at all**, because the select already holds "CSV" and `onValueChange` doesn't fire. **CONFIRMED.**
4. **PDF** (`step-04-pdf.png`). 400, same message, silent. **CONFIRMED.**
5. **Excel** (`step-05-excel.png`). 400, silent. **CONFIRMED.**
   - **JSON** (`step-05b-json.png`): also 400. JSON does not work either.
6. **Variation: Revenue Report, CSV** (`var-revenue-csv.png`). The `REVENUE` name matches the backend switch, and the request still gets **400 "Unsupported report type: undefined"**. **CONFIRMED.**
7. **Direct API probe.** From the page (cookie auth), I POSTed `/reports/export` with the singular names the backend switch expects: `PATIENT`/CSV, `PATIENT`/PDF, `REVENUE`/PDF, `REVENUE`/JSON. **All returned 400 "Unsupported report type: undefined"**. This proves the global whitelist ValidationPipe strips `reportType`/`exportFormat` (no class-validator decorators) independently of the plural-name bug.
8. **PDF 0-byte claim.** **UNVERIFIABLE live.** The export never gets past the 400, so no PDF is produced to measure. The code-level finding stands unproven.

## Mobile spot-check

Covered by the STORY-009 mobile check: same page, and the Export select stacks below the dates. Nothing export-specific breaks at 390px.

## Geometry

The Reports controls card was audited in STORY-009: clean.

## Mapped defects checked live

| Topic defect | Live result |
|---|---|
| 7. Every export fails (DTO stripped, plural names, swallowed error, select can't re-fire) | **CONFIRMED.** All four formats, two reports, plus direct singular-name probes all return 400; the re-pick sends no request |
| 8. PDF export would be empty | **UNVERIFIABLE** (blocked by defect 7) |
| Edge: exports as `data:` URLs | Not reachable |

## Flow log

- **Steps.** Ideal: 2. Actual: 5 attempts, 0 files. The persona has no signal that anything failed: the select just shows the format name, which reads like a success.
- **Dead end:** the only fallback is copying numbers by hand. Patients → Export CSV exports the patient list, not analytics.
- **Interaction pattern:** a `<Select>` triggers a one-shot action. It holds state and cannot repeat the same choice. It should be a button or a dropdown menu.
