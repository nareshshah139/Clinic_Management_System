# Patient History fix — 5 September 2026

Implemented in the local workspace. Not deployed to Railway. No production database writes, schema changes, migrations, backfills, or record deletions were performed during this fix. Existing unrelated pharmacy/inventory work was left intact.

## Changes

- Structured history, complete examination data and treatment-plan fields survive backend validation. Diagnosis is sent as the expected array.
- Prescription create and update save clinical visit details in the same database transaction. A failed prescription write rolls back the clinical write. Normal and print-preview saves share the clinical snapshot and full medication payload, including dose patterns and application instructions.
- Updating a prescription uses columns that actually exist in the production schema. Clinical metadata and review dates are stored on the linked Visit, rather than nonexistent prescription columns.
- Visit Save Draft/Complete receives the prescription editor's clinical snapshot. Medication plans, custom clinical sections and procedure metrics persist in the existing JSON fields; a medication plan is not presented as an issued prescription.
- Nested updates merge with existing clinical documents. Empty editor controls do not act as deletion requests. Unchanged complaint/diagnosis labels retain their annotations. Legacy text is preserved when adding structured fields.
- Prescription-created visits retain appointmentId and can resume the matching appointment's existing visit after a conflict. No historical appointment links are guessed or rewritten.
- All three history screens load every page through a shared hook, refresh after saved visits/prescriptions/appointments, protect against stale responses after patient changes, and show errors/retry rather than claiming the patient has no history.
- Appointment-only entries are included and clearly labeled with their status. They never offer a visit-resume action. Linked appointments and visits appear as one visit entry.
- Appointment dates determine encounter days; unlinked visits use their India-local creation day. Date filters operate on clinical days, independent of browser timezone.
- Expanded cards render all stored complaints, diagnoses, histories, examinations, treatment plans, prescription details, notes and photos. Temperature is labeled in its stored unit; oxygen saturation is recognized. Failure to load attachment metadata now fails the history request instead of silently hiding photos.
- Previous-medication lookup traverses the complete history. Previous lab comparison uses the predecessor of the resumed visit. Latest-visit summaries refresh after writes and use encounter dates.

## Verification

- Backend: **52 tests passed** across existing visit/prescription service suites and new clinical contract/transaction suites.
- Frontend: **9 tests passed** for complete cards, multi-page loading, empty-field preservation, stale requests, retry and refresh.
- Backend production build: passed.
- Frontend production build: passed, including application type checking. Existing font dependencies require network access during build.
- Focused lint of the new shared history utilities/card: no errors; existing-style loose-type warnings remain.
- `git diff --check`: passed.
- `git diff --name-only -- backend/prisma backend/start.sh`: empty; schema, migrations and startup behavior are unchanged.

Run the focused synthetic regressions from the repository root:

```sh
node scripts/diagnostics/patient-history-repro.cjs
```

That command uses mocks and synthetic clinical data; it does not connect to a database. The separate production audit script remains read-only and must not be confused with the regression runner.

## Boundaries

The original Railway investigation found missing documentation in stored records as well as display omissions. This patch prevents the identified save failures and displays available data; it cannot recreate text never saved to Railway. It deliberately does not synthesize clinical history or infer links for the 47 existing unlinked visits. The original diagnosis report describes the pre-fix state and remains as historical evidence.

Deployment is separate. The existing Railway start script runs `prisma migrate deploy`; before deploying, verify the deployed commit and migration state and deploy only the reviewed changes, excluding unrelated work in this shared checkout.
