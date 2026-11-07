# Topic: auth-shell-navigation

Stories for sign-in, `?next` return, reset codes, session expiry and logout, the role-filtered sidebar, the mobile drawer, the header (global search, notifications bell, Branded switch, My Settings, Receptionist "Start Tour"), Quick Guides, both guided tours, dashboard variants, legacy redirect routes and 404 behaviour.

Source files read: `frontend/src/app/login/page.tsx`, `frontend/src/app/reset-password/page.tsx`, `frontend/src/middleware.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/authRedirect.ts`, `frontend/src/components/layout/{dashboard-layout,sidebar,header,branded-mode-context}.tsx`, `frontend/src/app/dashboard/page.tsx`, `frontend/src/components/dashboard/DoctorPatientPanels.tsx`, `frontend/src/components/tours/{ReceptionistTour,DoctorTour}.tsx`, `frontend/src/hooks/useIntroTour.ts`, `frontend/src/components/common/QuickGuide.tsx`, `frontend/src/components/users/ResetCodeButton.tsx`, the legacy redirect pages, `backend/src/modules/auth/*`, `backend/src/modules/reports/reports.{controller,service}.ts`, `backend/src/modules/users/users.controller.ts`, `backend/src/modules/patients/patients.{controller,service}.ts`, `backend/src/shared/guards/{roles,permissions}.guard.ts`.

Seed logins (password `password123`): `admin@clinic.test` / 9000000000 (Admin User, ADMIN), `shravya@clinic.test` / 9000000001 (Dr. Shravya Dermatologist, DOCTOR), `praneeta@clinic.test` / 9000000002 (Dr. Praneeta Jain, DOCTOR), `reception@clinic.test` / 9000000003 (Riya Sharma, RECEPTION).

---

## STORY-001: Front-desk sign-in with a phone number

**Type**: short
**Topic**: auth-shell-navigation
**Persona**: Riya Sharma, receptionist at the Banjara Hills clinic. She opens the clinic at 8:45 am and prefers typing her mobile number to her email.
**Goal**: Sign in and reach the Dashboard before the first walk-in arrives.
**Preconditions**: Riya's account (`reception@clinic.test`, phone 9000000003) is ACTIVE. She has no `auth_token` cookie.
**Ideal path**: 3 steps. Type the identifier, type the password, press Enter. The form autofocuses the identifier field, so no extra click is needed.
**Alternate paths**: Email instead of phone in the same "Phone or email" field. Visiting `/` redirects to `/dashboard`, and middleware then sends you to `/login?next=/dashboard`, which ends on the same page.

### Steps
1. Open `http://clinic.local/` → `/` redirects to `/dashboard`. Middleware finds no `auth_token` cookie and redirects to `/login?next=%2Fdashboard`. The page shows the "ClinicMS Login" card with the Linaé letterhead crop, a "Branded" switch top-right, and "Phone or email" focused.
2. Type `9000000003` in "Phone or email" → the "Sign in" button is still disabled because the password is empty.
3. Type `password123` in "Password" → "Sign in" becomes enabled.
4. Press Enter → the button shows a spinner and "Signing in…". The backend sets an HttpOnly `auth_token` cookie (7-day maxAge).
5. You land on `/dashboard`, "Dashboard" / "Welcome back! Here's what's happening at your clinic today.", with a loading skeleton labelled "Loading dashboard…". The sidebar footer shows "RS", "Riya Sharma", "RECEPTION". The header shows a "Start Tour" button, because only RECEPTION gets it.

### Variations
- **Email login**: `reception@clinic.test` (case-insensitive: `Reception@Clinic.TEST` also works). Same result.
- **Formatted phone**: `90000-00003` or `(900) 000 0003` works because the backend strips non-digits.
- **Indian international format**: `+91 90000 00003` normalises to `919000000003`, which does not match the stored `9000000003`. The error reads "Account not found". Riya assumes her account was deleted (see Defects).

### Edge Cases
- Wrong password: the red alert reads "Invalid password". The API client's 401 handler skips its redirect because the path starts with `/login`.
- Unknown email `riya@clinic.test`: "Account not found". This differs from "Invalid password", so it reveals which accounts exist.
- Suspended or deactivated user: "Account suspended" or "Account disabled" (403).
- Malformed email `riya@clinic`: "Valid email address is required". A phone with 6 digits: "Phone number must be between 7 and 15 digits". A phone starting with 0 (`09000000003`): "Phone number must start with a valid country code".
- Six attempts within 60 s hits the throttle (5/min). Login is a POST, so the client does not retry. The raw throttler message shows in the red alert.
- Whitespace-only identifier: the button stays disabled. If the form is submitted anyway, the client shows "Phone or email and password are required".
- Already signed in and visiting `/login`: there is no auto-redirect, so the form shows again.

---

## STORY-002: Following a shared deep link while signed out, plus old bookmarks and a 404

**Type**: medium
**Topic**: auth-shell-navigation
**Persona**: Dr. Praneeta Jain, dermatologist. A colleague sent her a WhatsApp link to a patient record, and her browser still has bookmarks from the old billing and prescription screens.
**Goal**: Open the patient record she was sent and land exactly there after signing in. Then find out where her old bookmarks go now.
**Preconditions**: Patient "Lakshmi Reddy" (Kondapur, 9848012345) exists. Praneeta's browser has no session cookie.
**Ideal path**: 3 steps. Click the link, sign in (identifier + password + Enter counted as one form submit), and see the patient. The `?next` round-trip makes this possible today.
**Alternate paths**: Global search → Patients list → View (see STORY-007). Sidebar "Patients" → search → View. Dashboard "My Patients" panel (doctor only, see STORY-011).

### Steps
1. Click the WhatsApp link `https://clinic.local/dashboard/patients/ckx9lakshmi01` → middleware redirects to `/login?next=%2Fdashboard%2Fpatients%2Fckx9lakshmi01`.
2. Notice the URL holds `next=` and trust that she will be sent back. Type `praneeta@clinic.test` / `password123` and press Enter.
3. `router.replace(next)` sends her to `/dashboard/patients/ckx9lakshmi01` → the patient header with ID / Code / ABHA badges and the Info / History / Uploads tabs. The sidebar highlights "Patients".
4. Check the History tab to confirm she is on the right patient.
5. Type her old bookmark `/dashboard/prescriptions` → it redirects to `/dashboard/visits` ("Visit Documentation"), and the sidebar highlights "Visits". She expected a prescription pad and has to start a visit to reach the Prescription tab.
6. Open the bookmark `/dashboard/billing` → it redirects to `/dashboard/pharmacy?section=billing` and shows "Pharmacy Billing". Doctors have no Pharmacy links in the sidebar, so no sidebar item is highlighted and she cannot get back here from the nav.
7. Open `/dashboard/stock-predictions` → it redirects to `/dashboard/inventory?area=reorder&view=targets` (Inventory → Reorder → Target proposals). "Inventory" is highlighted.
8. Open `/dashboard/inventory-updates` → it redirects to `/dashboard/inventory?area=stock&view=approvals` (Stock → Approve corrections). As a DOCTOR she can see the queue.
9. Mistype a URL: `/dashboard/patient/ckx9lakshmi01` (singular) → the default Next.js "404 | This page could not be found." page. It has no sidebar, no header and no link home, so she uses the browser Back button.

### Variations
- **Deep link with query**: `/dashboard/appointments?patientId=ckx9lakshmi01` survives the round-trip because middleware keeps the full path and query.
- **Patient no longer exists / archived**: after login she reaches the detail page, which shows "Patient not found." with "Back to Patients".
- **Signed-out 404**: `/dashboard/xyz` first goes to `/login?next=%2Fdashboard%2Fxyz`. After a successful login she lands on the 404 page.
- **Non-dashboard route**: `/test-transcribe` is outside the middleware matcher, so the page renders while signed out.

### Edge Cases
- `next` is used without validation. `/login?next=https://evil.example` sends the user off-site after a real login (see Defects).
- The Google Calendar callback `/dashboard/appointments/google-callback` is exempt from middleware so the OAuth return can load without the SameSite=Strict cookie.
- The 404 page sits outside the dashboard shell, so the user loses the sidebar and Log out button until they go back.

---

## STORY-003: Admin issues a reset code and the receptionist sets a new password

**Type**: medium
**Topic**: auth-shell-navigation
**Persona**: Admin User (clinic administrator) and Riya Sharma (receptionist, locked out after a long Diwali break).
**Goal**: Get Riya signed in again without the admin ever learning her new password.
**Preconditions**: Riya's account is ACTIVE. The admin is signed in. They are in the same room, because the code must be handed over in person.
**Ideal path**: 7 steps. Admin: Users, then Reset password on Riya's row, confirm, then read the code aloud (4). Riya: enter the reset code, enter the new password twice and submit (2), then sign in (1). The confirmation step is deliberate friction.
**Alternate paths**: The server operator can run the issue-reset-code script (`PasswordResetService.issueResetCodeAsOperator`), which has no UI. There is no self-service "forgot password" email or SMS.

### Steps
1. Riya fails to sign in ("Invalid password") and reads the hint under the form: "Forgot password? Ask your clinic admin for a reset code, then enter your reset code."
2. Admin clicks "Users" in the sidebar (Admin group) → "Users Management", "Manage clinic staff and user accounts".
3. Admin finds the Riya Sharma row (RECEPTION, ACTIVE) and clicks "Reset password" → a dialog titled "Reset password for Riya Sharma" warns "Only issue a code to Riya Sharma after confirming in person that they are asking…".
4. Admin checks it is really Riya and clicks "I have confirmed who is asking. Create code" → "Creating code…", then the code appears, e.g. `K7PM-3QXD`, with "It works once and expires 8 Nov 2026, 9:12 am" and "This code is shown only once."
5. Admin clicks "Copy code" → it is copied to the clipboard with no visible confirmation. Admin reads the code aloud to Riya.
6. Riya clicks the "enter your reset code" link on the login page → `/reset-password`, "Set a new password".
7. Riya types `k7pm 3qxd` in lowercase with a space → this is accepted, because the server strips spaces and dashes and uppercases the code.
8. Riya types `Charminar@2026` in "New password" and `Charminar@2025` in "Confirm new password" by mistake → "Set new password" → "The two passwords do not match."
9. Riya fixes the confirmation and submits → "Saving…", then "Password updated. Taking you to sign in…". After 2.5 s she is sent to `/login`.
10. Riya signs in with 9000000003 / `Charminar@2026` → Dashboard.

### Variations
- **Short password**: `riya123` → "Use 8 to 72 characters." (the help text under the field reads "At least 8 characters.").
- **Wrong or expired code**: the 400 error reads "This reset code is invalid or has expired. Ask an admin for a new one."
- **Code reused** after a successful reset: same invalid message, because the code is single-use.
- **Admin issues a second code** before Riya uses the first: the first stops working ("Issuing a code cancels any earlier code").
- **Admin tries to reset another ADMIN**: the dialog shows "You cannot reset the password of a user at or above your role." Only an OWNER can reset an OWNER.
- **MANAGER does the same thing**: Users is in the MANAGER sidebar and the "Reset password" button shows, but the backend rejects the request (403). See Defects.
- **"Back to sign in"** link on the reset page returns to `/login` without resetting.

### Edge Cases
- More than 5 reset attempts in 60 s hits the throttle message.
- Closing the dialog after the code shows hides the code for good, and the code stays valid. The admin has to issue a new one to see a code again.
- A deactivated user's code fails with the generic invalid/expired message.

---

## STORY-004: The session expires overnight, then she logs out on purpose

**Type**: medium
**Topic**: auth-shell-navigation
**Persona**: Dr. Shravya Dermatologist. She left the Appointments tab open on the consult-room PC overnight.
**Goal**: Pick up where she left off the next morning, then sign out securely before the PC is shared with the visiting cosmetologist.
**Preconditions**: She signed in more than 24 h ago. The JWT expires after `JWT_EXPIRES_IN` (default `1d`), but the `auth_token` cookie lives 7 days. The tab is on `/dashboard/appointments`.
**Ideal path**: 2 steps to resume (sign in again, then land back on Appointments) and 1 step to log out (sidebar "Log out" icon).
**Alternate paths**: To end the session, there is no other UI. The only control is the sidebar footer icon (`aria-label="Log out"`), which also appears inside the mobile drawer. There is no header user menu with Log out: the header's name/avatar block cannot be clicked.

### Steps
1. Change the Doctor select on Appointments → the schedule request returns 401. The API client clears legacy tokens, stores `cms_next_after_login`, and redirects to `/login?next=%2Fdashboard%2Fappointments`.
2. She sees the login card with no explanation of why she was signed out (no "Your session expired" message).
3. She signs in with 9000000001 / `password123` → returns to `/dashboard/appointments`, and her doctor and date choices come back from localStorage (`appointments.doctorId`, `appointments.date`).
4. She finishes reviewing the 11:30 slot for "Mohammed Irfan".
5. She clicks the Log out icon (arrow) in the sidebar footer, next to "Shravya Dermatologist / DOCTOR" → `POST /auth/logout` clears the cookie and `router.replace('/login')`.
6. She presses the browser Back button → middleware finds no cookie and redirects to `/login?next=%2Fdashboard%2Fappointments`, so the clinic data stays hidden.

### Variations
- **Fresh page load with an expired JWT**: middleware lets the request through because the cookie still exists. The layout renders its skeleton, `/auth/me` returns 401, and two redirects race: the API client sends the user to `/login?next=…` and the layout calls `router.replace('/login')` without `next`. Check in a browser which one wins and whether `next` survives.
- **During visit autosave**: the visit form shows "Not signed in" or "Auto-save failed" before the redirect. Unsaved edits depend on the visit draft autosave (see the visit-documentation topic).
- **Logout while offline**: the `/auth/logout` failure is swallowed and the client still goes to `/login`. The HttpOnly cookie may survive, so reopening `/dashboard` signs her straight back in.

### Edge Cases
- `cms_next_after_login` is written to localStorage on every 401 but nothing reads it.
- Logout does not revoke the JWT on the server. A copied token stays valid until it expires.
- After logout the "Branded" choice persists, because it is stored in localStorage.

---

## STORY-005: Admin checks what each new hire will see in the sidebar

**Type**: long
**Topic**: auth-shell-navigation
**Persona**: Admin User, setting up accounts for three new hires at the Jubilee Hills branch: pharmacist Farhana Begum, nurse Swathi Naidu and manager Venkat Rao. She wants to confirm each sees only what they need.
**Goal**: Confirm the role-filtered navigation for each role, and notice where the navigation and the backend disagree.
**Preconditions**: Admin is signed in. The Users page lets her create users with roles Admin, Doctor, Nurse, Receptionist, Manager, Pharmacist. Test passwords are known.
**Ideal path**: 4 steps per role checked (log out, sign in as the role, scan the sidebar, try one key action). A "view as role" preview would make it 1 step per role, but none exists.
**Alternate paths**: The sidebar is the only role-aware navigation. Quick Guides, tours and the notification bell partly duplicate it, and direct URLs reach every page whatever the nav shows.

### Steps
1. As Admin, scan the sidebar: **Overview** Dashboard · **Clinical** Patients, Appointments, Visits, Procedures, Rooms · **Pharmacy** Pharmacy Desk, Pharmacy Counter, Pharmacy Billing, Inventory · **Admin** Reports, Users, Test Transcribe. The footer reads "Admin User / ADMIN".
2. Users → "New User" → create Farhana Begum, `farhana@clinic.test`, 9849011111, role Pharmacist, status Active → she appears in the table.
3. Create Swathi Naidu (Nurse, 9849022222) and Venkat Rao (Manager, 9849033333) the same way.
4. Click the sidebar Log out icon → `/login`.
5. Sign in as `farhana@clinic.test` → the sidebar shows only Overview: Dashboard and Pharmacy: Pharmacy Desk, Pharmacy Counter, Pharmacy Billing, Inventory. There is no Patients link, even though dispensing involves patients.
6. Click "Pharmacy Counter" → `/dashboard/pharmacy?section=counter`, and the active marker moves to Pharmacy Counter.
7. Open the bell → items read "Low stock: …" and "Expiring soon: …" (pharmacist mapping).
8. Log out and sign in as `swathi@clinic.test` (NURSE) → the sidebar shows Dashboard, Patients, Appointments, Visits, Rooms. There are no Pharmacy, Inventory or Admin links.
9. Swathi opens Appointments, double-clicks a booked tile, and sees "Cancel Appointment" in "Appointment Details". Confirming it fails with 403, because DELETE is limited to ADMIN/RECEPTION (covered in the appointments topic).
10. Swathi opens the bell → she gets the **admin summary** mapping (e.g. "2 overdue invoices" → `/dashboard/pharmacy?section=billing`), which links to pages her sidebar hides.
11. Log out and sign in as `venkat@clinic.test` (MANAGER) → the sidebar shows Dashboard, Patients, Appointments, Visits, Procedures, Rooms, Inventory, Reports, Users. There are no Pharmacy Desk/Counter/Billing links.
12. Venkat opens Users and clicks "Reset password" on Swathi's row → "I have confirmed who is asking. Create code" fails with 403 (manager outranks no one in the reset rank table, and the endpoint is OWNER/ADMIN only).
13. Venkat tries "New User" → the create request is refused (403).
14. Log out and sign back in as Admin. In Users, set Venkat's role to Accountant to see that sidebar.
15. Sign in as Venkat (now ACCOUNTANT) → the sidebar shows only **Overview: Dashboard**. The bell shows "Pending ₹…" and "Overdue Invoice …" items that link to `/dashboard/pharmacy?section=billing`, a page not in his nav.
16. Sign back in as Admin and restore Venkat to Manager.
17. Compare with seed users: Dr. Shravya (DOCTOR) sees Clinical + Inventory + Test Transcribe but **no Pharmacy Desk/Counter/Billing**, even though the backend grants doctors universal access. Riya (RECEPTION) sees Patients, Appointments, Rooms, all three Pharmacy links and Inventory, but **no Visits**.

### Variations
- **OWNER**: the sidebar has every Clinical and Admin item plus Inventory, but no Pharmacy Desk/Counter/Billing links.
- **LAB_TECH or PATIENT** (patient portal users created via Patients → "Link Portal"): every nav item is filtered out, including Dashboard. They still land on `/dashboard` with stat cards and the header search (see Defects).
- **Slow `/auth/me`**: while the user is loading, `role` is undefined and the sidebar briefly shows **all** items. The footer reads "Loading…" / "Unknown Role".

### Edge Cases
- If `/auth/me` fails with a non-401 error (e.g. 502 while the backend restarts), `user` stays null. The sidebar keeps showing every item with "Unknown User / Unknown Role", and no retry is offered.
- If `/users/:id` fails but `/auth/me` succeeds, the role still filters the nav, but the name falls back to "Unknown User" and the avatar shows "?".
- "Therapist" appears in the Users Quick Guide but is not a selectable role.

---

## STORY-006: Receptionist on a phone uses the mobile drawer

**Type**: short
**Topic**: auth-shell-navigation
**Persona**: Riya Sharma, checking the day's patients on her phone in the auto-rickshaw to the clinic.
**Goal**: Open Appointments from a 390 px-wide phone, then look for today's notifications.
**Preconditions**: Riya is signed in on mobile Chrome (viewport < 768 px).
**Ideal path**: 2 steps. Open the drawer, tap Appointments.
**Alternate paths**: The Dashboard "Today's Appointments" card has a "View All Appointments" button (shown only when there are appointments today). You can also type the URL directly.

### Steps
1. Load `/dashboard` on the phone → the desktop sidebar and header are hidden. A 56 px top bar shows a hamburger button ("Open clinic navigation") and "ClinicMS".
2. Tap the hamburger → a full-height 288 px drawer ("Clinic navigation") opens with the same grouped sidebar, user footer and Log out icon.
3. Tap "Appointments" → the drawer closes (`onNavigate`) and Appointments loads.
4. Look for the notifications bell to see today's overdue pharmacy invoices → there is none. The header (search, bell, Branded switch, My Settings, Start Tour) is `hidden md:block`.
5. Rotate to landscape (≥ 768 px wide on a large phone) → the desktop layout appears and the bell becomes reachable.

### Variations
- **Doctor on mobile**: Dr. Praneeta cannot reach "My Settings" (signature, letterhead, availability, WhatsApp) on a phone at all.
- **Tablet at 800 px**: the full desktop shell shows, with a 256 px sidebar plus header.

### Edge Cases
- Pressing Escape or tapping outside closes the drawer, which is a Radix Dialog reused as a sheet.
- The Receptionist tour's first sidebar step targets `[data-tour="sidebar"]`. On mobile that element exists only while the drawer is open, but the "Start Tour" button is hidden on mobile anyway.

---

## STORY-007: Finding a patient from the header search

**Type**: medium
**Topic**: auth-shell-navigation
**Persona**: Riya Sharma, at the front desk. Sai Kiran Goud calls to ask about his follow-up for a chemical peel.
**Goal**: Find Sai Kiran's record and his upcoming appointment from wherever she is in the app.
**Preconditions**: Patient "Sai Kiran Goud", 9701234567, Madhapur, has an appointment on 9 Nov 2026 at 11:00 with Dr. Shravya. Riya is on desktop.
**Ideal path**: 3 steps. Type "sai k", pick the patient result, and land on his record or detail page.
**Alternate paths**: Sidebar "Patients" → "Search by name, phone, ABHA, or email (min 2 chars)". Appointments page patient search "Search patient by name/phone". Dashboard "My Patients" search (doctors only).

### Steps
1. From Rooms, click the header search ("Search patients, appointments, doctors...") and type `s` → nothing happens until 2 characters.
2. Type `ai k` (query "sai k") → a spinner shows. After a 300 ms debounce the patients, appointments and users lookups run in sequence.
3. The dropdown lists "Sai Kiran Goud" (Patient badge, "9701234567", "Patient • Male • 29y"), an appointment row "Sai Kiran Goud - 11:00-11:30" with "Dr. Shravya Dermatologist" (Appointment badge), and the footer "Press Enter to go to first result • Type more to refine search".
4. Press Escape → the results close, but "sai k" stays in the box.
5. Click back into the box → the results reopen.
6. Click the patient result → it navigates to `/dashboard/patients?search=<patient id>` and the box clears. "Patients Management" loads with the search box seeded with the internal id. The list shows **"No patients found"**, because the backend search does not match on id (see Defects).
7. Riya, confused, clears the Patients search, types `9701234567`, and finds the row → "View" → detail page.
8. Back in the header, type `sai k` again and click the **appointment** result → `/dashboard/appointments` opens on the doctor and date stored from her last session (today, Dr. Praneeta). She has to change the doctor and date by hand to find the 9 Nov slot.

### Variations
- **Press Enter** right after typing: goes to the first result, which is always a patient if any patient matched.
- **Staff search** `shravya` → a "Staff" result → `/dashboard/users?search=<user id>`. RECEPTION has no Users link in the sidebar, yet the page opens and lists every user unfiltered, because the `search` param is ignored.
- **No match** `zzq` → "No results found for "zzq"" with "Try searching for patient names, phone numbers, or doctor names".
- **Pharmacist searches**: the appointments lookup 403s and is silently skipped, so only patients and staff appear.

### Edge Cases
- Phone search uses `startsWith` for patients but `contains` for appointments, so `234567` finds the appointment but not the patient.
- Clicking outside the box closes the results. A slow response that arrives after Escape does not reopen them.
- Search is unavailable on mobile (STORY-006).
- The patient's name and phone appear in three places: the search dropdown, the Patients list row and the patient detail header (redundancy candidate).

---

## STORY-008: The notifications bell for each role

**Type**: medium
**Topic**: auth-shell-navigation
**Persona**: Farhana Begum (pharmacist) at 10 am, and Dr. Shravya between consults.
**Goal**: Act on what the bell says needs attention.
**Preconditions**: The branch has 3 inventory items at zero stock ("Tretinoin 0.025% Cream", "Minoxidil 5% Solution", "Azelaic Acid 20% Gel"), 2 items expiring within 30 days, and 4 appointments in the next 48 h across both doctors.
**Ideal path**: 2 steps. Open the bell, click an item, and land on a filtered view of exactly that problem.
**Alternate paths**: The same alert data appears as Dashboard "System Alerts" summary cards (Overdue Invoices, Low Stock Alert, Expiring Items, Pending Payments). The Inventory "Today" queues ("Low stock", "Expiring in the next 3 months") use correct deep links. The bell polls every 60 s and the dashboard loads the same `/reports/alerts` once (redundancy candidate).

### Steps
1. Farhana signs in. The bell shows a red badge "5", because a destructive item exists.
2. Open the bell → the "Notifications" header, then "Low stock: Tretinoin 0.025% Cream" ("Stock 0 • Reorder 10"), the other two low-stock items, and "Expiring soon: Clindamycin Gel" ("21 days left • Qty 14").
3. Click "Low stock: Tretinoin 0.025% Cream" → `/dashboard/inventory?tab=low-stock`. The workspace ignores `tab` and opens **Today**. Farhana has to find the "Low stock" queue herself.
4. Back on the bell, click "View reports & alerts" → `/dashboard/reports` ("Reports & Analytics"), a page that is not in the pharmacist sidebar.
5. Dr. Shravya signs in. Her bell lists the next 48 h of appointments, e.g. "Ananya Rao on 8 Nov 2026" ("Procedure • SCHEDULED"), including **Dr. Praneeta's** patients, because the list is not filtered by doctor.
6. Shravya clicks "Ananya Rao on 8 Nov 2026" → `/dashboard/visits?appointmentId=…`. The Visits page ignores `appointmentId` without `patientId`, so she lands on the generic "Start New Visit" setup with no patient selected.
7. She falls back to sidebar → Appointments → finds the tile → "Start Visit".

### Variations
- **Admin/Owner**: summary items such as "3 low-stock items" ("Restock inventory"), "2 near-expiry items", "4 upcoming appointments" ("Within 48 hours"), "1 overdue invoice" ("Billing attention needed"). The inventory ones hit the same dead `?tab=` link.
- **Receptionist**: "Upcoming: Ananya Rao on 8 Nov 2026" ("Procedure • Dr. Praneeta Jain") → `/dashboard/appointments`, plus "Overdue Invoice INV-…" → Pharmacy Billing.
- **Nurse / Manager / Patient-portal user**: fall into the admin summary mapping (default branch).
- **Nothing pending**: "No notifications". The "View reports & alerts" footer is hidden.
- **`/reports/alerts` fails**: the bell is silently empty, with no error.

### Edge Cases
- "Low stock" only counts items at stock ≤ 0 that have a positive minimum level. An item at 2 units with reorder level 10 is never flagged.
- The badge caps at "9+", but the lists are limited to 5–6 items, so the badge never exceeds 8.
- The bell is not available on mobile.

---

## STORY-009: Switching on Branded mode

**Type**: short
**Topic**: auth-shell-navigation
**Persona**: Dr. Praneeta Jain, showing the system to the clinic's owner, who wants it to "look like Linaé".
**Goal**: Turn on the clinic's letterhead colour palette and have it stick.
**Preconditions**: Any signed-in user, desktop.
**Ideal path**: 1 step. Flip the "Branded" switch.
**Alternate paths**: The same "Branded" switch (`aria-label="Toggle branded mode"`) sits top-right on `/login` and in the dashboard header. Both write localStorage `cms_branded_mode`.

### Steps
1. On `/login`, flip "Branded" on before signing in → the palette is extracted from `/letterhead.png`, cached in `cms_branded_palette`, and the `branded` class is added to `<html>`, which tints the login gradient.
2. Sign in → the dashboard keeps the branded palette and the header switch is already on.
3. Flip the header "Branded" switch off → the class is removed immediately and the default theme returns.
4. Reload → it stays off (localStorage `0`).

### Variations
- **First-ever toggle**: the switch is disabled while the palette is computed (`loading`).
- **Private window / storage blocked**: the toggle works for the session but resets on reload.

### Edge Cases
- On mobile the header switch is hidden. The only place to change Branded is the login page, which means logging out first.
- The setting is per browser, not per user. A shared front-desk PC carries one person's choice to the next.

---

## STORY-010: Learning from the Quick Guides and the Visit Workflow Tour

**Type**: medium
**Topic**: auth-shell-navigation
**Persona**: Dr. Shravya Dermatologist, new to ClinicMS, who reads every help text before trying a feature. She is cautious.
**Goal**: Use the built-in help to learn how to add a patient, then how a visit works end to end.
**Preconditions**: Signed in as a doctor, desktop.
**Ideal path**: 2 steps per help surface: open it, then read and close it. The tour is 1 click plus "Next →" through its 19 steps.
**Alternate paths**: Help is spread across three systems. **QuickGuide** dialogs: "Dashboard Guide", "Patients Management Guide", "Visit Documentation Guide", "Procedures Management Guide", "Room Management Guide", "Pharmacy Management Guide", "Reports & Analytics Guide", "Users Management Guide". Appointments has its own separate "Quick Guide" dialog. There are two intro.js tours (Receptionist "Start Tour" in the header, Doctor "Visit Workflow Tour" inside the visit form) and the visit form's "Shortcuts" dialog.

### Steps
1. On Dashboard, click "Quick Guide" → "Dashboard Guide" with sections Overview and System Alerts. Admins also get Admin Controls. It says "Click on any alert to view more details", but the alert rows cannot be clicked.
2. Close it and go to Patients → "Quick Guide" → "Patients Management Guide" says "Click 'Add Patient'…" and "date of birth". The real button is "New Patient", and the form asks for age.
3. Click "New Patient" anyway, then cancel.
4. Go to Visits → choose patient "Lakshmi Reddy" and doctor → open the form → in the visit header, click "Visit Workflow Tour" (it shows "Tour" on narrow screens).
5. The intro.js overlay shows "Welcome to the Doctor Visit Workflow!" with a progress bar and bullets. "Next →" moves through "The Patient Visit Lifecycle", "Step 1: Patient Context Panel", "Step 2: Navigation Tabs" and so on. Every step is a floating modal: no element is highlighted, even when the text says "this panel".
6. On "Step 5: Prescription Tab (The Core!)" she presses Escape → the tour exits, and `tour-seen-doctor…` is stored.
7. She clicks "Visit Workflow Tour" again → it restarts from step 1. There is no resume.
8. Clicking through to "You're Ready to Go!" and pressing "Finish" ends the tour.

### Variations
- **Receptionist tour**: see STORY-012. It is page-aware for Dashboard, Appointments, Patients, Rooms and Pharmacy. On other pages it shows one "Receptionist Tour" card listing where tours exist.
- **Admin on Users**: the "Users Management Guide" says "Click 'Add User'" (the button is "New User"), lists "Therapist" and "Owner" as selectable roles (the dialog offers neither), and says "Edit user information by clicking on a user row" (rows are not clickable).
- **Pharmacy Management Guide**: refers to a "Billing & GST tab" and "Inventory > Pharmacy Control", and neither exists.

### Edge Cases
- Clicking the overlay exits the tour, because `exitOnOverlayClick` is on.
- Quick Guide content is static and duplicates (and contradicts) the tours.

---

## STORY-011: Morning dashboard check — Admin backup and doctor panels

**Type**: medium
**Topic**: auth-shell-navigation
**Persona**: Admin User (8:30 am, before OPD opens), then Dr. Praneeta Jain (between patients).
**Goal**: Admin: check clinic health and take a database backup before the GST audit. Doctor: resume yesterday's unfinished visit and look up one of her patients.
**Preconditions**: Admin signed in, Postgres running in the `cms-postgres` container. Praneeta has visits from yesterday and 23 patients with her as primary doctor.
**Ideal path**: Admin, 2 steps: Dashboard, then "Create Backup" with a clear result. Doctor, 2 steps: Dashboard, then click the visit in "Recent Visits".
**Alternate paths**: Backup has no other UI path (the server API `POST /auth/backup` / `GET /auth/backup/:jobId` only). Recent visits are also reachable via Visits → history tab, and the patient detail History tab. "My Patients" duplicates the Patients list filtered by primary doctor (redundancy candidate).

### Steps
1. Admin opens Dashboard → stat cards "Total Users 6", "Active Users 6", "Total Branches 1", "System Status operational". Total and Active are always equal.
2. Admin reads "Admin Controls" → "Database Backup", "Create a complete backup of the database", and the warning "⚠️ Backups are stored locally on the server and contain sensitive data."
3. Admin clicks "Create Backup" → "Creating..." → a browser `alert()` shows "❌ Backup Failed" with a JavaScript error. In fact the server queued the job and returned `{ success, jobId }`, and nothing in the UI polls it (see Defects).
4. Admin, unsure, clicks again → a second backup job is queued.
5. Admin reads "System Alerts": "Low Stock Alert — 3 items are below reorder level" (MEDIUM), "Expiring Items — 2 items are expiring within 30 days" (MEDIUM), "System Status — All systems operational" (LOW). None of the rows can be clicked.
6. Admin reads "Today's Appointments": "Ananya Rao 10:00-10:30 SCHEDULED" and others, then "View All Appointments" → `/dashboard/appointments`.
7. Praneeta signs in → Dashboard shows "Recent Visits" ("Your latest consultations") and "My Patients" ("Patients with you as their primary doctor (23)") **above** the same four stat cards. There is no Admin Controls card.
8. In Recent Visits she clicks "Mohammed Irfan — Acne vulgaris" (yesterday 6:40 pm) → `/dashboard/visits?patientId=…&visitId=…` resumes the visit.
9. Back on Dashboard, she types `kon` in "Search by name, phone or code" under My Patients. The list filters to patients whose name, phone or code matches. If none match it shows "No matching patients".
10. She clears the search, pages with "Next" ("Page 2 of 3"), and clicks "Lakshmi Reddy" → `/dashboard/patients/<id>`.
11. Her "Today's Appointments" uses her own doctor schedule for the current Asia/Kolkata day.

### Variations
- **Receptionist or Nurse**: sees the same four admin-style stat cards (user and branch counts) without Admin Controls.
- **Alerts endpoint down**: System Alerts still shows "System Status — All systems operational", so "No alerts at this time" with "Refresh dashboard" can never appear.
- **No appointments today**: "No appointments scheduled for today", with no "View All Appointments" button.
- **Doctor with no visits**: "No visits yet". With no assigned patients: "No patients assigned to you yet".
- **Backup when Docker is unavailable**: the job file ends as FAILED on the server, but the UI shows the same misleading alert either way.

### Edge Cases
- Stock alerts only count items at zero stock even though the text says "below reorder level".
- The same alert data shows on Dashboard "System Alerts", the header bell and the Inventory Today queues, each with different thresholds and wording.
- "Recent Visits" or "My Patients" load errors read "Could not load your recent visits. Refresh to try again.", with no retry button.

---

## STORY-012: A new receptionist's first morning, end to end

**Type**: long
**Topic**: auth-shell-navigation
**Persona**: Riya Sharma on her first day at the Kondapur branch. She is nervous, follows the guided tour, and expects the app to hold her hand.
**Goal**: Learn the front-desk screens with the Receptionist tour, handle the first caller, check alerts, and sign out at lunch.
**Preconditions**: Admin has created Riya's account and issued a reset code (STORY-003). A walk-in, "Anil Kumar Yadav" (9866054321), is expected. Desktop browser.
**Ideal path**: About 12 steps for the core work: sign in, run the tour on 4 pages, search a caller, open a notification and log out. The tour does not navigate between pages by itself, so each page needs its own "Start Tour" click.
**Alternate paths**: Help comes from both the "Start Tour" button and the page Quick Guides (Dashboard Guide, Patients Management Guide, Room Management Guide, Pharmacy Management Guide, Appointments "Quick Guide"). Navigation is through the sidebar, the header search or notification links.

### Steps
1. Open `/reset-password`, enter the code from Admin, set `Golconda#2026` → "Password updated. Taking you to sign in…" → `/login`.
2. Sign in with 9000000003 → Dashboard.
3. Click "Start Tour" in the header → "Welcome!" ("Welcome to the Receptionist Dashboard! 🎉") → "Next →".
4. Step "Navigation Sidebar" highlights the sidebar and lists Appointments, Patients, Rooms, Pharmacy Billing → "Next →".
5. Step "Today's Overview" highlights the stat cards and promises "Number of appointments scheduled, Patient registrations, Room occupancy status". The cards actually show Total Users / Active Users / Total Branches / System Status. Riya is puzzled.
6. Step "Today's Appointments" says "Click on any appointment to view details, reschedule, or cancel". The rows cannot be clicked → "Finish".
7. Sidebar → "Appointments" → "Start Tour" → "Welcome to Appointment Management!" → "Step 1: Select a Doctor" (highlights the Doctor select) → "Step 2: Choose the Date" → "Step 3: Choose Your View" (Calendar / Slots tabs), and so on to "Finish".
8. Open the Appointments "Quick Guide" dialog as well and skim it. It overlaps the tour.
9. Sidebar → "Patients" → "Start Tour" → steps highlight "New Patient" (`add-patient-btn`), the search box and the patients table.
10. The phone rings: Anil Kumar Yadav asks whether his file exists. Type `9866` in the header search → "Anil Kumar Yadav" (Patient) appears → click it → the Patients list shows "No patients found" (id search). Riya searches `9866054321` in the Patients search box instead and finds him.
11. Sidebar → "Rooms" → "Start Tour" → highlights "Room Calendar & Occupancy".
12. Sidebar → "Pharmacy Desk" → "Start Tour" → four text-only steps ("Pharmacy Workflows", "Pharmacy Desk", "Pharmacy Counter", "Pharmacy Billing"), which mention a "Codex assistant".
13. Sidebar → "Pharmacy Billing" → "Start Tour" shows the **same** pharmacy tour, because the tour is keyed by pathname `/dashboard/pharmacy` and ignores `?section`.
14. Sidebar → "Inventory" → "Start Tour" → the fallback card "Receptionist Tour: The guided tour is available on these pages: Dashboard, Appointments, Patients, Rooms, Pharmacy Desk, Pharmacy Counter, Pharmacy Billing".
15. Open the bell → "Upcoming: Anil Kumar Yadav on 7 Nov 2026" ("OPD Consultation • Dr. Shravya Dermatologist") → click it → `/dashboard/appointments`.
16. Bell → "Overdue Invoice PINV-0412" → Pharmacy Billing.
17. Look for a Visits link to start Anil's vitals → there is none in the RECEPTION sidebar. She uses the appointment tile's "Start Visit" instead (visit-documentation topic).
18. Flip "Branded" on because the owner asked for it.
19. At lunch, click the Log out icon in the sidebar footer → `/login`.
20. After lunch, Dr. Shravya signs in on the same PC → Branded is still on, carried over from Riya's choice.

### Variations
- **Tour already seen**: `tour-seen-receptionist-<pathname>` is set, but autoStart is false anyway, so the button always replays the tour.
- **Riya on the front-desk tablet below 768 px**: no "Start Tour", bell or search at all (STORY-006).
- **Tour target not rendered yet** (e.g. the patients table still loading): `waitForElement` polls for up to 5 s, then the step floats unanchored.

### Edge Cases
- Pressing Escape or clicking the overlay mid-tour ends it. The next click starts from step 1.
- The Receptionist tour exists only for RECEPTION. Nurses, pharmacists and managers get no header tour.
- Information about today's appointments shows on Dashboard "Today's Appointments", the bell's "Upcoming:" items and the Appointments calendar, each with a different time window (today vs. 48 h vs. the selected date).

---

## Defects noticed while mapping

Each was verified by reading both the frontend and the backend (or both ends of a link).

1. **Global search patient result dead-ends on an empty list.** `frontend/src/components/layout/header.tsx:418` links to `/dashboard/patients?search=<patient.id>`. `frontend/src/components/patients/PatientsManagement.tsx:142-148` seeds the search box with that id. `backend/src/modules/patients/patients.service.ts:174-182` searches only name/phone/abhaId/patientCode/email, and the id is a cuid (`backend/prisma/schema.prisma:252`), so the result is "No patients found".
2. **Global search staff result ignores the target.** `header.tsx:463` links to `/dashboard/users?search=<id>`, but `frontend/src/app/dashboard/users/page.tsx` and `components/users/UsersManagement.tsx` never read `search` (there is no `useSearchParams`). It also opens Users for roles whose sidebar hides it (`sidebar.tsx:126`), and `GET /users` has no `@Roles` (`backend/src/modules/users/users.controller.ts:68`).
3. **Global search appointment result goes nowhere specific.** `header.tsx:444` links to bare `/dashboard/appointments`. `frontend/src/app/dashboard/appointments/page.tsx:21-47` reads only `patientId` plus the doctor and date stored in localStorage.
4. **Doctor notification deep link is ignored.** `header.tsx:177` links to `/dashboard/visits?appointmentId=…` without `patientId`. `frontend/src/app/dashboard/visits/page.tsx:575-583` handles `appointmentId` only inside `if (urlPatientId)`.
5. **Doctor notifications are not scoped to the doctor.** `backend/src/modules/reports/reports.service.ts:1160-1161` queries every appointment in the branch for the next 48 h with no `doctorId`. `header.tsx:172-180` presents them as the signed-in doctor's list.
6. **Notification inventory links use dead `?tab=` params.** `header.tsx:207,214,269,277` (`?tab=low-stock`, `?tab=expiry`). `frontend/src/components/inventory/InventoryWorkspace.tsx:114-115` reads only `area`/`view`, so the link lands on Today.
7. **"Create Backup" always reports failure.** `frontend/src/app/dashboard/page.tsx:189-193` reads `result.backup.timestamp`. `backend/src/modules/auth/auth.controller.ts:191` returns `{ success, jobId }`, so a TypeError shows "❌ Backup Failed" after a successful enqueue. No client polls `GET /auth/backup/:jobId` (`auth.controller.ts:199`; no caller in `frontend/src/lib/api.ts:1111-1113`).
8. **Admin stat cards are shown to every role, and Total Users always equals Active Users.** `dashboard/page.tsx:215-236,274-289` are not gated by `showAdminControls` (`:44-47`). `auth.controller.ts:85-99` is ungated and sets `active: userCount`.
9. **"No alerts at this time" can never show, and the status is fake.** `dashboard/page.tsx:122-130` always pushes "System Status — All systems operational", and `:133-145` does the same when the alerts call fails. The empty state at `:351` is unreachable.
10. **Stock alerts are mislabelled.** `reports.service.ts:1140` counts only items with `currentStock <= 0`, while `dashboard/page.tsx:88` says "below reorder level" and the bell says "Low stock".
11. **Open redirect via `?next`.** `frontend/src/app/login/page.tsx:36-37` passes `search.get('next')` unvalidated to `router.replace`, so `?next=https://evil.example` leaves the app after a real login.
12. **`cms_next_after_login` is written but never read.** `frontend/src/lib/api.ts:253`, `frontend/src/lib/authRedirect.ts:10`. No reader exists anywhere in `frontend/src`.
13. **Phone login fails with the Indian +91 prefix.** `backend/src/modules/auth/auth.service.ts:33-46` strips only `+`, so `+91 90000 00003` becomes `919000000003`. Seed phones are stored as 10 digits (`backend/scripts/seed.ts:103`), and the result is "Account not found".
14. **Login reveals which accounts exist.** `auth.service.ts:51-53` returns 404 "Account not found" and `:64-66` returns 401 "Invalid password". The login page shows both verbatim (`login/page.tsx:39`).
15. **The mobile shell hides the whole header.** `frontend/src/components/layout/dashboard-layout.tsx:140-142` (`hidden md:block`). Below 768 px there is no global search, notifications bell, Branded switch, doctor "My Settings" (signature, letterhead, availability, WhatsApp) or Receptionist "Start Tour". The mobile bar (`:143-165`) has only the hamburger.
16. **"My Settings" is empty for non-doctors, but Save still writes and toasts.** `header.tsx:681` gates all content to DOCTOR. The "Save" button at `:780` is always shown, calls `updateUserProfile` with WhatsApp metadata, and toasts "WhatsApp preferences updated." (`:353-359`).
17. **MANAGER is shown "Reset password" and Users actions that the backend refuses.** `sidebar.tsx:126` gives MANAGER the Users link, and `components/users/UsersManagement.tsx:528` renders `ResetCodeButton` for every row. `auth.controller.ts:37` (`@Roles(OWNER, ADMIN)`) and `backend/src/modules/auth/password-reset.service.ts:9,36-39` (rank 0) return 403. User create/update use `MANAGE = [OWNER, ADMIN]` (`users.controller.ts:14,62-63`).
18. **PATIENT and LAB_TECH users get an empty sidebar but full header search over branch patients and staff.** `sidebar.tsx:48-57` excludes them from every item. `header.tsx:408,453` call `/patients` and `/users`. `backend/src/modules/patients/patients.controller.ts:35-67` has no `@Roles`, and `users.controller.ts:68` has none either. PATIENT accounts are creatable via Link Portal (`patients.service.ts:419-431`, status defaults to ACTIVE).
19. **An unknown role shows the full navigation.** `sidebar.tsx:151-156` returns every item when `role` is undefined. That happens during loading, and permanently when `/auth/me` fails with a non-401 error (`dashboard-layout.tsx:84-92`, no retry).
20. **Receptionist tour and Dashboard Guide describe UI that does not exist.** `frontend/src/components/tours/ReceptionistTour.tsx:300-310` describes stat cards showing appointments, registrations and room occupancy, but `dashboard/page.tsx:215-236` shows users, branches and status. `ReceptionistTour.tsx:319` and `dashboard/page.tsx:257` say to click appointments or alerts, but the rows (`page.tsx:354-385,410-420`) have no handlers.
21. **Quick Guide copy is stale.** `frontend/src/app/dashboard/patients/page.tsx:19-20` says "Add Patient" and "date of birth", but the button is "New Patient" (`PatientsManagement.tsx:748`). `users/page.tsx:16-17,27,35` say "Add User" (the button is "New User", `UsersManagement.tsx:432`), list Therapist/Owner roles, and describe clickable rows. `pharmacy/page.tsx:530,538-539` refer to a "Billing & GST tab" and "Inventory > Pharmacy Control", neither of which exists.
22. **Doctor "Visit Workflow Tour" highlights nothing.** `frontend/src/components/tours/DoctorTour.tsx` has 0 `element:` anchors in `getDoctorVisitTourSteps` (`:271`), so all 19 steps float even when the text says "this panel".
23. **No custom 404 or error boundary, and a 404 leaves the shell.** There is no `not-found.tsx` or `error.tsx` anywhere under `frontend/src/app`. Unknown `/dashboard/*` paths render Next's bare 404 without sidebar, header or Log out.
24. **The session cookie outlives the JWT.** `auth.controller.ts:67` sets cookie `maxAge` to 7 days, while `backend/src/shared/config/env.validation.ts:19-21` defaults `JWT_EXPIRES_IN` to `1d`. Middleware (`frontend/src/middleware.ts:14-16`) admits expired sessions, so the page renders and then bounces to login with no "session expired" message. `dashboard-layout.tsx:86-88` also redirects to `/login` without `next`, racing the API client's `next`-preserving redirect (`api.ts:243-255`). This race is unconfirmed and needs checking in a browser.
