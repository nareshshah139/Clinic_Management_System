# Unit `patients`: patient list, registration, patient page

- Worktree `/home/user/wt/patients`, branch `ux/patients`.
- Read in full: `docs/ux-flow/journeys/j02.md`, `docs/ux-flow/journeys/j09.md`; in `docs/ux-flow/redundancy.md` proposed change 5 and naming table 4.4.
- j02's critique reports that every booking for today failed with a 500. That came from the test data and is fixed in the seed. Do not change `nextDoctorToken`. The rest of the critique stands.
- Journeys you own: `j02` (baseline 13), `j09` (baseline 10).
- Main files: `frontend/src/app/dashboard/patients/page.tsx`, `frontend/src/app/dashboard/patients/[id]/page.tsx`, `frontend/src/components/patients/*`, `frontend/src/components/visits/PatientHistoryVisitCard.tsx` (read; reuse), `backend/src/modules/patients/patients.service.ts` (date-of-birth fix only), and their tests.

## Build
1. **Registration asks only what it needs.** Visible by default: name, phone, age, gender, and the walk-in booking part. Gender is three buttons (Male, Female, Other), none preselected, required (today it silently defaults to "Other"). Everything else (ABHA, email, address, emergency contact, referral, consultation type, primary doctor) sits behind one "More details" disclosure. Mark required fields. Edit mode shows every field and no walk-in controls.
2. **Walk-in is the default on the Patients page.** "New patient" opens with "book for today" on, the doctor preselected (the only doctor, or the last one used on this device), and a one-click switch to "Register only". The submit button says what it does: "Register and book" or "Register". `/dashboard/patients?new=walkin` opens this dialog directly.
3. **Never swallow a booking error.** The walk-in loop catches a failed booking and silently books another day while the screen reports success (`PatientsManagement.tsx` near 538-596). Skip a day only when it has no free time. If the booking call fails, say "Patient saved, not booked: <reason>" with a link to Appointments. Keep the overbook-cancelled branch. After a successful booking show the time and token and an "Open today's list" link. If the booking lands on another day, say which day.
4. **Editing a phone number must not rewrite the date of birth.** Measured: changing only the phone turned 19 Jul 1988 into 1 Jan 1988, because the edit dialog always sends `age` and the service rebuilds the date from it (`PatientsManagement.tsx` near 473-488, `patients.service.ts` near 351-362). Send only changed fields; never recompute a date of birth from an age that did not change. Pin it with a backend spec and a frontend test.
5. **The patient page answers "what happened last time" on arrival.** A "Last visit" panel at the top: date, complaint, diagnosis, medicines (or "No medicines prescribed"), review advice, with no tab or "Show details" click. Honour the visibility rules for non-doctor roles (`frontend/src/lib/history-visibility.ts`). When the most recent visit has no prescription but an earlier one does, show the most recent visit and, under it, the last prescription's date and medicines.
6. **An "Edit" button on the patient page** opening the existing edit dialog.
7. **Remove duplicates on the patient page**: phone, age, gender and email shown twice; the internal "ID:" badge; the progress tracker's action row (three buttons open the same visit link; "Invoices" opens a new pharmacy bill, which is wrong). Keep one "Book appointment" and, for roles that may, one "Start visit".
8. **Patients list**: focus the search box on arrival; row actions on one line at 1366px.
9. **The Quick Guide stays** (owner decision). It says "Add Patient" while the button is "New Patient": correct it and every other line to match the new screen. Apply the rest of both Subtext tables. "New patient" is the one name.

## Do not build
- Inline phone editing on the patient page.
- Merging the two patient creation forms.
- Header search or dashboard changes.

## Expected
- `j02`: 13 to 8 or fewer. Goal stays strict: the patient exists and is on TODAY's list for Dr. Priya Menon.
- `j09`: 10 to 5 or fewer. Strengthen the goal: the medicine names of Rohan Kulkarni's last prescription are visible (the seed gives his visit 45 days ago Adapalene and Cetirizine), the phone changed, and through `ui.api` his date of birth is still 1988-07-19 after the edit.
