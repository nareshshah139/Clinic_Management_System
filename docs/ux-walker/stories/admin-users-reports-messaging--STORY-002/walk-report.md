# Walk report: admin-users-reports-messaging STORY-002, "Onboarding Sowmya, the new nurse, and tripping over the Create User dialog"

**Result: FAIL.** The account is created, but the Status choice is silently dropped, the duplicate-email error is invisible, and New User can open as "Edit User" pre-filled with another person's data.

- **Persona:** ADMIN (`admin@clinic.test`).
- **Walked:** 2026-11-07, 1280x800.
- **Screenshots:** `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/admin-users-reports-messaging--STORY-002/`
- **Script:** `.../scratchpad/ux-walker/scripts/admin/story002.js`
- **Raw results:** `story002-results.json`
- **User created:** Sowmya Reddy, `sowmya.reddy.11701@linae.in`, phone 9848011701, NURSE. This is a fresh user; no seeded user was modified.

## Steps

1. **Open Users** (`step-01-users.png`). The page shows "Users Management", then "Users", then "All Users". These are three stacked headings with three near-identical descriptions (F-002-05).
   - The table shows raw enums (LAB_TECH, ACCOUNTANT, RECEPTION).
   - Each row stacks Edit/Delete, Reset password and Role & Permissions on three lines. Every row measures 137px tall, so only about 3 users are visible above the fold at 800px (F-002-06).
   - There is no search or filter.
   - Geometry: clean. The only flag is natural width variance between Clinic Holidays and New User.
2. **Edit Riya, then Cancel** (`step-02-edit-riya.png`). The "Edit User" dialog opens pre-filled with Riya / Sharma / reception@clinic.test / 9000000003 / Receptionist / Active. Cancel closes it.
3. **New User** (`step-03-newuser-after-cancel.png`). The dialog title reads **"Edit User"**, still holds Riya's data, and the button reads **"Save"**. Clicking Save would overwrite Riya. Mapped defect 14 is **CONFIRMED**.
4. **Reload, then New User** (`step-04-create-dialog.png`). "Create User" opens with First/Last Name, Email, Phone, Role, Status and "Password (8-20 chars)".
   - Role options: Admin, Doctor, Nurse, Receptionist, Manager, Pharmacist. ACCOUNTANT, LAB_TECH and OWNER are missing, although the table already contains such users.
   - Status options: Active, Inactive, Suspended, Pending.
   - Geometry: clean.
   - **Variation (phone blank):** a browser `alert('Phone number is required')` fires (`step-04b-phone-blank.png`). **CONFIRMED.**
5. **Duplicate email** (`step-05-duplicate-email.png`). Filled Sowmya / Reddy / `nurse@clinic.test` (an existing email) / phone / Nurse / **Pending** / password, then clicked Create.
   - `POST /users` returned **409** "User with this email already exists".
   - The UI shows nothing: no toast, no inline error. The dialog stays open and the button re-enables.
   - The only trace is Next's dev "1 Issue" badge, from an unhandled promise rejection with PAGEERROR "User with this email already exists".
   - Mapped defect 15 is **CONFIRMED** (F-002-02).
6. **Correct the email and Create** (`step-06-created.png`). The dialog closes and the row "Sowmya Reddy · NURSE · **ACTIVE**" appears. The Pending choice was dropped. Mapped defect 2 is **CONFIRMED** (F-002-01).
   - **Extra check:** Edit Sowmya, set Status to **Suspended**, Save (`step-06b-edit-new-user.png`, `step-06c-after-suspend-save.png`). The dialog closes without error and the row still reads **ACTIVE**. There is no way to suspend or deactivate a user from the UI.
7. **Monday sign-in.** Not re-walked. The NURSE sidebar (Dashboard, Patients, Appointments, Visits, Rooms) is confirmed in auth-shell-navigation STORY-005.

## Mobile spot-check (390x844, Users)

`mobile-check.png`: the headings and buttons stack fine. The table scrolls horizontally inside its card. Only the Name and part of the Email column are visible; Role, Status and Actions are off-screen with no scroll affordance. Geometry is clean (no page overflow) (F-002-07).

## Mapped defects checked live

| Topic defect | Live result |
|---|---|
| 2. Status select is a no-op | **CONFIRMED** on create (Pending → ACTIVE) and on edit (Suspended → ACTIVE) |
| 14. New User opens as "Edit User" after cancelling an edit | **CONFIRMED** |
| 15. Users page errors are silent | **CONFIRMED** (409) |
| Variation: Quick Guide says "Add User" | Not re-checked (the guide is behind a Quick Guide button) |

## Flow log

- **Steps.** Ideal: 4. Actual: 7, adding the reload detour forced by defect 14, the retry after the invisible 409, and guessing the email cause with no message.
- **Hesitation:**
  - After clicking Create on the duplicate, nothing happened. As the persona I could not tell whether it was saving, failed, or hung.
  - The dialog title "Edit User" on New User.
- **Re-entry:** after the reload, everything had to be retyped. The dialog keeps stale data only in the wrong case.
- **Redundancy:** the role is shown as enum `NURSE` in the table but "Nurse" in the dialog. The page has 3 headings for one table.
