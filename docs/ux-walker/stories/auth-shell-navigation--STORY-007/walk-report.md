# STORY-007: Finding a patient from the header search. Walk report

**Result: FAIL.** The patient result dead-ends and the appointment result opens the wrong date. 5 findings: 2 high, 2 medium, 1 low.
Persona: Riya Sharma (RECEPTION). The seed has no Sai Kiran Goud, so the target was **Arjun Reddy** (9876543212), who has appointments on 21 Nov 10:00 (booked in STORY-004) and today 19:00, both with Dr. Praneeta. Query "arj". Playwright at 1280x800.
Screenshots: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/auth-shell-navigation--STORY-007/`

## Steps

| # | Action | Actual | Screenshot | Geometry |
|---|--------|--------|------------|----------|
| 0 | Start on Rooms | Room Occupancy page with Total 6 / Available 6 / Occupied 0 / Appointments 0 tiles. | step-0-rooms.png | legend chip widths differ (intentional) |
| 1 | Type `a` | Nothing opens (2-character minimum). Matches the catalog. | step-1-one-char.png | n/a |
| 2-3 | Type `rj` | The dropdown lists the patient "Arjun Reddy / 9876543212 / Patient • M • 35 yrs" and two appointment rows ("Arjun Reddy - 10:00-10:30 / Dr. Praneeta Jain / 21 Nov 2026 • OPD", "… 19:00-19:15 / 07 Nov 2026"), plus the footer "Press Enter to go to first result". About 30px of empty padding above the first result (F-007-05). | step-2a-spinner.png, step-3-results.png | clean |
| 4 | Escape | Dropdown closes and "arj" stays in the box. Matches the catalog. | step-4-escape.png | n/a |
| 5 | Click back into the box | Results reopen. Matches the catalog. | step-5-reopen.png | n/a |
| 6 | Click the patient result | `/dashboard/patients?search=cmw6dbbe2000a7dc1bw0xhc61`. The list search box is seeded with the cuid; **"No patients found"**. The header box is cleared. **Confirms the catalog claim** (F-007-01). | step-6-patients-empty.png | clean |
| 7 | Search the list by `9876543212` | 1 row (Arjun). | step-7-phone-search.png | n/a |
| 8 | Header "arj", click the 21 Nov appointment result | Bare `/dashboard/appointments`: Doctor = Praneeta Jain, Date = **11/07/2026 (today)**, not 21 Nov (F-007-03). | step-8a-appt-results.png, step-8-appointments.png | Calendar/Slots tab widths (intentional) |

## Variations and edge cases
- **Enter** right after typing goes to the first result (the patient), which is the same dead end. `var-enter.png`
- **Staff** `shravya`, then click: `/dashboard/users?search=cmw6d94b200037dw0nxzpi3qc`. **Users Management opens for RECEPTION.** It lists every user unfiltered (including a PATIENT portal account and other walkers' test users), with New User, Clinic Holidays, Edit, Delete, Reset password and Role & Permissions. Confirms the catalog claim, and the exposure is larger than the catalog says (F-007-02). `var-staff-results.png`, `var-staff-users-page.png`
- **No match** `zzq`: "No results found for "zzq"" and "Try searching for patient names, phone numbers, or doctor names". Matches the catalog. `var-no-match.png`
- **Phone suffix** `543212` returns both appointments and **no patient**. Confirms the catalog edge case (F-007-04). `edge-phone-suffix.png`

## Mobile spot-check (390x844)
`mobile-check.png`: there is no header search at all on mobile (only a hamburger). The Patients search box shows the seeded cuid. Mapped auth #15 is confirmed; the finding is logged once, as F-001-07. Geometry: no overflow.

## Mapped defects touched
- CONFIRMED: auth #1 (patient result dead-ends), #2 (staff result ignores target and opens Users for RECEPTION), #3 (appointment result lands on today/persisted doctor), #15 (no search on mobile). Appointments #19 (same as auth #3). Patients #8 (same as auth #1).

## Flow log
- Ideal 3 steps (type, pick patient, land on record). **Actual 6**: type, pick, land on an empty list, clear the search, type the phone, click the row. For the appointment: type, pick, land on today, then change the date by hand.
- Hesitations: after step 6 the search box holds an unreadable id, so she cannot tell what went wrong. After step 8 the calendar shows today, and nothing shows that the 21 Nov appointment was "opened".
- Re-entry: she retypes the phone number that the dropdown had already shown.
- Redundancy: the patient's name and phone appear in the dropdown, the list row and the detail header.
