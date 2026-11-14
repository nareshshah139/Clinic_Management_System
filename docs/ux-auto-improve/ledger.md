# UX auto-improve ledger

One row per reviewed section. Each round: a reviewer walks the section in a browser on the demo stack, a judge argues against the proposals and specifies the survivors, implementers build them with failing tests first, and the merged result is hand-tested and recorded. Walkthrough videos are kept outside the repository.

| Section | Date | Pull request | Videos |
|---|---|---|---|
| Visits page (`/dashboard/visits`) | 2026-11-13 | [nareshshah139/Clinic_Management_System#99](https://github.com/nareshshah139/Clinic_Management_System/pull/99) | Five before/after walkthroughs, shared with the pull request author (not committed) |

## Visits page, 2026-11-13

Demo data for this section comes from `scripts/stack/scenarios/ux-visits-seed.cjs`. To get a seeded stack that stays up for 20 minutes, run:

```bash
STACK_DATABASE_URL=postgresql://user@127.0.0.1:5432/db node scripts/stack/scenarios/ux-visits-seed.cjs --minutes 20
```

Three things in that data are unrealistic on purpose, so do not read them as evidence. A second doctor is listed before the signed-in doctor. The owner, the admin and the second doctor hold every permission. Past visit dates are written directly to the database, because the API always stamps the current time.

### Shipped

| # | What changed for the user | Where |
|---|---|---|
| 1 | A visit or appointment opened from a link stays tied to its own patient and doctor. Choosing a different patient or doctor after "Back to Setup" starts a new visit instead of reopening (and saving into) the linked one. Changing the doctor no longer reopens the form. Unknown visit, patient and appointment links say so. The header notification link (`?appointmentId=` alone) now opens the appointment. "Back to Setup" and "Back to Calendar" ask before discarding edits. | `page.tsx`, contract `visit-form-patient-binding` |
| 2 | A failed patients or doctors request shows "Couldn't load visit setup" with Retry instead of "Setup Required". The signed-in doctor is preselected. | `page.tsx` |
| 3 | The patient search behaves like a standard search box: Enter picks only a highlighted row or the single match, the menu closes on Escape, Tab and outside click, editing the chosen name clears the selection, slow earlier results never replace newer ones, a failed search says so, and rows show age, sex and phone instead of the database id. | `PatientPicker.tsx` |
| 4 | Patient history: title, record count, then Refresh. Completed visits offer "Open visit". The prescription dialog shows each medicine's duration and the prescribing doctor, and no internal id. | `PatientHistoryTimeline.tsx` |
| 5 | The setup screen starts with the patient search: the two static role cards are gone, and Start stays visible above the history instead of sitting in a separate tab. | `page.tsx` |

### Waiting for an owner decision

1. **Default doctor for logins that are not doctors** (owner, admin, reception) in a branch with two or more doctors. Today: the first doctor in the list. Options: keep; no default (one extra click, no silent misattribution); remember the last choice. Recommended: no default, with a branch's only doctor preselected.
2. **Prescription dialog on the setup screen.** Its Print button prints the whole page. Options: keep as fixed; remove the dialog (the visit card's details already list the medicines); replace Print with "Open visit to print". Recommended: remove once front-desk staff confirm they do not reprint from there.
3. **Completed visits can be edited** through "Open visit", and the server accepts the change. Decide with clinicians whether completed visits should open read-only.
4. **Patient search ranking** (server): exact and prefix name matches first. Typing "asha" currently lists three look-alikes in no useful order.

### Deferred

- Leaving a new, unsaved visit by other routes (sidebar, browser Back, the progress links above the form) is not guarded. It needs an app-wide navigation guard.
- The leave dialog can still appear for about eight seconds after Save Draft on a new visit, because the form reports "Unsaved changes" until its first autosave. Edits made only by clicking (templates, chips) count as edits; switching tabs does not.
- A new visit's local draft is stored under a key that includes the opening time, so it is never restored and stays in the browser's storage. On shared clinic computers that is clinical text left behind. The fix belongs inside the visit form.
- The one-row patients request made only to learn whether any patient exists (`limit: 1`) could go once the empty-clinic state moves into the search.
- Resume from history reloads the whole page. Kept on purpose: a full load is the safest reset of the form.

### Not verified in this round

- The state models `cr21-visit-identity`, `cr22-on-examination` and `visits-ux-pass` under `verification/cr-state-coverage-2026-11-07/` were not re-run (they need their own database template and a built backend). `cr21` was updated for the search rows' new role.
- Links into the page were exercised by URL, not by clicking from the calendar, patient list, patient page and dashboard panels.
- Screen-reader output, Branded mode, a patient with 50+ visits, and a production build.

### User stories noted for later rounds

- As a doctor I want to start a visit for a patient who is not registered yet without leaving the page.
- As a receptionist I want the patient I just checked in to be offered first in the search.
- As a doctor I want the first field focused when the form opens, so I can type without clicking.
