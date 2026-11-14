# Unit `appointments`: calendar, booking dialog, clinic bill dialog

- Worktree `/home/user/wt/appointments`, branch `ux/appointments`.
- Read in full: `docs/ux-flow/journeys/j01.md`, `docs/ux-flow/journeys/j05.md`; in `docs/ux-flow/redundancy.md` proposed changes 2 and 4 and naming table 4.4.
- Journeys you own: `j01` (baseline 6), `j05` (baseline 8). `j03` starts on your calendar (it clicks START on a row): replay it and make sure it does not get longer. Edit only its START step if your change to that button requires it, and say so in your report.
- Main files: `frontend/src/app/dashboard/appointments/page.tsx`, `frontend/src/components/appointments/*` and their tests.

## Build
1. **Calendar above the fold.** The first appointment row starts at about y=840 of an 850px window today. Collapse the Legend behind a closed "Legend" disclosure. Its content stays exactly as the `@cc appointment-calendar-legend` rule in `AppointmentsCalendar.tsx` requires; only its default state becomes closed. Move Visit Type, Room and Grid into one collapsed "Filters" control. Make the patient search the first and widest control, placeholder "Name or phone". Cut the helper lines the two Subtext tables mark cut. Report the y position of the first calendar row at 1366x850 before and after.
2. **Auto-select the patient** when the search returns exactly one match; show the chosen name and phone in the box.
3. **Warn, never block,** when the patient already has an appointment that day (for example "Kavita Naik already has 10:00 on 14 Nov"), before the booking is confirmed.
4. **Booking dialog cleanup** per j01: drop the Duration and Type helper sentences, room as a plain optional choice (still required for procedures), "Book" as the action word.
5. **Remove the Slots tab.** It renders the same calendar and dialogs as Calendar. Delete `AppointmentScheduler.tsx` if nothing else imports it (grep first; leave `PatientProgressTracker` itself). Update tests.
6. **Read `?date=YYYY-MM-DD`** on the Appointments page and show that day (localStorage memory stays the fallback).
7. **The bill dialog closes itself after a successful save** (create bill, record payment); the toast stays; the row shows the paid state. "Add another bill" stays reachable from the row's chip. The payment mode picker and its Cash default stay as they are.
8. **Row actions visible without hovering.** Show the primary action for the row's state at all times: "Confirm" on a scheduled row (one click, the same call the details dialog's Confirm makes), "Start visit" on a confirmed row for roles that can start visits. The rest stays in the details dialog.
9. **Free 15-minute gap inside a half-booked tile** (j01 proposed change 5): first confirm on the running app that it cannot be clicked today. If confirmed and the fix is contained to the click target, build it; the server's overlap and overbooking checks stay the authority. Otherwise skip and say so.
10. **The Quick Guide stays** (owner decision). Rewrite its lines so each matches the new screen. Apply the rest of both Subtext tables. Use "Review" and "First visit" for the visit kind in display text only; do not change text stored on invoices.

## Do not build
- Booking with no dialog on a single click.
- One-tap payment buttons per mode, or preselecting the patient's last-used mode.
- A receipt print path for clinic bills.
- Dashboard changes.

## Expected
- `j01`: 6 to 5. Goal stays: one more appointment for Kavita Naik tomorrow. The seed already has her at 10:00 tomorrow, so the same-day warning must appear on this journey: assert it is visible.
- `j05`: 8 to 6. Goal stays: both invoices at zero balance.
- `j03`: not longer than 26.
