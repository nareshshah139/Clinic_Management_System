# Walk report: admin-users-reports-messaging STORY-011, "Lakshmi, the new MANAGER, finds most of the Users page is for show"

**Result: FAIL.** Users gives a MANAGER every write control, and every write is refused. Some refusals are silent, some show raw "Forbidden resource (Reference …)" text. Role & Permissions is empty for every role, ADMIN included.

- **Persona:** MANAGER (seeded `manager@clinic.test`, "Manoj Manager"). Writes were aimed at my fresh test user Sowmya Reddy, not at Riya, so a seeded user could not be changed if a refusal unexpectedly succeeded.
- **ADMIN cross-check:** the Role & Permissions grid was also tested as `admin@clinic.test`.
- **Walked:** 2026-11-07, 1280x800.
- **Screenshots:** `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/admin-users-reports-messaging--STORY-011/`
- **Script:** `.../scripts/admin/story011.js`
- **Results:** `story011-results.json`

## Steps

1. **Sign-in sidebar.** Dashboard, Patients, Appointments, Visits, Procedures, Rooms, Inventory, Reports, Users. No Pharmacy links. **CONFIRMED.**
   - The Dashboard silently 403s on `/appointments?date=` and shows "No appointments scheduled for today" (see STORY-005 F-005-03).
2. **Users** (`step-02-users-list.png`). The full staff list loads with all buttons: New User, Clinic Holidays, and per row Edit, Delete, Reset password, Role & Permissions. Geometry: clean.
3. **Edit, change Phone to 9848033445, Save** (`step-03-edit-save-403.png`). `PATCH /users/:id` returned **403**. The dialog stays open with the new phone and no message; the only sign is an unhandled rejection in the Next dev badge. **CONFIRMED** (defects 15 and 17).
4. **Reset password, then "I have confirmed who is asking. Create code"** (`step-04a-reset-dialog.png`, `step-04b-reset-403.png`). `POST /auth/users/:id/reset-code` returned **403**. The dialog shows a red **"Forbidden resource (Reference: b932fc18-…)"**. **CONFIRMED.** The copy is technical and tells her neither why nor who can do it.
5. **Clinic Holidays** (`step-05a-holidays.png`, `step-05b-add-holiday.png`).
   - On open, `GET /doctor-availability/holidays` returned 403. The dialog shows "No upcoming holidays." **and** a red "Forbidden resource (Reference …)" under it, which contradict each other.
   - Adding 30–31 Dec 2027 returned `POST /doctor-availability/time-off` **403**, and a second red "Forbidden resource (Reference …)" stacked above the first.
   - The story claimed the message "Only an admin can manage clinic holidays". That is **REFUTED**: the live text is the generic "Forbidden resource" twice.
6. **Role & Permissions** (`step-06a-role-perms.png`).
   - `GET /users/roles?limit=100` and `GET /users/permissions?limit=1000` both returned **404 "User not found"**. They are shadowed by `@Get(':id')`.
   - The dialog shows "Permissions · Selected: 0" with no grid and no empty-state message.
   - **Apply Role:** `PATCH /users/:id/role` returned 403, and `alert('Failed to update role. Please try again.')` fired (`step-06b-apply-role.png`). **CONFIRMED.**
   - **ADMIN cross-check** (`admin-06a-role-perms-grid.png`, `admin-06b-apply-role.png`): the same 404s and the same empty grid. For ADMIN, Apply Role succeeds (no PATCH failure logged), then the follow-up `GET /users/roles` returns 404 and the alert says "Failed to update role". Defect 3 is **CONFIRMED** in full.
   - **Visual:** in this dialog the "Apply Role" and "Clear All" labels wrap onto two lines inside short buttons, and "Save Permissions" floats to the top right, away from the (empty) permissions it saves.
7. **Reports, Appointment Analytics, 31 Oct to 7 Nov** (`step-07-appt-analytics.png`). Works: Total 7, Completed 1, Cancelled 0, No Show 0, plus Peak Hours.
   - The page's default Revenue Report first fires `/reports/revenue`, which returns **500** (see STORY-009).
   - The story's claim that "today's appointments are excluded by the end-date bug" is **REFUTED for appointments**. With start = end = 2026-11-07 the API returns 7 (today's) appointments; with end = 2026-11-08 it returns 10. Appointment `date` is stored at midnight UTC, so the end day is included. The bug does hit `createdAt` metrics (see STORY-009).
8. **Variations.** ACCOUNTANT, RECEPTION and NURSE all load `/dashboard/reports` and `/dashboard/users` in full by URL: **CONFIRMED** in the STORY-005 matrix. Every role loads Users with all action buttons. For example, NURSE sees 12 rows, each with Edit, Delete, Reset password and Role & Permissions.

## Mobile spot-check (390x844, Users as MANAGER)

`mobile-check.png`: the same as STORY-002. The table scrolls inside its card, with Actions off-screen. Geometry is clean.

## Mapped defects checked live

| Topic defect | Live result |
|---|---|
| 3. `/users/roles` and `/users/permissions` shadowed by `:id`; empty grid; Apply Role alerts failure | **CONFIRMED** (404 "User not found"; empty grid; false failure alert for ADMIN) |
| 5. Reports open to every role | **CONFIRMED** (every role loads the page; Appointment/Patient analytics return data) |
| 15. Users page errors silent | **CONFIRMED** (Edit 403 gives no feedback) |
| 17 (auth topic). MANAGER shown Reset/Users actions the backend refuses | **CONFIRMED** |
| Story step 5: "Only an admin can manage clinic holidays" message | **REFUTED**: generic "Forbidden resource (Reference …)" |
| Story step 7: today's appointments excluded | **REFUTED** for appointment counts (end day included) |

## Flow log

- **Steps.** Ideal: 6. Actual: 9 attempts, 3 of them successful (viewing the list, the Reset dialog text, and the Reports appointment analytics). All 5 write attempts (Edit, Reset, holiday list, holiday add, Apply Role) failed.
- **Hesitation:**
  - After Save on Edit nothing happened. As the persona I could not tell whether it had saved. The dialog never closed.
  - Two stacked identical red errors in Clinic Holidays.
- **Dead ends:** every action on Users except viewing. The UI offers no hint that these are admin-only.
- **Redundancy:** Reports opens on Revenue, which 500s, before she can pick the report she needs.
