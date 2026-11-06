# CR-16: Compact past-visit panel

On a follow-up patient, **Show details** under a past visit now opens a compact view. It shows the chief complaint, the diagnosis, the visit's history and a plain list of medicine names. Each medicine appears once. The full regimen stays one click away under **Full details**.

## Behavior

The panel has three states: summary, compact and full.

- **Summary** is unchanged. It shows the date, doctor, chief complaint and diagnosis, clamped to two lines.
- **Show details** opens the compact view. History renders every recorded history field, with personal history first. This includes the history written by the visit form (`subjective`). Medicines are listed by name only.
- Medicine names come from the issued prescription. A draft with no issued prescription uses its saved medication plan. A visit documented as free text uses its topical and systemic medication lines.
- **Full details** shows every recorded section, as before. The prescription appears once, under **Prescription**. Treatment plan no longer repeats the saved medication plan when it lists the same medicines. If the plan was edited after the prescription was issued, the edited plan stays visible under Treatment plan.
- Full details no longer shows Regimen State, Touched (the stray "timing duration instructions" line), Gst Rate, the prescription's Language, or internal drug and inventory IDs. A consent's language still shows.
- The **Full details** / **Compact view** switch sits at the top of the expanded panel. It appears only when both views have something to show. A visit with nothing for the compact view, such as vitals only, opens straight to Full details.
- The **N Rx Items** badge counts issued prescription items only. A draft plan does not add a badge.
- Diagnosis was left open by the CR. It stays, because it is already in the summary rows above the panel.

The visit editor no longer saves its screen-only `regimenState` into `treatmentPlan.dermatology.medicationPlan`. Records saved before this change still contain it, so the panel removes it when displaying.

## Verification, 06/11/2026

`scripts/diagnostics/cr16-visit-history-browser.cjs` drives the real patient History tab in Chromium. Every API response is synthetic and shaped like `GET /visits/patient/:id/history`. No real patient records are read.

On `main` before this change, the same fixture showed each of the three medicines twice. "Regimen State", "Touched", "Gst Rate", "1-0-1" and the stray line each appeared six times.

With this change, 20 checks pass at 1440 px and 390 px:

- Compact view shows the complaint, the history and each medicine name once. It shows no dose, frequency, timing, instruction, route or internal field.
- Full details keeps the regimen once and the consent language.
- Compact view, Hide details and reopening behave as described above.
- A draft visit, a visit-form visit, a vitals-only visit, a legacy text history with JSON prescription items, and an empty visit each render correctly.
- No horizontal overflow and no page errors.

Unit tests: `frontend/__tests__/visits` passes 19 suites and 206 tests. The production TypeScript check passes.

Evidence: `output/cr16-visit-history/checks.json` and the compact and full screenshots in the same folder.

## Not included

- The backend still sends every stored prescription item field. The panel cleans them for display.
- Medicine names print as stored. Standard name formatting is CR-11.
