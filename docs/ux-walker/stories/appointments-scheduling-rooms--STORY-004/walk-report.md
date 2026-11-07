# STORY-004: Doctor clicks "Book appointment" from a patient's chart. Walk report

**Result: FAIL.** The booking is blocked until the user re-selects the patient by hand. 6 findings: 1 high, 2 medium, 3 low.
Persona: Dr. Praneeta Jain (DOCTOR). The seed has no Arjun Varma, so the patient was **Arjun Reddy** (`cmw6dbbe2000a7dc1bw0xhc61`). Follow-up date 2026-11-21 (two weeks ahead). Playwright at 1280x800.
Screenshots: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/appointments-scheduling-rooms--STORY-004/`

## Steps

| # | Action | Actual | Screenshot | Geometry |
|---|--------|--------|------------|----------|
| 0 | Arjun's chart | The detail page, as in STORY-002. | step-0-patient-detail.png | as STORY-002 |
| 1 | Click **Book appointment** | Goes to `/dashboard/appointments?patientId=<id>`, "Appointments", Doctor = Praneeta Jain, Date = today. Empty space at the top of the filter card; Quick Guide is styled as a form field (F-004-05). | step-1-appointments.png | Calendar/Slots tab widths differ (intentional) |
| 2 | Look for Arjun | Patient box value `""`, 0 "Selected:" badges. **Matches the catalog defect.** | step-2-patient-box.png | n/a |
| 3 | Date 2026-11-21, click the free 10:00 tile | 18 free tiles (`Book 09:00-09:30` … `Book 17:30-18:00`). The dialog shows **"Patient: Unknown Patient / Phone: N/A"**, Date 21 Nov 2026, Slot 10:00-10:30. The "Available" pills break mid-word (F-004-03). | step-3a-date-set.png, step-3-booking-dialog.png | Cancel/Confirm widths differ (intentional). The pill wrap was confirmed by eye, not flagged by the script. |
| 4 | **Confirm Booking** | Toast "Validation Error — Patient information is missing" and the inline list "Please fix the following errors: Patient information is missing". **Confirms the catalog claim** (F-004-01). The error is shown twice and the patient header is scrolled out of view (F-004-04). | step-4-confirm-result.png | n/a |
| 5 | Workaround: Cancel, type "arjun", pick him, click 10:00, confirm | The badge reads "Selected: Arjun Reddy — 9876543212", the date stays 21 Nov, and the dialog shows the right patient. POST `/api/appointments` `{"doctorId":"cmw6d94b4…","patientId":"cmw6dbbe…","date":"2026-11-21","slot":"10:00-10:30","visitType":"OPD"}` succeeds: "Appointment Successfully Booked! Arjun Reddy scheduled for 10:00-10:30 (OPD)". | step-5a…, step-5b-selected.png, step-5c-dialog-with-patient.png, step-5d-booked.png | 3-cell appointment tile row of differing widths (intentional) |
| 6 | Back to the chart (extra check) | Summary card: **"Next appointment: Not scheduled"**. Tracker directly below: **"Upcoming appt / Start Visit"** (F-004-02). | var-detail-after-booking.png | n/a |

## Mobile spot-check (390x844, booking dialog with error)
`mobile-check.png`: single-column room cards render cleanly ("Available" stays on one line). The error toast covers the dialog's top. Geometry: no overflow.

## Console and network evidence
- `GET /patients/<id>/next-appointment` returns `200` with `Content-Length: 0` when there is none (checked with curl), and the client logs `api.request_failed … status 200 code invalid_response` on every chart load.
- Each dialog open logs "Missing `Description` or `aria-describedby`".

## Mapped defects touched
- CONFIRMED: appointments #1 ("Book appointment" from patient cannot complete). Patients #6 (detail "Next appointment" is always "Not scheduled" while the tracker sees one).
- Not exercised: #2 (duration reset), #4 (filtered tiles), Slots-tab variation.

## Flow log
- Ideal 4 steps (Book appointment, set date, click slot, confirm). **Actual 9**: the 4, then Cancel, type the name, pick the patient, click the slot again, confirm. That is 5 extra steps and re-entry of data the app already had in the URL (`flow`, folded into F-004-01).
- Hesitation: after step 1 there is no sign which patient the page is booking for. The dialog's "Unknown Patient" appears only after a slot is picked.
- Redundancy: two booking entry points on the chart ("Book appointment" and tracker "Book") hit the same bug. Two visit-start buttons (F-004-06).
