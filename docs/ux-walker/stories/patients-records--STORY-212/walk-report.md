# Walk report: patients-records STORY-212, "Role boundaries on patient records (nurse, manager, pharmacist by URL)"

**Result: FAIL.** Every role tested can read, edit, archive and export every patient, and nothing in the UI marks admin-level actions. Two further problems:

- **New finding:** the Walk-in Create Patient dialog cannot be submitted at a 1280x800 viewport.
- MANAGER walk-ins fail with a misleading "No slots available" toast.

**Walk details**

- **Personas:** seeded `nurse@clinic.test` (Nisha Nurse), `manager@clinic.test` (Manoj Manager) and `pharmacist@clinic.test` (Pooja Pharmacist). I used these instead of the story's sunitha/kiran/arif, which do not exist.
- **Walked:** 2026-11-07.
- **Screenshots:** `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/patients-records--STORY-212/`
- **Scripts:** `.../scripts/admin/story212.js`, `dlgprobe.js`, `mgrtoast.js`, `measure.js`
- **Results:** `story212-results.json`

**Test data created** (throwaway DB):

| Patient | Created by | Booking |
|---|---|---|
| UXW Nurse81617 | NURSE | Walk-in booked 08 Nov 09:00–09:30 with Dr. Praneeta, no room |
| UXW Manager24426 | MANAGER | No appointment |
| UXW MgrToast | MANAGER | No appointment |

All three are still active. Each archive in this walk was undone.

## Steps

### NURSE

1. **Sidebar Patients → list** (`nurse-01-patients-page.png`). Every row action is visible: View, Edit, Archive, Link Portal, WhatsApp, Start Visit, Copy code.
   - Geometry: clean apart from natural button widths.
   - **Visual:** the search input is squeezed to **158px**, so its placeholder is truncated ("Search by nar…") and the hint "Try: 9xxx… (phone), abha…, @email" wraps under it. The primary "New Patient" button floats mid-row (x 730–878), detached from Clear Filters / Export CSV (x 976–1256) (F-212-06).
2. **New Patient → Walk-in → Dr. Praneeta** (`nurse-02-walkin-form.png`, `nurse-walkin-dialog-clipped-800.png`).
   - **NEW defect:** the dialog is **1099px tall**, with `overflow-y: visible` and no max-height. At 1280x800 its top sits at y = −149 and the Create button at y = 924. Neither can be reached: mouse-wheel scrolling moves nothing (`dlg.scrollTop` stays 0) and Playwright cannot scroll it into view. At 1280x900 the Create button bottom is at 974, still off-screen. Any viewport shorter than about 1100px cannot submit a walk-in (F-212-01).
   - To continue the walk, I used a 1280x1200 viewport for the create steps only.
   - **Room dropdown:** empty. `GET /appointments/rooms` returns **403** for NURSE. **CONFIRMED.**
3. **Create** (`nurse-03-walkin-created.png`). The patient is created. The DB shows the appointment booked for 2026-11-08 09:00–09:30, `roomId` NULL. **CONFIRMED** ("books without a room").
4. **Archive, then Undo** (`nurse-04-archived.png`, `nurse-05-undo.png`). The toast reads "Patient archived · UXW Nurse81617 has been archived · Undo" and the row disappears. Undo gives "Archive undone" and the row returns. There is no backend role check. **CONFIRMED.**

### MANAGER

5. **Patients** (`manager-01-patients-page.png`). Same page and actions.
6. **New Patient → Walk-in → Dr. Shravya → Create** (`manager-03-walkin-created.png`, `manager-03b-no-slots-toast.png`). The patient is created. The page then calls `GET /appointments/available-slots` for 7 days, and **all 7 return 403**.
   - The user sees a red toast: **"No slots available — No available consultation slots found in the next 7 days for the selected doctor."** No appointment is created.
   - A direct probe confirms `available-slots` is 403 for MANAGER.
   - **CONFIRMED** (mapped defect 17). The message blames availability for a permission failure.
7. **Archive, then Undo** works for MANAGER too.

### PHARMACIST

8. **The sidebar has no Patients link**. I typed `/dashboard/patients` (`pharmacist-01-patients-page.png`) and the full Patients Management page loads. **CONFIRMED.**
9. **Search "UXW"** returns 2 rows (`pharmacist-02-search.png`). **Edit** opens the "Edit Patient" dialog pre-filled (`pharmacist-03-edit-dialog.png`); Cancel closes it.
10. **Export CSV** (`pharmacist-04-export.png`). Toast "Exported 13 patients to CSV". The downloaded file has the header `ID,Name,Age,Gender,Phone,Email,ABHA ID,Referral,Consultation Type,Portal Linked,Created At` and 13 rows of patient phone numbers. **CONFIRMED.**
    - The "Consultation Type" column is blank for both test patients, although both were created as Offline. Patients-topic defect 4 is **CONFIRMED** for the CSV.
11. **Archive, then Undo** (`pharmacist-04-archived.png`, `pharmacist-05-undo.png`): both succeed for PHARMACIST. **CONFIRMED.**

### Variations

- **ACCOUNTANT and LAB_TECH by URL:** the Patients page loads with no 4xx (STORY-005 matrix). **CONFIRMED.**
- **RECEPTION:** loads cleanly (matrix). The walk-in room path was not re-walked.

## Mobile spot-check (390x844, Patients as PHARMACIST)

`pharmacist-mobile-check.png`: the header actions, search and four filters stack full-width cleanly. The Undo toast covers the top of the page. Geometry is clean, with no page overflow.

## Mapped defects checked live

| Topic defect | Live result |
|---|---|
| 4. `consultationType` dropped from list rows and CSV | **CONFIRMED** (CSV column blank) |
| 11. No role guard on any patient endpoint | **CONFIRMED.** PHARMACIST searches, edits (dialog), archives and exports by URL; NURSE and MANAGER archive |
| 17. Walk-in auto-booking swallows errors; MANAGER gets a false "No slots"; NURSE gets an empty room list | **CONFIRMED** (7×403 swallowed; room 403 gives an empty dropdown and a booking with no room) |
| Edge: Archive/Link/Export show for every role with no admin hint | **CONFIRMED** |

## Flow log

- **Steps.** Ideal: 3 per role. Actual: 3 per role for the PHARMACIST URL path. The NURSE and MANAGER walk-ins needed a viewport change before the form could be submitted at all, a detour no real user could make, except by zooming the browser out.
- **Hesitation:**
  - The Create button is invisible below the fold of a non-scrolling dialog.
  - The MANAGER sees "No slots", while the doctor's calendar has open slots.
- **Redundancy:** the page has two headings ("Patients Management" / "Patients") with separate descriptions.
