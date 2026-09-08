# Prescription workflow QA - 2026-09-08

## Results

- Chromium acceptance run: PASS, 19 checkpoints, four completed PDF downloads,
  no uncaught browser page errors (46 seconds).
- API acceptance pipeline: PASS, including idempotency replay, A -> B -> A edits,
  current PDF text, invalid requests and saved readback.
- Frontend focused tests: 25 passed across API retries and prescription pagination.
- Prescription service tests: 26 passed.
- `git diff --check` and both browser script syntax checks: passed.
- Full frontend TypeScript check: not clean; reports test typing errors, including
  existing untyped Jest mocks and missing visitId props. No error was reported in
  the new PDF renderer. This is not a green whole-repository build claim.

## Browser coverage

The run enters clinical sections, vitals, examination, investigations, procedures
and follow-up; adds/removes medicine rows; uses dose/duration presets; creates a
prescription through HTTP; verifies saved values; previews and downloads; edits
and downloads again; reloads; saves medication and fields-only templates; creates,
applies and deletes a template; exports a 45-line history over two pages; injects
a failed save to assert no download occurs; and retries successfully. It also
checks the no-phone WhatsApp guard. Examination is saved, not added to print.

Downloaded PDFs have valid signatures and match preview page counts. Final
multi-page output was rendered with Poppler and visually reviewed. Long content
approaches the existing letterhead footer closely; printer-specific clearance
still needs validation on the clinic's configured printer.

## Fixes

Browser export initially failed on Tailwind's `oklch` colors. Normalizing colors
inside html2canvas's private clone fixes that without altering the visible UI.
Exporting each Paged.js page exactly once also removes an extra blank trailing
page caused by re-pagination. Prescription updates now use the idempotency-aware
client method; new updates/PDF operations receive fresh keys retained on retries.

## Reproduction and boundaries

Run `npm run test:prescription-browser` or `npm run test:prescription-pipeline`.
See `docs/PRESCRIPTION_PDF_PIPELINE.md` for dependencies and configuration.
Evidence is under `output/prescription-browser/`, including `network.json`, PDFs,
preview text and screenshots. Test exit status is the overall result.

This uses the real UI and prescription HTTP/service code with synthetic auth and
in-memory persistence. It does not certify production auth/PostgreSQL, real drug
search and inventory, translation, physical printing, delivered messages,
standalone/quick prescriptions, refills, every paper-size setting, or all visit
completion/pharmacy handoff paths. No real prescription or message was issued.
