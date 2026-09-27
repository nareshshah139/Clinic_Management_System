# CR-04 — Personal history

Implemented on 2026-09-27. Prepared for GitHub on `codex/cr04-personal-history` from current `origin/main`; not deployed.

## Behavior

- A multiline **Personal history** field appears inside Patient History, with examples for diet, sleep, habits, occupation and products used.
- The value is saved in the existing visit history document and its prescription clinical snapshot. No schema migration is required.
- New visit editors fetch the patient's most recent saved personal history through the branch-scoped `GET /visits/patient/:patientId/personal-history` endpoint. Visit creation also inherits it server-side if the request omits the field. Earlier visits retain their own snapshots.
- Explicit clears are saved as empty strings, so older text does not reappear on subsequent visits. Unsaved drafts and typing take precedence over delayed responses. Patient/visit changes do not reuse another context's value.
- Standard printing uses its own heading; space-optimised printing uses an inline label. Empty and whitespace-only values omit the entire section. Preview refresh, translation, print and downloaded PDF use the new value.

## Verification

**71 targeted tests passed on the isolated commit:** 25 frontend editor/save/history tests, 7 paginated print/export tests, and 39 backend visit/prescription persistence tests. The original shared checkout also passed 81 tests; its additional tests belong to other pending change requests and are excluded from this commit.

Coverage includes entry, editing, saved and JSON-string readback, draft recovery, explicit clearing, carry-forward across an intervening legacy visit, branch/patient isolation, preservation of other history, current-visit overrides, print omission, both layouts, and updates to an already-open preview.

```sh
npm test --workspace=frontend -- --runInBand __tests__/visits/PrescriptionBuilder.personal-history.test.tsx __tests__/visits/PrescriptionBuilder.clinical-saving.test.tsx __tests__/visits/MedicalVisitForm.saving.test.tsx __tests__/visits/PatientHistoryVisitCard.test.tsx __tests__/visits/VisitsPage.history-navigation.test.tsx --silent
npm test --workspace=frontend -- --runInBand __tests__/visits/PrescriptionBuilder.pagedjs.margins.test.tsx --testNamePattern='personal history' --silent
npm test --workspace=backend -- --runInBand personal-history.spec.ts visits.service.spec.ts clinical-save-roundtrip.spec.ts patient-history.contract.spec.ts prescription-clinical-transaction.spec.ts --silent
npx tsc --noEmit --incremental false -p frontend/tsconfig.build.json
```

Frontend type checking and the scoped whitespace check passed on the isolated branch. Code contracts were added for carry-forward, branch isolation, history merging, draft precedence and conditional printing. No pre-existing contracts governed these declarations on `origin/main`. Their syntax, declaration placement and semantics were reviewed manually because `cc-check` was unavailable. The initial unfiltered print suite reported eight failures outside CR-04: seven existing numeric-dosage-control tests and a medicine-label export timeout. The targeted CR-04 print/export tests pass. A repository-wide whitespace check also reported a concurrent, unrelated change in `backend/src/modules/notifications/notifications.service.ts`; the CR-04 files pass their scoped whitespace check.

The actual local frontend in the original shared checkout was checked in Chromium with synthetic API responses; backend persistence and carry-forward were exercised separately through validation and service tests with an in-memory database fixture. The browser check confirmed Save Draft's payload, the next visit's prefilled field, standard and compact pagination, and blank-heading omission, with no browser runtime errors. These are local checks, not production database or physical printer verification.

To repeat the browser check, start the frontend at `http://localhost:3000`, then run:

```sh
node scripts/diagnostics/cr04-personal-history-browser.cjs
```

Screenshots and the check record are in `output/cr04-personal-history/`:

- `editor.png`
- `standard-preview.png`
- `optimized-preview.png`
- `blank-preview.png`
- `checks.json`

Frontend and backend should be deployed together so the prefill endpoint is available.
