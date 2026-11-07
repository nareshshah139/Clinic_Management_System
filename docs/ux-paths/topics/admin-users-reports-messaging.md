# Topic: admin-users-reports-messaging

Phase 2 story agent output for the ux-paths skill. Scope: Users CRUD, roles and permissions, password reset codes, Working Hours, Clinic Holidays, doctor WhatsApp settings (Users page and header "My Settings"), the WhatsApp Template Editor, Reports & Analytics with exports, and what MANAGER, ACCOUNTANT, RECEPTION and DOCTOR users run into on these screens.

Main code read: `frontend/src/components/users/UsersManagement.tsx`, `ResetCodeButton.tsx`, `DoctorAvailabilitySettings.tsx`, `frontend/src/app/dashboard/users/page.tsx`, `frontend/src/app/dashboard/reports/page.tsx`, `frontend/src/components/layout/header.tsx` (My Settings), `frontend/src/components/layout/sidebar.tsx`, `backend/src/modules/users/*`, `backend/src/modules/auth/password-reset.service.ts`, `backend/src/modules/doctor-availability/*`, `backend/src/modules/whatsapp-templates/*`, `backend/src/modules/notifications/notifications.service.ts`, `backend/src/modules/reports/*`, `backend/src/shared/guards/*`.

Seed logins (password `password123`): `admin@clinic.test` (Admin User, ADMIN), `shravya@clinic.test` (Dr. Shravya, DOCTOR), `praneeta@clinic.test` (Dr. Praneeta Jain, DOCTOR), `reception@clinic.test` (Riya Sharma, RECEPTION). Today in the stories is Saturday 7 Nov 2026, at a skin and hair clinic in Jubilee Hills, Hyderabad.

---

## STORY-001: Riya is locked out before the Saturday rush and the admin gives her a reset code

**Type**: short
**Topic**: admin-users-reports-messaging
**Persona**: Admin (front-desk lead covering IT), then the receptionist who is locked out
**Goal**: Get Riya Sharma back into ClinicMS before the 10:00 walk-ins without the admin ever learning her new password
**Preconditions**: Riya (`reception@clinic.test`) has forgotten her password. The admin is signed in on the back-office PC. Riya is standing at the admin's desk.
**Ideal path**: 6. Admin: open Users, click Reset password on Riya's row, confirm, read out the code (3 to 4 actions). Riya: open the reset page, type the code and new password twice, submit (2 actions). No shorter path is safe because the code has to be handed over in person.
**Alternate paths**: Login page link "enter your reset code" and the direct URL `/reset-password` reach the same reset form. The server operator script (`PasswordResetService.issueResetCodeAsOperator`) can issue a code without the UI. No self-service "forgot password" email exists, and no "change my password" screen exists for a signed-in user (`POST /users/:id/change-password` has no UI).

### Steps
1. Admin clicks **Users** in the sidebar (Admin group) → `/dashboard/users` loads with the "Users Management" header ("Manage clinic staff and user accounts"), a **Quick Guide** button, and the "All Users" table (Name, Email, Role, Status, Actions).
2. Admin finds "Riya Sharma · reception@clinic.test · RECEPTION · ACTIVE" and clicks **Reset password** (key icon) → dialog "Reset password for Riya Sharma" warns: "Only issue a code to Riya Sharma after confirming in person that they are asking… Issuing a code cancels any earlier code for them. It is recorded in the audit log."
3. Admin looks up at Riya, confirms it's really her, and clicks **I have confirmed who is asking. Create code** → the button reads "Creating code…", then the dialog shows a large monospace code such as `K7MQ-4XRT`, the expiry ("expires 8 Nov 2026, 9:42 am" style), and the instructions. The note says the code is shown only once.
4. Admin clicks **Copy code** (nothing visible confirms the copy) and also reads it aloud. Admin closes the dialog. The code stays valid ("Closing this window does not cancel it").
5. On the reception PC Riya opens `/login` and clicks **enter your reset code** → `/reset-password` "Set a new password".
6. Riya types `k7mq 4xrt` (lower case, with a space). The backend normalises case, spaces and dashes. She enters a new password twice and clicks **Set new password** → "Password updated. Taking you to sign in…" and about 2.5 s later she is sent to `/login`.
7. Riya signs in with `reception@clinic.test` and the new password → Dashboard.

### Variations
- **Admin reads the code wrong**: Riya submits a mistyped code → "This reset code is invalid or has expired. Ask an admin for a new one." The endpoint is throttled to 5 attempts per minute.
- **Admin issues a second code by accident** (clicks Reset password again): the first code silently stops working. Riya, still holding the first one, gets the invalid/expired error.
- **Doctor locked out**: the admin can reset Dr. Praneeta, because ADMIN outranks DOCTOR in `ROLE_RANK`.
- **Admin tries to reset another admin or themselves**: the code step fails in the dialog with "You cannot reset the password of a user at or above your role." The Reset password button still shows on every row, including the admin's own.

### Edge Cases
- Password longer than 20 characters: allowed on `/reset-password` (8–72 chars), but the Create User dialog and the change-password DTO cap passwords at 20. The two limits disagree.
- Code expiry is 24 h. A code issued on Friday evening is dead by Sunday morning.
- A user with `isActive=false` can't get a code ("User not found"). A user whose `status` is SUSPENDED but `isActive=true` can get a code and reset, then sign-in still fails with "Account suspended".

---

## STORY-002: Onboarding Sowmya, the new nurse, and tripping over the Create User dialog

**Type**: medium
**Topic**: admin-users-reports-messaging
**Persona**: Admin onboarding new staff on a Saturday
**Goal**: Create a working NURSE account for Sowmya Reddy before her first shift on Monday
**Preconditions**: Signed in as `admin@clinic.test`. Sowmya's details: phone 98480 12345, email `sowmya.reddy@linae.in`. An old account with `sowmya.r@linae.in` from her internship last year also exists.
**Ideal path**: 4. Open Users, click New User, fill name/email/phone/role/password, click Create.
**Alternate paths**: none found in the UI. `POST /users` is the only create path. Users cannot be invited, and there is no CSV import.

### Steps
1. Admin opens **Users** → "All Users" table.
2. Before that, the admin clicks **Edit** on Riya's row to check how her phone is formatted → "Edit User" dialog opens pre-filled. The admin clicks **Cancel**.
3. Admin clicks **New User** (plus icon) → the dialog title reads **"Edit User"**, not "Create User", and still holds Riya's data. Cancel only closes the dialog and never resets the form (`UsersManagement.tsx:487`). The admin is confused. To get a blank form they have to reload the page or save Riya unchanged.
4. After reloading, the admin clicks **New User** → "Create User": First Name, Last Name, Email, Phone, Role (Admin / Doctor / Nurse / Receptionist / Manager / Pharmacist), Status (Active / Inactive / Suspended / Pending), "Password (8-20 chars)".
5. Admin fills Sowmya / Reddy / `sowmya.r@linae.in` (wrong, old email) / `9848012345` / Nurse / Status "Pending" ("she starts Monday") / password `Linae@2026`, then clicks **Create** → the backend returns 409 "User with this email already exists". The UI shows nothing: no toast, the dialog stays open, the button re-enables. `submit()` has no catch.
6. Admin guesses, corrects the email to `sowmya.reddy@linae.in`, and clicks **Create** → the dialog closes and the list reloads (skeleton "Loading users…") with "Sowmya Reddy · NURSE · **ACTIVE**". The "Pending" choice was dropped.
7. Admin hands Sowmya her credentials. On Monday she signs in with `9848012345` or her email and sees Dashboard, Patients, Appointments, Visits and Rooms.

### Variations
- **Phone left blank** → browser `alert('Phone number is required')`. The backend treats phone as optional.
- **Password `clinic1`** (7 chars) → `alert('Password must be 8-20 characters')`.
- **Role "Therapist"**: the Users Management Guide lists "Doctor, Nurse, Therapist, Reception, Admin, or Owner", but neither Therapist nor Owner is in the Role select. ACCOUNTANT and LAB_TECH can't be chosen either.
- **Quick Guide** says "Click 'Add User'" (the button is "New User") and "Edit user information by clicking on a user row" (rows aren't clickable). It also promises "View user activity and assignment history", which doesn't exist.

### Edge Cases
- Status in the Create/Edit dialog never reaches the database. `CreateUserDto` and `UpdateUserDto` have no `status` field, the global ValidationPipe whitelists it out, and create forces `ACTIVE`. See Defects.
- The Users table shows the raw enum (`RECEPTION`) while the dialog says "Receptionist". The same fact is labelled two ways.
- Dashboard admin cards (Total Users / Active Users from `/auth/statistics`) give a different count from this table. The cards count `isActive=true` users only and show the same number for both. The user count appears on two surfaces with different numbers.

---

## STORY-003: Promoting Mohammed from Pharmacist to Manager through "Role & Permissions"

**Type**: medium
**Topic**: admin-users-reports-messaging
**Persona**: Admin, cautious, wants to see exactly which permissions change
**Goal**: Make pharmacist Mohammed Irfan the clinic MANAGER and give him `reports:*` plus his existing pharmacy rights
**Preconditions**: Mohammed exists as PHARMACIST with an explicit permission list (backfilled by `scripts/seed_rbac.ts`). Role rows exist in the `roles` table. Without them "Apply Role" returns "Role not found".
**Ideal path**: 4. Open Users, open Role & Permissions on his row, pick Manager, tick any extra permissions, save once. A good UI would apply role and permissions with one Save.
**Alternate paths**: (a) **Edit** → Role select → **Save** (`PATCH /users/:id`) changes the role but keeps his existing explicit permissions. (b) **Role & Permissions** → **Apply Role** (`PATCH /users/:id/role`) changes the role and overwrites his permissions with the role defaults. The two routes to the same goal leave different results.

### Steps
1. Admin opens **Users**, finds "Mohammed Irfan · PHARMACIST" and clicks **Role & Permissions** (gear icon) → dialog "Role & Permissions". Left: Role select pre-set to Pharmacist, buttons **Apply Role** and **Clear All**, "Permissions — Selected: 0". Right: **empty**, with no permission groups and no checkboxes.
2. Admin expected checkboxes such as `pharmacy:*` and `reports:*`, and wonders whether the dialog is still loading. Nothing loads. `GET /users/roles` and `GET /users/permissions` both 404 because `GET /users/:id` is declared first and captures them, and the dialog's catch silently sets both lists to `[]`.
3. Admin picks **Manager** and clicks **Apply Role** → the role does change (the list behind the dialog refetches and shows MANAGER), but then `alert('Failed to update role. Please try again.')` appears, because the follow-up `getRoles` call 404s.
4. Admin believes it failed and clicks **Apply Role** again → same alert. Mohammed's permissions are now the MANAGER defaults (`appointments:*`, `billing:*`, `inventory:*`, `pharmacy:*`, `reports:*`, `users:read`, `users:update`).
5. Admin clicks **Save Permissions** to "make it stick" → `alert('Permissions updated successfully!')`, but it saved `[]`, the empty selection, wiping the explicit list. MANAGER role defaults still apply through the guard's union with `Role.permissions`, so the damage isn't visible yet.
6. Admin closes the dialog. The table shows "MANAGER".
7. Mohammed is still signed in on the pharmacy PC and keeps PHARMACIST access, sidebar and backend checks alike, until he logs out. The role comes from his JWT (`/auth/me`), not the database.

### Variations
- **Edit path instead**: Edit → Role "Manager" → Save. The role changes and his old pharmacist permission JSON is kept. No alert either way.
- **Per-group buttons**: when the grid does load (for example after the route-order fix), each resource group has **Select all** / **Clear**, and the left side has **Clear All**. The three "clear" labels are easy to confuse.

### Edge Cases
- The Role select offers Admin to an ADMIN or DOCTOR operator. The backend accepts any enum including OWNER (`AssignRoleDto`), with no rank check. See Defects (privilege escalation).
- MANAGER's seeded permissions include `users:update`, but every Users write endpoint is `@Roles(OWNER, ADMIN)`, so the permission does nothing.

---

## STORY-004: Kiran resigned. Suspend his login, then try to delete Dr. Praneeta's duplicate account

**Type**: short
**Topic**: admin-users-reports-messaging
**Persona**: Admin handling a resignation on the same day
**Goal**: Stop receptionist Kiran Kumar from signing in, and remove a duplicate test account "Praneeta Jain (old)"
**Preconditions**: Kiran is ACTIVE RECEPTION. The duplicate doctor account has two past appointments.
**Ideal path**: 3. Open Users, change Kiran's status to Suspended (one control), confirm. Delete is one more click plus a confirm.
**Alternate paths**: `PATCH /users/:id/status` exists in the backend, but no UI calls it. The Edit dialog's Status select is the only visible control, and it does nothing (see Edge Cases).

### Steps
1. Admin opens **Users**, clicks **Edit** on "Kiran Kumar" → "Edit User" with Status "Active".
2. Admin sets Status to **Suspended** and clicks **Save** → the dialog closes and the list refreshes. Kiran's row still reads **ACTIVE**. The admin assumes the list is stale and reloads, and it still reads ACTIVE.
3. Admin tries **Inactive** → same result. Kiran can still sign in.
4. Admin gives up on status and clicks **Delete** on Kiran → browser `confirm('Delete user?')` → OK → Kiran disappears from the list. His sessions keep working until the JWT expires (role/identity live in the token).
5. Admin clicks **Delete** on "Praneeta Jain (old)" → confirm → the backend returns 400 "Cannot delete user with existing appointments or visits". The UI shows nothing: no toast, the row stays. `onDelete` has no catch.

### Variations
- **Admin deletes their own row**: allowed by the backend (no self-check). The next `/users/:id` lookup 404s, the layout falls back to a "minimal identity", and the admin keeps working on the old token until it expires.
- **Delete a user with audit-log or invoice history**: the hard `prisma.user.delete` may hit foreign keys and return a 500, which is also swallowed.

### Edge Cases
- There is no way to deactivate a doctor who has appointment history: deletion is blocked and status can't be changed.

---

## STORY-005: Closing the clinic for Diwali tomorrow and Sankranti in January

**Type**: medium
**Topic**: admin-users-reports-messaging
**Persona**: Admin, a little panicked because Diwali is tomorrow
**Goal**: Mark Sunday 8 Nov 2026 (Diwali) and 14–15 Jan 2027 (Sankranti) as clinic holidays so nobody can book them, then fix a wrong entry
**Preconditions**: Signed in as admin. Two patients (Ananya Rao 11:00, Venkat Goud 11:30) are already booked with Dr. Shravya on 8 Nov.
**Ideal path**: 5. Open Users, click Clinic Holidays, set From/To and reason, click Add clinic holiday, repeat for the second holiday (2 + 3 actions, the second reusing the open dialog).
**Alternate paths**: **Create**: only Users → **Clinic Holidays** (`BranchHolidaySettings`). **Delete**: Users → Clinic Holidays (trash icon) and also Users → **Working Hours** on any doctor. That dialog runs with `canManageHolidays`, and branch holidays show in each doctor's "Leave and blocked time" list with a trash icon. A doctor's own My Settings lists the holiday read-only.

### Steps
1. Admin opens **Users** and clicks **Clinic Holidays** (top right, next to New User) → dialog "Clinic Holidays": "Holidays close the clinic for all doctors. Appointments cannot be booked on them." "No upcoming holidays." Below is a dashed form with **From**, **To**, an **All day** checkbox (ticked), "Reason (optional)" and **Add clinic holiday**.
2. From and To default to today (7 Nov). Admin sets both to 8 Nov 2026, types reason "Diwali" and clicks **Add clinic holiday** ("Adding…") → the list shows "8 Nov 2026 · Diwali" (span text from `timeOffSpan`).
3. Admin sets From 14 Jan 2027. The To field jumps to match because From > To, and the admin changes To to 15 Jan 2027. Reason "Sankranti". **Add clinic holiday** → the second row appears.
4. Admin types a Republic Day row but sets To before From with the keyboard → "The end date must be on or after the start date." The admin fixes it to 26 Jan 2027 and adds "Republic Day".
5. Admin realises the clinic will actually open on Republic Day for the laser camp and clicks the trash icon "Remove holiday 26 Jan 2027" → the row disappears with no confirm.
6. Admin closes the dialog and checks **Appointments** for Dr. Shravya on 8 Nov → new bookings are refused for that day. Ananya's and Venkat's existing appointments **are still on the calendar**. Nothing warned the admin about them, and they have to be rescheduled by hand.
7. Dr. Shravya, signed in, opens the header settings icon → **My Settings** → "Leave and blocked time" lists "Clinic holiday · 8 Nov 2026 · Diwali" with no remove button.

### Variations
- **Part-day holiday**: untick **All day** → Start time/End time (defaults 13:00–14:00), for example closing at 14:00 on Diwali eve.
- **More than a year** (From 1 Jan 2027, To 31 Jan 2028) → 400 "Time off cannot exceed one year", shown in red under the form.
- **MANAGER opens Clinic Holidays** → the list call is `@Roles(ADMIN, DOCTOR, NURSE, RECEPTION)` and returns 403. The red message shows the API error. Add also 403s ("Only an admin can manage clinic holidays").

### Edge Cases
- **Wrong-dialog delete**: in Users → Working Hours for Dr. Praneeta, the Diwali row has a trash icon. Clicking it to "give Dr. Praneeta the day back" deletes the clinic-wide holiday for every doctor, with no confirm.
- The holiday shows on three surfaces: the Clinic Holidays dialog, every doctor's Working Hours dialog, and the doctor's own My Settings.
- An error left in the dialog stays after the next successful load (`setError` is never cleared on success).

---

## STORY-006: Setting Dr. Praneeta's split shifts and a conference leave

**Type**: medium
**Topic**: admin-users-reports-messaging
**Persona**: Admin entering a new doctor roster. Dr. Praneeta, who later checks her own settings
**Goal**: Mon–Fri 10:00–13:00 and 16:00–20:00, Saturday 10:00–14:00, Sunday off. Plus leave on 20–22 Nov for the IADVL conference in Kochi
**Preconditions**: Dr. Praneeta has no configured hours. The amber note "No hours set yet; the clinic default 09:00-18:00 applies every day. Save to set a schedule." is shown.
**Ideal path**: 7. Open Users, Working Hours, add Monday's two shifts, copy to Tue–Fri, add Saturday, Save hours, add the leave (date range + Add leave).
**Alternate paths**: Dr. Praneeta can do the same from the header settings icon → **My Settings** (same `DoctorAvailabilitySettings` component, without holiday deletion). This duplicates Users → Working Hours.

### Steps
1. Admin opens **Users**, clicks **Working Hours** on "Praneeta Jain · DOCTOR" (the button shows only on DOCTOR rows) → dialog "Availability: Dr. Praneeta Jain": "Weekly working hours (IST)" with Sunday through Saturday, each showing "Day off" and a **+ Shift** button.
2. Admin clicks **+ Shift** on Monday → 09:00–13:00 appears and the admin edits it to 10:00. Clicks **+ Shift** again → 14:00–18:00 appears and is edited to 16:00–20:00.
3. Admin clicks **Copy Monday to Tue–Fri** → Tuesday through Friday mirror Monday.
4. Admin adds Saturday 10:00–14:00 and leaves Sunday as "Day off".
5. Admin mistypes Wednesday's second shift as 12:00–20:00 → **Save hours** → red "Wednesday: shifts overlap". The admin fixes it to 16:00 → **Save hours** ("Saving…") → "Working hours saved." The amber note disappears.
6. Under "Leave and blocked time" the admin picks Type **Leave**, From 20 Nov, To 22 Nov, All day, Reason "IADVL conference, Kochi" → **Add leave** → the row shows "Leave · 20 Nov – 22 Nov 2026 · IADVL conference, Kochi" with a remove icon.
7. Admin adds **Blocked time** on 12 Nov 13:00–14:00 (untick All day), Reason "Staff training" → **Add blocked time**.
8. Dr. Praneeta signs in (`praneeta@clinic.test`), opens the settings icon → **My Settings** → sees the same hours, leave and blocked time, plus Doctor signature, Prescription letterhead and the WhatsApp toggles.

### Variations
- **Remove every shift** → "Add at least one shift" (front end and backend).
- **Doctor edits another doctor** (Dr. Shravya calling the API for Praneeta) → 403 "You can only change your own hours and time off".

### Edge Cases
- The Working Hours button isn't shown for non-DOCTOR roles, so a NURSE has no roster here.
- Availability shows on two surfaces (Users → Working Hours and the doctor's My Settings) with different capabilities: only the admin dialog can delete holidays.

---

## STORY-007: Turning on WhatsApp confirmations for Dr. Shravya, from both settings screens

**Type**: medium
**Topic**: admin-users-reports-messaging
**Persona**: Admin with the clinic's Meta WhatsApp Business credentials. Dr. Shravya, who wants her patients to get confirmations
**Goal**: Have every appointment booked with Dr. Shravya send a WhatsApp confirmation from her own WhatsApp number, using the approved template `appointment_confirm_te` (Telugu)
**Preconditions**: Admin has a Phone Number ID (`109876543210987`) and a long-lived access token from Meta Business Manager. Server-level `WHATSAPP_TOKEN` may or may not be set. Patient Ananya Rao's phone is stored as `9849098490`.
**Ideal path**: 5. Open Users, WhatsApp Settings on her row, toggle auto-confirm, enter phone ID and token, toggle template and pick it, Save.
**Alternate paths**: Dr. Shravya's header settings icon → **My Settings** has the same "Send WhatsApp on appointment creation" and "Use WhatsApp Template" toggles, an "Approved Templates" picker, Template Name and Language Code, but **no** Phone Number ID or Access Token fields. Users → WhatsApp Settings has phone ID and token but only free-text template name/language, no picker. The two surfaces overlap but neither covers everything.

### Steps
1. Admin opens **Users**, clicks **WhatsApp Settings** on "Shravya Dermatologist · DOCTOR" (DOCTOR rows only) → "Doctor WhatsApp Settings".
2. Admin toggles **Send WhatsApp on appointment creation** on ("Automatic confirmation to patients when this doctor is assigned." / "Requires backend WhatsApp credentials. Uses text messages by default.").
3. Admin enters **Doctor WhatsApp Phone Number ID** `109876543210987` and pastes the token into **Doctor WhatsApp Access Token** ("Leave blank to keep existing").
4. Admin toggles **Use WhatsApp Template** → **Template Name** `appointment_confirm_te`, **Language Code** `te` → **Save** → toast "Saved — WhatsApp settings updated".
5. Admin reopens the dialog: the token field is blank on purpose ("do not prefill token for security"). Meanwhile the token is returned in plain text inside `metadata` by `GET /users` to every signed-in staff member (see Defects).
6. Dr. Shravya signs in, opens the header settings icon → **My Settings** → both toggles are on. Under Use WhatsApp Template an **Approved Templates** select loads templates for touchpoint `appointment_confirmation`. If none exist it says "No active appointment templates were found. You can still enter the template name and language manually."
7. Dr. Shravya changes Language Code to `te_IN` → **Save** → validation passes (`^[a-z]{2}(?:[_-][A-Za-z]{2,5})?$`) → toast "WhatsApp preferences updated."
8. Riya books Ananya with Dr. Shravya → the backend sends to `+9849098490` (it only prefixes "+", no `91`). Meta rejects it, the failure is only logged, and nobody at the desk finds out.

### Variations
- **Template on, name empty** → warning toast "WhatsApp settings incomplete — Choose a WhatsApp template or turn template mode off."
- **Language `telugu`** → "Use a valid WhatsApp language code, such as en, en_US, or hi."
- **Admin or reception opens My Settings** → only **Close** and **Save** buttons. The dialog body is empty for non-doctors.

### Edge Cases
- The same WhatsApp switches render on two surfaces (Users → WhatsApp Settings and header My Settings) and write the same `metadata` keys. The server merges metadata keys, so neither erases the other's unrelated keys.
- A DOCTOR may call `PATCH /users/:id/profile` on any user (`requireSelfOrManager` treats DOCTOR as a manager), so one doctor could overwrite another doctor's WhatsApp token.

---

## STORY-008: Writing Telugu and English appointment templates with the AI generator and sending a test

**Type**: long
**Topic**: admin-users-reports-messaging
**Persona**: Admin who also runs the clinic's Instagram and patient communication, comfortable with tools
**Goal**: Create a branch-wide "Appointment Confirmation" template (English) and a Telugu "Appointment Reminder", check them on their own phone (+91 98480 22334), then tidy up an old template
**Preconditions**: Signed in as admin. `OPENAI_API_KEY` set on the server. WhatsApp Cloud API configured. Dr. Shravya has a personal template "shravya_followup".
**Ideal path**: 12. Open the template editor (3), generate English (2), save (1), switch to New and generate Telugu (3), save (1), send a test (2). Opening it should take one click from Users, not three.
**Alternate paths**: The **WhatsApp Template Editor** is reached only from Users → a DOCTOR row → **WhatsApp Settings** → Templates **Manage**. There is no top-level entry, and a clinic without a doctor row can't open it. Doctors can't open the editor at all: their My Settings only *selects* existing templates.

### Steps
1. Admin opens **Users** and clicks **WhatsApp Settings** on Dr. Shravya's row, even though they want a clinic-wide template → "Doctor WhatsApp Settings".
2. In the "Templates" box ("Create and customize WhatsApp templates for common actions.") admin clicks **Manage** → "WhatsApp Template Editor" (900 px) opens over the WhatsApp dialog. Left: "Existing Templates" with a **New** button. Right: Name, Touchpoint, Language, Ownership, Active switch, Generator Hints, Designer (WYSIWYG) with **B**/**I**/**U**, Variables chips, Plain Text (fallback), **Close** / **Save Template**, and a "Send Test" box.
3. The Existing list shows "shravya_followup · appointment_reminder · en • Mine". It is Dr. Shravya's template, but the admin's view labels every owned template "Mine".
4. Admin types Name "Appointment Confirmation", Touchpoint **Appointment Confirmation**, Language `en`, Ownership **Branch Template (Admin)**.
5. In **Generator Hints** admin types "Linaé Skin & Hair Clinic, Road No. 36 Jubilee Hills, call 040-2355 0000, signature: Team Linaé" and clicks **Generate** ("Generating…").
6. Expected: toast "Template generated — Review and save if it looks good." and the designer fills with text containing `{{patient_name}}`, `{{appointment_date}}`. Actual: the request is rejected with 400 before reaching OpenAI, and the toast says "Generation failed" with a validator message. See Defects (undecorated body classes).
7. Admin writes the message by hand in the designer: "Dear ", clicks the `{{patient_name}}` chip, ", your appointment with " `{{doctor_name}}` " is on " `{{appointment_date}}` " at " `{{appointment_time}}` ". Token: " `{{queue_token}}` ". Plain Text auto-fills.
8. Admin wants a `{{clinic_name}}` variable, types `clinic_name` in "Add variable (letters/numbers/underscore)" and clicks **Add** → nothing happens. The button reads `document.activeElement`, which is the button itself. Pressing **Enter** in the input adds the chip.
9. Admin clicks **Save Template** → same 400, so the template is not saved. The front end has no catch, so no alert appears. If it had worked, `alert('Template saved')` would show.
10. Admin clicks **New** to start the Telugu reminder → the form fields reset but the designer keeps the old text until the next render (it uses `dangerouslySetInnerHTML` on a contentEditable).
11. Admin tries **Send Test** → it's disabled ("Save the template before sending a test"), because nothing has been saved.
12. Admin clicks **Edit** on "shravya_followup" (existing), enters `+919848022334` in "Test Phone (E.164)" (placeholder shows a US number, `+15551234567`) and clicks **Send Test** → 400 again. On a build where validation passes, the UI shows green "Test sent (check your WhatsApp)" **even when the server has no WhatsApp credentials or Meta rejects the template name**, because `NotificationsService.sendWhatsApp` logs and returns instead of throwing.
13. Admin clicks **Delete** on an obsolete template → `confirm('Delete this template?')` → OK → the list refreshes. Delete has no body, so it works.
14. Admin clicks **Close** on the editor, then **Close** on the WhatsApp dialog.

### Variations
- **Placeholder not declared**: designer text contains `{{amount_due}}` but the chip isn't listed → `alert('Add these variables or remove placeholders: amount_due')`.
- **Name or Plain Text empty** → `alert('Name and Plain Text are required')`.
- **OpenAI not configured** (after validation is fixed) → toast "Generation failed — AI generation is not configured". **Timeout** → "Template generation timed out. Please try again." (15 s client and server).
- **Ownership "My Template" chosen by the admin from Dr. Shravya's dialog**: the template is owned by the admin, not Dr. Shravya. Appointment sends for Dr. Shravya resolve templates by her id plus branch templates, so this "personal" template is never used for her.

### Edge Cases
- **Send Test** sends the Meta *template name* with every variable blank ("Variables will be sent blank unless you extend UI mapping"). The designer text is never sent. A local template name with spaces, like "Appointment Confirmation", can never match a Meta-approved template.
- Ownership can't be changed after creation (update ignores `ownerScope`).
- Template HTML from other users is rendered in the admin's browser with `dangerouslySetInnerHTML`, a latent XSS once saving works.

---

## STORY-009: Month-end revenue review: the Revenue Report says ₹0 while the pharmacy took ₹3.4 lakh

**Type**: medium
**Topic**: admin-users-reports-messaging
**Persona**: Clinic owner-partner (ADMIN login) doing the October close with the accountant on the phone
**Goal**: Get October 2026 revenue with GST and the payment-mode split (Cash / UPI / Card) and cross-check against pharmacy invoices
**Preconditions**: In October, the pharmacy desk confirmed about 410 pharmacy invoices (≈ ₹3,40,000) through Pharmacy Billing. Consultation fees aren't billed through any reachable UI (clinic billing `/dashboard/billing` redirects to pharmacy).
**Ideal path**: 3. Open Reports, set the date range to October, read the Revenue Report. Generation already runs automatically on every change.
**Alternate paths**: Pharmacy Invoices list (`/dashboard/pharmacy/invoices` "Total Amount", or Inventory → Sales → Patient invoice history) shows pharmacy totals. Dashboard/system statistics use `NewPayment`. Inventory → Purchases → GST & monthly reports (ComplianceCenter) shows GST. Four places report "money", each from a different table.

### Steps
1. Owner clicks **Reports** (sidebar Admin group) → "Reports & Analytics" / "Generate comprehensive reports and analyze your clinic's performance". It shows a "System Alerts" strip (Overdue Invoices, Low Stock, Expiry Alerts, Pending Payments, Upcoming Appointments), six report cards (Revenue Report selected), a Date Range pair defaulting to the last 30 days, **Generate Report**, and an **Export** select. The Revenue Report loads on its own.
2. Owner sets the start date to 01-10-2026 → the report regenerates immediately (skeleton). Sets the end date to 31-10-2026 → it regenerates again. The owner never needs **Generate Report**, though the Quick Guide says "Click 'Generate Report' to create the report".
3. Cards read **Total Revenue ₹0.00, GST Amount ₹0.00, Net Revenue ₹0.00, Total Invoices 0**. No "Payment Mode Breakdown" or "Top Performing Doctors" sections appear.
4. Owner opens **Pharmacy Invoices** in another tab → Total Amount ≈ ₹3,40,000 for "This Month" filters, a mismatch. The Revenue Report reads only the legacy clinic `Payment` table, which nothing in the app writes. See Defects.
5. Owner switches to **Doctor Performance** → doctors are listed with appointment counts, but every revenue figure is ₹0 (same legacy table).
6. Owner switches to **Payment Analytics** → total payments 0, success rate 0.0%.
7. Owner switches to **Patient Analytics** → Total Patients, New Patients and Returning Patients look plausible. "Avg Age" shows a number built from each bucket's *lower bound* (0-17 counts as 0, 18-30 as 18). It reads young (for example 24 when the real mean is 33).
8. Owner sets start = end = 31-10-2026 to look at Diwali-week Saturday alone → "No data"-style zeros for payments and visits, because the end date is parsed as midnight UTC and excludes the whole day.

### Variations
- **Seeded data only**: with the demo seed, the legacy `payment` rows from `scripts/seed.ts` appear, so the report looks alive in dev and stays at ₹0 for real pharmacy sales.
- **Date-range invalid** (start after end) → no validation, just empty results.
- **API error** → it's swallowed into `console.error`, so the card shows the previous report or "No data available for the selected period".

### Edge Cases
- System Alerts data (`/reports/alerts`) appears on three surfaces: this page's strip, the Dashboard "System Alerts" card, and the header notifications bell.
- The default date range uses `toISOString()` (UTC). Between 00:00 and 05:30 IST "today" is yesterday.

---

## STORY-010: Exporting the Patient Analytics report for the auditor, in CSV, then PDF, then Excel

**Type**: short
**Topic**: admin-users-reports-messaging
**Persona**: Admin preparing a file for the clinic's CA
**Goal**: Download the October Patient Analytics report as CSV (for Excel) and a PDF copy for the file
**Preconditions**: On Reports with Patient Analytics selected and October set.
**Ideal path**: 2. Open the Export select, pick CSV, and the file downloads (repeat once for PDF).
**Alternate paths**: none found. Patients → **Export CSV** exports the patient list, not the analytics. Pharmacy and compliance have their own exports ("Export all source rows").

### Steps
1. Admin clicks the **Export** select → options JSON, CSV, PDF, Excel.
2. Admin picks **CSV** → nothing downloads and no message appears. `POST /reports/export` returns 400 because `reportType` and `exportFormat` lack class-validator decorators and are whitelisted away ("Unsupported report type: undefined"). Even with that fixed, the page sends `PATIENTS`, while the backend expects `PATIENT`.
3. Admin picks **CSV** again to retry → nothing happens at all. The select already holds "CSV", so `onValueChange` doesn't fire.
4. Admin picks **PDF** → the same silent failure. When export works, the PDF path builds its buffer synchronously right after `doc.end()`, before PDFKit has emitted any data, so the download is a 0-byte `PATIENT-report-<timestamp>.pdf`.
5. Admin picks **Excel** → the same silent failure. Admin falls back to copying numbers from the screen.

### Variations
- **Revenue Report export**: `REVENUE` matches the backend name, but the field-stripping still causes a 400.
- **JSON** is the only format that would contain the full breakdowns. CSV, PDF and Excel export only the summary and trend rows (`prepareRowsForCsv`).

### Edge Cases
- Exports are returned as `data:` URLs of the whole file. Large inventory exports could hit browser URL limits.

---

## STORY-011: Lakshmi, the new MANAGER, finds most of the Users page is for show

**Type**: medium
**Topic**: admin-users-reports-messaging
**Persona**: Lakshmi Narayana, clinic operations manager (MANAGER role), first week
**Goal**: Add a holiday, fix a receptionist's phone number, and pull last week's appointment numbers
**Preconditions**: Lakshmi's account was created by admin with role Manager. She signs in for the first time.
**Ideal path**: 6. Reports (2) plus Users edit (3) plus Clinic Holidays (1), if MANAGER were allowed to manage users.
**Alternate paths**: none. MANAGER has no other route to user management. Reports is fully available to her.

### Steps
1. Lakshmi signs in → sidebar: Dashboard, Patients, Appointments, Visits, Procedures, Rooms, Inventory, **Reports**, **Users**. No Pharmacy links.
2. **Users** → the full staff list loads (GET is open to every role).
3. She clicks **Edit** on Riya, changes Phone to `9848033445`, **Save** → `PATCH /users/:id` returns 403. The dialog stays open with no message.
4. She clicks **Reset password** on Riya → **I have confirmed who is asking. Create code** → the red error "Forbidden resource" shows in the dialog. The component's own doc comment says it's for "a manager".
5. **Clinic Holidays** → the red error under the empty list comes from the 403 on the holiday list. **Add clinic holiday** → "Only an admin can manage clinic holidays".
6. **Role & Permissions** on Riya → the empty grid (the routes 404). **Apply Role** → `alert('Failed to update role. Please try again.')`.
7. **Reports** → **Appointment Analytics** → last 7 days (start 31-10-2026, end 07-11-2026) → totals, completion/cancellation/no-show rates, peak hours, room utilisation. This works. Today's appointments are excluded by the end-date bug.
8. Lakshmi messages the admin asking why she can see Users but can't do anything there.

### Variations
- **ACCOUNTANT** (Suresh, created via API since the Role select lacks Accountant): the sidebar shows only Dashboard. Typing `/dashboard/reports` loads the full Reports page with no front-end or backend role check. `/dashboard/users` loads the staff list too.
- **RECEPTION** (Riya) typing `/dashboard/reports` sees clinic revenue analytics. **NURSE** likewise.

### Edge Cases
- MANAGER's seeded permission `users:update` suggests she should be able to edit. The endpoint uses `@Roles`, not permissions.

---

## STORY-012: Quarterly access audit: who can do what, and the doctor who made himself Owner

**Type**: long
**Topic**: admin-users-reports-messaging
**Persona**: Clinic owner/admin doing a quarterly access review after an NABH mock audit flagged "excess privileges"
**Goal**: Confirm each role sees only its screens, find accounts with too much power, and lock things down
**Preconditions**: Staff includes 3 doctors (Dr. Shravya, Dr. Praneeta, and locum Dr. Arjun Varma), 2 receptionists, 1 nurse, 1 pharmacist, 1 manager. Dr. Arjun is technical and has been poking at the API with his browser's network tab.
**Ideal path**: 10. Users list review (1), open each suspicious user's role (n×2), fix roles (n), confirm sessions are ended (1). A real audit UI would add an audit-log view, which doesn't exist (the `audit-logs` API is unused).
**Alternate paths**: none in the UI for audit history. Role changes go through Edit (Role select) or Role & Permissions (Apply Role), and the two give different permission results (see STORY-003).

### Steps
1. Admin opens **Users** → All Users. The role column shows `OWNER` on "Arjun Varma". Nobody created that.
2. What happened: Dr. Arjun opened `/dashboard/users` by URL (the sidebar hides Users from DOCTOR, but no page guard exists). `RolesGuard` lets DOCTOR through every `@Roles(OWNER, ADMIN)` check, so `PATCH /users/<his id>/role {"role":"OWNER"}` succeeded. Neither the role DTO nor the service checks rank.
3. Admin opens **Edit** on Arjun → the Role select shows blank (OWNER isn't an option). Admin picks **Doctor** → **Save** → the row shows DOCTOR.
4. Arjun's current session still carries `role: OWNER` in its JWT. The sidebar keeps showing owner items and every backend role check still passes until he logs out or the token expires. The admin has no way to end his session.
5. Admin opens **Reset password** on Arjun → creates a code, hoping to force a re-login. The known gap applies: existing JWTs survive a reset.
6. Admin checks what the receptionist can see: logs in as `reception@clinic.test` in a private window, types `/dashboard/reports` → the full Revenue/Doctor/Payment analytics load. `/dashboard/users` → the staff list, and in DevTools each doctor's `metadata.whatsappAccessToken` in plain text.
7. Admin logs back in as admin and opens **Users** → **WhatsApp Settings** for Dr. Shravya → rotates the token (new value in **Doctor WhatsApp Access Token**) → **Save**. The new token is just as exposed.
8. Admin uses global header search "Riya" → picks the user result → lands on `/dashboard/users?search=<id>`. The list isn't filtered, because UsersManagement ignores `search`, and the admin scrolls to find her.
9. Admin opens **Role & Permissions** for the pharmacist to confirm he can't approve stock edits → the permission grid is empty (route bug), so permissions can't be audited from the UI.
10. Admin reviews **Dashboard** → "Total Users 9 · Active Users 9" (always equal), which doesn't match the 10 rows in Users (one `isActive=false`).
11. Admin writes up the findings: the role escalation path, the token exposure, Reports open to all roles, no session revocation on role change, and no audit-log UI.

### Variations
- **ADMIN self-promotes**: an ADMIN can `PATCH /users/<self>/role {"role":"OWNER"}` or create a new OWNER via `POST /users`. The reset-code rank model ("only an OWNER may reset an OWNER") is bypassed this way.
- **Doctor creates an ADMIN account**: `POST /users` with role ADMIN from a DOCTOR session succeeds.
- **Demoted ADMIN keeps powers**: after admin demotes a departing ADMIN to RECEPTION, that person's open session still has ADMIN in its token until expiry.

### Edge Cases
- `PermissionsGuard` reads the role from the database while `RolesGuard` reads it from the JWT. After a role change the two guards disagree within one request.
- The Role & Permissions dialog never shows OWNER, ACCOUNTANT or LAB_TECH, so accounts in those roles can't be inspected or created from the UI.

---

## Defects noticed while mapping

Each was checked by reading both the caller and the handler. Not re-reported, as already known: password reset doesn't revoke existing JWTs, and changing your own password doesn't void a pending reset code.

1. **Privilege escalation via role assignment (DOCTOR and ADMIN can become OWNER).** `RolesGuard` lets DOCTOR (and ADMIN) pass every `@Roles` check (`backend/src/shared/guards/roles.guard.ts:27-30`). The Users write endpoints are only `@Roles(OWNER, ADMIN)` (`backend/src/modules/users/users.controller.ts:13-14, 62-127`, comment admits "RolesGuard also admits DOCTOR"). `AssignRoleDto`/`CreateUserDto`/`UpdateUserDto` accept any `UserRoleEnum` including OWNER (`backend/src/modules/users/dto/user.dto.ts:49, 125, 240-241`), and `assignRole`/`createUser`/`updateUser` do no rank or self check (`backend/src/modules/users/users.service.ts:86-129, 199-244, 349-392`). A doctor can `PATCH /users/<self>/role {"role":"OWNER"}`. This contradicts the rank model in `password-reset.service.ts:9, 18-24`.
2. **Users "Status" select is a no-op; users can't be suspended from the UI.** The front end sends `status` on create and edit (`frontend/src/components/users/UsersManagement.tsx:116, 467-478`), but neither DTO declares `status` (`user.dto.ts:26-102, 104-185`). The global pipe uses `whitelist: true` (`backend/src/shared/logging/http-observability.ts:166-168`), and create forces `UserStatus.ACTIVE` (`users.service.ts:119`). `PATCH /users/:id/status` (`users.controller.ts:124-128`) has no caller in `frontend/src/lib/api.ts`.
3. **Role & Permissions dialog can't load roles or permissions.** `@Get(':id')` is declared before `@Get('permissions')` and `@Get('roles')` (`users.controller.ts:83` vs `166`, `195`), so `GET /users/roles` and `/users/permissions` (`frontend/src/lib/api.ts:884-890`) hit `findUserById` and 404. The dialog silently shows an empty grid (`UsersManagement.tsx:365-379`). **Apply Role** succeeds but then alerts "Failed to update role" (`UsersManagement.tsx:385-400`). **Save Permissions** then persists `[]` (`UsersManagement.tsx:404-409, 618`).
4. **Doctor WhatsApp access tokens leak to every signed-in user.** The token is saved in user metadata (`UsersManagement.tsx:349`). `formatUser` strips password, reset and Google tokens but returns `metadata` intact (`users.service.ts:918-933`), and `GET /users` and `GET /users/:id` have no role restriction (`users.controller.ts:68-86`). RECEPTION and PHARMACIST can read every doctor's `whatsappAccessToken`, which `appointments.service.ts:175-176` uses as a live Meta credential.
5. **Reports API (and page) open to every role.** `ReportsController` has no `@Roles`/`@Permissions` on any handler (`backend/src/modules/reports/reports.controller.ts:43-218`), so the global `RolesGuard` returns true. The sidebar hides Reports from all but OWNER/ADMIN/MANAGER (`frontend/src/components/layout/sidebar.tsx:116-121`), but RECEPTION, NURSE, PHARMACIST, ACCOUNTANT and even PATIENT tokens can fetch revenue, doctor and payment reports, by API or by typing `/dashboard/reports`.
6. **Revenue, Doctor revenue and Payment reports read a table nothing writes.** Reports aggregate the legacy `prisma.payment` model (`reports.service.ts:91-97, 165, 218, 378, 421, 779-788`). No code in `backend/src` creates `Payment` rows. Pharmacy sales go to `PharmacyPayment` (`backend/src/modules/pharmacy/pharmacy-invoice.service.ts:2226`) and clinic billing to `NewPayment` (`backend/src/modules/billing/billing.service.ts:382`). Report totals stay at ₹0 (or only seed rows) and never match Pharmacy Invoices or the dashboard (which uses `newPayment`, `reports.service.ts:859`).
7. **Every report export fails.** `ExportReportDto.reportType` and `exportFormat` carry only `@ApiProperty` with no class-validator decorator (`backend/src/modules/reports/dto/reports.dto.ts:1122-1127`), so the whitelist strips them and the service throws "Unsupported report type: undefined" (`reports.service.ts:903, 925-926`). The page also sends plural names (`frontend/src/app/dashboard/reports/page.tsx:330`: `PATIENTS`, `DOCTORS`, `APPOINTMENTS`, `PAYMENTS`) that the switch doesn't accept (`reports.service.ts:907-923`). The front end swallows the error (`page.tsx:349-351`), and the uncontrolled Export select can't re-fire the same format (`page.tsx:1247`).
8. **PDF export would be empty.** `Buffer.concat(chunks)` runs synchronously right after `doc.end()` (`reports.service.ts:951-976`). PDFKit buffers output until the stream resumes on a later tick, so `chunks` is still empty. The unit test only checks the `data:application/pdf` prefix (`backend/src/modules/reports/tests/reports.service.spec.ts:94-98`).
9. **Report end date excludes the whole end day.** `calculateDateRange` uses `new Date(endDate)` for `YYYY-MM-DD`, which is midnight UTC (`reports.service.ts:1215`), and the page sends bare dates (`page.tsx:204-205, 271-274`). Data created on the end date after 05:30 IST is excluded, and start = end returns nothing for `createdAt`-based metrics.
10. **WhatsApp template create, update, generate and test all 400.** The body classes `CreateTemplateBody`, `UpdateTemplateBody`, `GenerateTemplateBody` and `SendTestBody` have no class-validator decorators (`backend/src/modules/whatsapp-templates/whatsapp-templates.controller.ts:8-40`). With class-validator 0.14.2 (`backend/package-lock.json:6776-6777`, `forbidUnknownValues` on by default) and the global pipe, validation fails with "an unknown value was passed to the validate function". Only GET and DELETE work. The front end's `saveTemplate` has no catch (`UsersManagement.tsx:229-267`).
11. **"Send Test" reports success when nothing was sent.** `sendWhatsApp` returns quietly when credentials are missing (`backend/src/modules/notifications/notifications.service.ts:135-140`), and `postWhatsApp` logs and returns on non-retryable HTTP errors (`notifications.service.ts:102-117`), so the UI shows "Test sent (check your WhatsApp)" (`UsersManagement.tsx:294`).
12. **WhatsApp numbers for Indian patients are mis-addressed.** Patient phones may be stored without a country code (`backend/src/modules/patients/dto/create-patient.dto.ts:32` accepts `9849098490`). Appointment confirmations only prepend `+` (`backend/src/modules/appointments/appointments.service.ts:207-209`), and `normalizeE164` does the same (`notifications.service.ts:68-73`). `9849098490` becomes `+9849098490`, not `+919849098490`.
13. **Role or account changes don't affect live sessions.** `JwtStrategy.validate` takes `role` and `branchId` from the token payload (`backend/src/modules/auth/strategies/jwt.strategy.ts:31-39`), `RolesGuard` trusts it, and the layout prefers `/auth/me`'s token role over the database role (`frontend/src/components/layout/dashboard-layout.tsx:47-50`). Demoted or deleted staff keep their old powers until the token expires. This is the same class as the known reset/JWT issue but a different trigger.
14. **New User opens as "Edit User" after cancelling an edit.** `onEdit` fills `form.id` (`UsersManagement.tsx:137-140`), and Cancel only closes the dialog (`UsersManagement.tsx:487`). The New User trigger doesn't reset the form (`UsersManagement.tsx:430-435`), so the dialog shows "Edit User" with the previous user's data and **Save** would update that user.
15. **Users page errors are silent.** `submit` and `onDelete` have no catch (`UsersManagement.tsx:107-135, 142-146`). A 409 duplicate email, the 400 "Cannot delete user with existing appointments or visits" (`users.service.ts:264-266`) and MANAGER's 403s all show no feedback.
16. **Template variable "Add" button never adds.** It reads `document.activeElement` (`UsersManagement.tsx:878-889`), which is the clicked button, not the input. Only Enter works.
17. **Admin's template list labels other doctors' templates "Mine".** Admin `GET` returns all branch templates (`whatsapp-templates.controller.ts:52-56`), and the label is `t.ownerId ? '• Mine' : '• Branch'` (`UsersManagement.tsx:735`). A "My Template" the admin creates from a doctor's WhatsApp Settings is owned by the admin, so the doctor's sends never pick it up (`whatsapp-templates.controller.ts:61-66`, `appointments.service.ts:213-218`).
18. **Deleting a clinic-wide holiday from one doctor's dialog.** Branch holidays (`doctorId: null`) appear in each doctor's time-off list (`backend/src/modules/doctor-availability/availability.queries.ts:37`), and the admin Working Hours dialog shows a trash icon on them (`frontend/src/components/users/DoctorAvailabilitySettings.tsx:166`, `UsersManagement.tsx:538`). One click, with no confirm, deletes the holiday for every doctor.
19. **Global search "user" results lead to an unfiltered list.** The header links to `/dashboard/users?search=<id>` (`frontend/src/components/layout/header.tsx:463`), but UsersManagement never reads the query string (`UsersManagement.tsx:92-105`).
20. **Dashboard "Active Users" always equals "Total Users".** Both come from one `count({ isActive: true })` (`backend/src/modules/auth/auth.controller.ts:90-99`), so the number also differs from the Users table, which lists inactive users too (`users.service.ts:131-137`).
21. **Patient Analytics "Avg Age" is wrong.** It multiplies each bucket's count by the bucket's lower bound and divides by `totalPatients`, which also counts patients without an age and can be 0 (NaN) (`frontend/src/app/dashboard/reports/page.tsx:541-542`, buckets at `reports.service.ts:278-284`).
