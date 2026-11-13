# Topic 10: Sign-in, role landing, navigation and recovery

Sources read: `FE/app/login/page.tsx`, `FE/app/reset-password/page.tsx`, `FE/middleware.ts`, `FE/lib/authRedirect.ts`, `FE/lib/api.ts` (401 handling, `logout`), `FE/components/layout/{dashboard-layout,sidebar,header}.tsx`, `FE/components/auth/AuthCard.tsx`, `FE/components/users/ResetCodeButton.tsx`, `FE/app/dashboard/page.tsx`, `FE/app/dashboard/fees/page.tsx`, `BE/modules/auth/{auth.controller,auth.service,password-reset.service}.ts`.

Facts that recur across stories:
- The login form submits on Enter (it is a `<form>`), so "Sign in" is a click only for mouse users. Nothing remembers the identifier ("Phone or email") between sessions; there is no "remember me" and no "show password".
- The auth cookie lives 7 days (`maxAge` in `auth.controller.ts`), so a normal re-login happens about once a week or after "Log out".
- Login and reset-password are both throttled to 5 attempts per minute per client on the server.
- The Branded switch appears on the login page and in the desktop header (same control twice).
- Name and role of the signed-in user appear only in the sidebar footer. On a phone that footer is inside the drawer.
- There is no `error.tsx`, `not-found.tsx` or `loading.tsx` anywhere under `FE/app`; every role/permission failure is an inline per-page message.

---

## SIGNIN-NAVIGATION-01: Receptionist signs in at the start of the day

**Type**: short
**Topic**: Sign-in, role landing, navigation and recovery
**Persona**: Ananya Reddy, receptionist at Linae Skin and Hair Clinic, Hyderabad, arriving at 9:00 and opening the clinic site on the front-desk PC
**Goal**: Get from a closed browser to the Dashboard as RECEPTION
**Preconditions**: Active RECEPTION account (ananya.reddy@linaeclinic.in), no `auth_token` cookie (logged out or expired after 7 days)
**Ideal path**: 3 - type the identifier, type the password, press Enter; the identifier is the only thing a browser could not already know, and the app needs nothing else.
**Alternate paths**: Opening `/dashboard` directly (or any `/dashboard/*` URL) does the same redirect via `middleware.ts` but carries `next=` for that page; the browser's saved-password autofill can fill both fields (then step 4 is the only action). None found for signing in a different way (no SSO, no OTP, no "remember me").

### Steps
1. Open the clinic address in the browser → `/` redirects to `/dashboard`, `middleware.ts` finds no `auth_token` cookie and redirects to `/login?next=%2Fdashboard`; card "ClinicMS Login" with the clinic letterhead image, field "Phone or email" is focused (autoFocus)
2. Type "ananya.reddy@linaeclinic.in" in "Phone or email" (required field; placeholder "Phone or email"; a phone number is also accepted) → "Sign in" is still disabled
3. Type the password in "Password" (required field; masked) → "Sign in" becomes enabled
4. Click "Sign in" (or press Enter) → button shows "Signing in…", `POST /auth/login` sets the HttpOnly cookie, `router.replace('/dashboard')`; Dashboard shows with sidebar entries Dashboard, Patients, Appointments, Rooms, Pharmacy Desk, Pharmacy Counter, Inventory

### Variations
- Sign in with the 10-digit mobile 98480 12345 instead of the email: the server strips non-digits and looks it up as stored (see story 07 for what happens when the stored number carries a country code).
- Press Enter in "Password" instead of clicking "Sign in": same result, one fewer pointer move.

### Edge Cases
- Submit with one field empty: "Sign in" is disabled, so the message "Phone or email and password are required" in `submit()` is unreachable by click.
- Same facts on several surfaces: after landing, her name and role "RECEPTION" show only in the sidebar footer; the Dashboard greeting ("Welcome back! Here's what's happening at your clinic today.") does not name her.
- Every role lands on the same `/dashboard`; there is no reception-specific landing, so the first screen contains "Total Users", "Active Users", "Total Branches", "System Status" cards that mean nothing to a receptionist (the statistics endpoint has no role check).

---

## SIGNIN-NAVIGATION-02: Doctor returns to an exact visit after the session lapsed

**Type**: short
**Topic**: Sign-in, role landing, navigation and recovery
**Persona**: Dr. Kavita Rao, dermatologist, reopening a bookmarked visit link after lunch
**Goal**: Sign back in and land on the same visit page she bookmarked, not the Dashboard
**Preconditions**: DOCTOR account; no valid `auth_token` cookie; bookmark `/dashboard/visits?patientId=P-1042&appointmentId=A-5531&autoStart=true`
**Ideal path**: 3 - type identifier, type password, submit; the return address is already known to the app.
**Alternate paths**: Two separate mechanisms do the same "remember where I was" job: (a) `middleware.ts` redirect adds `next=` when the cookie is absent; (b) `apiClient` on any 401 and `handleUnauthorizedRedirect` in `authRedirect.ts` add `next=` and also write `cms_next_after_login` to localStorage. A third path, `DashboardLayout.fetchCurrentUser`, redirects a 401 from `/auth/me` to plain `/login` with no `next`. The localStorage value is never read by the login page (it reads only the `next` query), so it is dead state.

### Steps
1. Click the bookmark → `middleware.ts` redirects to `/login?next=%2Fdashboard%2Fvisits%3FpatientId%3DP-1042%26appointmentId%3DA-5531%26autoStart%3Dtrue`; "ClinicMS Login" shown
2. Type "kavita.rao@linaeclinic.in" in "Phone or email" (required field) → field accepted
3. Type the password in "Password" (required field) → "Sign in" enabled
4. Click "Sign in" → `loginDestination(next)` accepts it (starts with `/`, not `//`, no backslash or control characters) and `router.replace` opens the visit directly with the query intact

### Variations
- Cookie present but its JWT expired: the Dashboard shell renders, `/auth/me` returns 401; `apiClient` sets `window.location.href = /login?next=...` while `DashboardLayout` also calls `router.replace("/login")`. Whichever navigation wins decides whether she returns to the visit or lands on `/dashboard` after sign-in.
- Unsaved visit text: the visit form autosaves drafts to localStorage, so text typed before expiry survives, but the sign-in page gives no hint of that.

### Edge Cases
- A hand-edited `next=//evil.example` or `next=/%2f...` is rejected by `loginDestination` and falls back to `/dashboard`.
- The Google Calendar callback `/dashboard/appointments/google-callback` is exempt from the cookie redirect in `middleware.ts`.

---

## SIGNIN-NAVIGATION-03: Doctor jumps to the next patient from the notification bell

**Type**: short
**Topic**: Sign-in, role landing, navigation and recovery
**Persona**: Dr. Kavita Rao, between consultations on the desktop
**Goal**: Open the visit for the next booked patient (Rohit Verma, 10:30) without going through the calendar
**Preconditions**: Signed in as DOCTOR on a desktop-width window; at least one upcoming appointment within the alerts window (the Admin summary says "Within 48 hours")
**Ideal path**: 2 - open the list of upcoming patients, click one.
**Alternate paths**: Sidebar "Appointments" > calendar row "START" or "Appointment Details" > "Start Visit"; Dashboard card "Today's Appointments" (rows are not clickable; only "View All Appointments"); Dashboard "Recent Visits" and "My Patients" panels; Patients row "Start Visit"; Visits setup "Start Visit Documentation". The bell is one of about eight routes to start a visit.

### Steps
1. Click the bell button labelled "Notifications" in the header (badge shows the item count, "9+" above 9) → dropdown titled "Notifications"; each row reads like "Rohit Verma on 13 Nov 2026, 10:30" with sub-line "OPD • CONFIRMED" (up to 6 rows for a doctor); list refreshes every 60 s
2. Click the "Rohit Verma" row → `router.push('/dashboard/visits?appointmentId=<id>')`; Visits page opens for that appointment (no `autoStart`, so the setup screen or resume view appears, one more action may follow)

### Variations
- No alerts: dropdown shows "No notifications" and no badge.
- Items listed have no section for "now"; a patient already marked IN_PROGRESS appears in the same list as one a day away.

### Edge Cases
- The bell lives in the desktop header only. On a phone-width window the header is hidden (see story 06), so a doctor on a phone has no bell.
- Same information on several surfaces: upcoming appointments appear in the bell, Dashboard "Today's Appointments", the Appointments calendar, and Dashboard "Recent Visits" for finished ones; the bell's second dropdown row "View reports & alerts" goes to `/dashboard/reports`, which doctors have no sidebar entry for.

---

## SIGNIN-NAVIGATION-04: Pharmacist logs out at closing time

**Type**: short
**Topic**: Sign-in, role landing, navigation and recovery
**Persona**: Suresh Naidu, pharmacist, closing the counter PC at 9 pm
**Goal**: End the session so the next person cannot use his login
**Preconditions**: Signed in as PHARMACIST; desktop layout
**Ideal path**: 1 - one click on a clearly labelled sign-out control.
**Alternate paths**: none found (no logout in the header, no profile menu; the only control is the icon button in the sidebar footer). Closing the browser does not log out (cookie lasts 7 days).

### Steps
1. Click the icon-only button "Log out" (door icon, `aria-label="Log out"`, no visible text) at the bottom right of the sidebar footer, next to the avatar "SN", "Suresh Naidu", "PHARMACIST" → no confirmation dialog; `POST /auth/logout` expires the cookie, `router.replace('/login')`; "ClinicMS Login" appears
2. Press the browser Back button → `/dashboard` is requested without a cookie and `middleware.ts` redirects to `/login?next=%2Fdashboard`; Dashboard content is not shown

### Variations
- The logout request fails (offline): `apiClient.logout` swallows the error and clears client state; he still lands on `/login`, but the HttpOnly server cookie may remain, so Back may show the Dashboard again. Nothing tells him.
- Open Pharmacy Counter dispense work in another tab: no warning about unsaved or in-progress dispense tasks.

### Edge Cases
- Logout has no confirmation; it guards nothing and loses nothing server-side, but an unsaved Sales bill form is dropped silently.
- Same information on several surfaces: who is signed in appears only in the sidebar footer, so on a shared counter PC the user can only confirm the account by looking at that corner.

---

## SIGNIN-NAVIGATION-05: Receptionist orients herself: what her menu shows and what it does not

**Type**: medium
**Topic**: Sign-in, role landing, navigation and recovery
**Persona**: Ananya Reddy, receptionist, a walk-in customer asks to buy a moisturiser from the clinic pharmacy
**Goal**: Reach the day's appointments, then find out whether she can ring up a pharmacy sale
**Preconditions**: Signed in as RECEPTION on a desktop-width window, on `/dashboard`; at least one overdue pharmacy invoice exists
**Ideal path**: 3 - open Appointments, open Pharmacy, and see a plain statement of what Reception can and cannot do there; the menu and landing should already be built for her role.
**Alternate paths**: Appointments via sidebar "Appointments" (same as the Dashboard button); Pharmacy via sidebar "Pharmacy Desk", "Pharmacy Counter" (two entries, same page with `?section=desk|counter`), or by typing the URL. A pharmacy sale for a RECEPTION user could also be reached by Inventory > Sales > "Counter sales" (Inventory is in her menu) - the code offers it but it is a different workflow.

### Steps
1. Click "View All Appointments" in the Dashboard card "Today's Appointments" (she is in `APPOINTMENT_READ_ROLES`) → `/dashboard/appointments` with Calendar/Slots tabs
2. Click "Pharmacy Desk" in the sidebar (section "Pharmacy") → `/dashboard/pharmacy?section=desk`; because `sells` is false for RECEPTION, the metric strips, "Invoices", "Drugs" and "New sale" are not shown
3. Click "Pharmacy Counter" in the sidebar → `/dashboard/pharmacy?section=counter` (the sidebar highlights this one via `pharmacySection`); the Queue/Active Dispense panels show, with "Walk-in bill" in the empty queue
4. Click the bell "Notifications" → dropdown lists "Upcoming: ..." rows and "Overdue Invoice INV-2411" rows (4 upcoming plus 3 overdue at most)
5. Click "Overdue Invoice INV-2411" → `router.push('/dashboard/pharmacy/sales?pay=CREDIT')`, a Sales page her sidebar has no entry for; the page loads and the API decides what she sees (no frontend route guard exists, only an inline error if the API refuses)
6. (optional) Type `/dashboard/pharmacy/sales` into the address bar → same page; proves that hidden menu items are the only gate

### Variations
- Same walk as NURSE: sidebar has only Dashboard, Patients, Appointments, Visits, Rooms; the Dashboard still shows "Total Users" and "System Status" cards.
- Same walk as ACCOUNTANT (3 menu items): lands on Dashboard with "Today's Appointments" hidden because the role is not in `APPOINTMENT_READ_ROLES`.

### Edge Cases
- Pharmacy Desk and Pharmacy Counter are two menu entries for one route; both are visible to RECEPTION, DOCTOR, PHARMACIST, ADMIN.
- A role asked to do something it cannot: the Dashboard shows "Couldn't load today's appointments" with "Your account does not have access to this yet. Ask an admin to check your role permissions." and "Try again" (a 403) vs a network failure shows "This is not an empty list. Check your connection and try again."
- Same information on several surfaces: overdue invoices appear in the bell, in Dashboard "System Alerts" (card "Overdue Invoices") and on Sales `?pay=CREDIT`.

---

## SIGNIN-NAVIGATION-06: Receptionist on a phone: sign in, find a patient, sign out

**Type**: medium
**Topic**: Sign-in, role landing, navigation and recovery
**Persona**: Ananya Reddy, standing at the clinic door with her Android phone because the desk PC is busy
**Goal**: Sign in, look up the patient "Lakshmi Prasad" and then sign out
**Preconditions**: RECEPTION account; phone-width viewport (below the `md` breakpoint); logged out
**Ideal path**: 7 - sign-in is 3 (identifier, password, submit); a search box always visible on the phone is 2 (type, open result); sign-out is 2 (open menu, tap Log out). The desktop header's global search and bell are the missing parts.
**Alternate paths**: Patient lookup: global search in the desktop header (not rendered on phone), Patients page search "Search by name, phone, ABHA, or email (min 2 chars)", or the Appointments calendar's "Search patient by name/phone". Navigation: the drawer is the only route on phone. Sign-out: only the sidebar footer (inside the drawer).

### Steps
1. Open `/dashboard` in the phone browser → redirected to `/login?next=%2Fdashboard`; the login card fits (`max-w-md`)
2. Type the email in "Phone or email" (required field) → keyboard opens in email mode (`inputMode="email"`), so typing a phone number needs a keyboard switch
3. Type the password in "Password" (required field) → enabled "Sign in"
4. Tap "Sign in" → Dashboard; top bar (`h-14`) shows a menu button "Open clinic navigation" and the text "ClinicMS"; no search box, bell, gear, "Branded" switch or tour button, because the whole `Header` is `hidden md:block`
5. Tap "Open clinic navigation" → dialog "Clinic navigation" (sr-only title) slides in as a 288 px panel with the same Sidebar
6. Tap "Patients" → drawer closes (`onNavigate`), `/dashboard/patients`
7. Tap the search field "Search by name, phone, ABHA, or email (min 2 chars)" → keyboard opens
8. Type "Lakshmi" (required for results, 2+ chars) → list filters
9. Tap "Open clinic navigation" → drawer
10. Tap "Appointments" → `/dashboard/appointments`, to check whether Lakshmi is booked
11. Tap "Open clinic navigation" → drawer again (no notifications anywhere to check instead)
12. Tap the "Log out" icon in the drawer footer → no confirmation, `/login`
13. (observe) Press Back → redirected to `/login?next=...`

### Variations
- Drawer dismissal: tap outside or the dialog's close control; the menu button state is controlled by `navigationOpen`, so navigating always closes it.
- Landscape or tablet width above `md`: the full sidebar and header return and the drawer disappears.

### Edge Cases
- A phone user cannot reach notifications, global search, "My Settings" (doctor signature, WhatsApp) or the "Branded" switch at all.
- Same information on several surfaces: the drawer duplicates the desktop sidebar exactly (one `Sidebar` component rendered twice, in a hidden desktop wrapper and in the drawer).

---

## SIGNIN-NAVIGATION-07: Nurse forgets her password and recovers with a reset code

**Type**: medium
**Topic**: Sign-in, role landing, navigation and recovery
**Persona**: Priya Nair, nurse, back from two weeks of leave, has just been handed the one-time code K7MQ-4XWP by the owner in person
**Goal**: Set a new password and be signed in
**Preconditions**: NURSE account; admin has issued a code (valid 24 hours, single use); user is on the login page
**Ideal path**: 5 - click the reset link, type the code, type the new password, submit; the app should then sign her in (it knows who the code belongs to). Confirm-password and re-typing the identifier are both avoidable.
**Alternate paths**: none found for self-service (no email or SMS reset; the only other route is the server operator's issue-reset-code script, not a UI). Reached from the login page link "enter your reset code" or by typing `/reset-password`.

### Steps
1. Open `/login` → "ClinicMS Login"
2. Type "priya.nair@linaeclinic.in" in "Phone or email" (required field)
3. Type her remembered password in "Password" (required field) - wrong
4. Click "Sign in" → red alert "Invalid password" (backend `401`)
5. Retype the password in "Password" (required field) - still wrong
6. Click "Sign in" → "Invalid password" again (attempts 2 of 5 per minute)
7. Click the link "enter your reset code" in the sentence "Forgot password? Ask your clinic admin for a reset code, then enter your reset code." → `/reset-password`, card "Set a new password"
8. Type "K7MQ-4XWP" in "Reset code" (required field; placeholder ABCD-EFGH; help text "The 8-character code your clinic admin gave you. It works once and expires after 24 hours."; dash, spaces and case are ignored by `normalizeResetCode`)
9. Type a new password in "New password" (required field; 8 to 72 characters; help text "At least 8 characters.")
10. Type the same password in "Confirm new password" (required field) → client checks length and match before calling the server
11. Click "Set new password" → button "Saving…", then status text "Password updated. Taking you to sign in…"
12. Wait 2.5 seconds, or click "Back to sign in" → `/login`
13. Type "priya.nair@linaeclinic.in" in "Phone or email" again (required field; the app already knows this, she typed it in step 2)
14. Type the new password in "Password" (required field; a third entry of what she just chose)
15. Click "Sign in" → `/dashboard` for NURSE (menu: Dashboard, Patients, Appointments, Visits, Rooms)

### Variations
- Code mistyped or already used or expired: the same red alert "This reset code is invalid or has expired. Ask an admin for a new one." for every rejection reason (by design, no hints).
- Passwords differ: "The two passwords do not match." (client side, no server call); under 8 characters: "Use 8 to 72 characters."

### Edge Cases
- Failed attempts: login and reset are each limited to 5 per minute; a sixth attempt returns the server's throttling message in the same red alert and she must wait.
- Wrong-identifier messages are not uniform: an unknown identifier shows "Account not found" (reveals whether an account exists), a suspended one "Account suspended", a wrong phone format "Phone number must be between 7 and 15 digits". A staff member typing a 10-digit Indian mobile without the 91 prefix would pass the length check and, if the stored number carries the country code, get "Account not found".
- The reset page has no "Branded" switch and no tour; it reuses `AuthCard`, a separate shell from the login card (login does not use `AuthCard`).

---

## SIGNIN-NAVIGATION-08: Owner issues a reset code for a locked-out nurse

**Type**: medium
**Topic**: Sign-in, role landing, navigation and recovery
**Persona**: Dr. Meera Iyer, clinic owner, Priya Nair is standing in front of her
**Goal**: Hand Priya a one-time reset code
**Preconditions**: Signed in as OWNER (or ADMIN) on the Dashboard; Priya's user record exists and is active
**Ideal path**: 3 - open Users, click "Reset password" on Priya's row, confirm and show the code; the confirmation can be the same click that creates it.
**Alternate paths**: none found in the UI. The password-reset service mentions the server operator's issue-reset-code script, which is not a screen. The "Edit User" dialog on the same row is a different, non-reset way to change a user and does not set passwords by a code.

### Steps
1. Click "Users" in the sidebar (section "Admin") → `/dashboard/users`, page "Users Management", table "All Users"
2. Find Priya Nair's row in the table (no click; scroll if the list is long) → row buttons "Edit", "Delete", "Reset password"
3. Click "Reset password" on her row → dialog "Reset password for Priya Nair" with warnings "Only issue a code to Priya Nair after confirming in person that they are asking. Anyone with the code can set this account's password." and "Issuing a code cancels any earlier code for them. It is recorded in the audit log."
4. Click "I have confirmed who is asking. Create code" (this is the confirmation that guards handing out account access; there is no second dialog) → button "Creating code…", then the dialog shows the code "K7MQ-4XWP" in large type and "It works once and expires 14 Nov 2026, 9:42 am"
5. (optional) Click "Copy code" → code copied to clipboard
6. Read the code to Priya, then close the dialog → closing resets it to the confirm step; the code is never shown again ("This code is shown only once. Closing this window does not cancel it; issuing another code does.")

### Variations
- A MANAGER sees "Users" in the sidebar and the same "Reset password" button, but `POST /auth/users/:id/reset-code` is limited to OWNER and ADMIN; after step 4 the dialog shows an error. The button is visible to a role that cannot use it, and appears on every row including the owner's own.
- An ADMIN issuing a code for an OWNER gets "You cannot reset the password of a user at or above your role."

### Edge Cases
- Same information on several surfaces: the reset instructions appear in this dialog ("They open the sign-in page, choose enter your reset code..."), on the login page, and on the reset page's help text, all in slightly different words.
- If the code is lost (dialog closed before it was read), the only recovery is issuing another code.

---

## SIGNIN-NAVIGATION-09: Owner's morning round across alerts, collection, backup, search and staff access

**Type**: long
**Topic**: Sign-in, role landing, navigation and recovery
**Persona**: Dr. Meera Iyer, owner, doing her routine check from the owner's PC before clinic opens
**Goal**: Sign in, act on the stock alerts, check yesterday's collection, take a backup, look up a patient, review staff access for Priya Nair and sign out
**Preconditions**: OWNER account (ADMIN differs only by also seeing Pharmacy Desk and Pharmacy Counter); logged out; low-stock and near-expiry items exist; a patient "Lakshmi Prasad" exists
**Ideal path**: 13 - sign-in 3; bell directly to low-stock list 2; Daily Collection 1; backup 1 (back on Dashboard is 1 more); search 2 (type, Enter); reset code 3; sign out 1. The gear dialog and the second visit to the Dashboard are not part of the goal.
**Alternate paths**: Low stock is reachable from the bell, Dashboard "System Alerts" (summary only, no link), sidebar Inventory (`Today` card "Low stock"), Reports page "Low Stock Alerts", Pharmacy Report "Expiring Stock". Backup: only the Dashboard "Create Backup" (the API also exposes `POST /auth/backup` and a job status route, without UI). Patient lookup: header search, Patients page search. Daily Collection: sidebar "Daily Collection" or Pharmacy Report > Daily Collection (same workspace).

### Steps
1. Open the clinic address → redirected to `/login?next=%2Fdashboard`
2. Type "meera.iyer@linaeclinic.in" in "Phone or email" (required field)
3. Type the password in "Password" (required field)
4. Click "Sign in" → `/dashboard`; Dashboard sidebar for OWNER: Dashboard, Daily Collection; Patients, Appointments, Visits, Procedures, Rooms; Sales, Inventory, Pharmacy Report; Reports, Users, Fee list, Test Transcribe (14 entries; no Pharmacy Desk or Pharmacy Counter)
5. Click the bell "Notifications" (badge "5" in red because one item is destructive) → owner summary rows: "6 low-stock items - Restock inventory", "2 near-expiry items - Check expirations", "3 overdue invoices - Billing attention needed", "4 upcoming appointments - Within 48 hours"
6. Click "6 low-stock items" → `router.push('/dashboard/inventory?tab=low-stock')`; Inventory workspace ignores `tab` (it reads `area` and `view`) and opens its Today screen, so she must find "Low stock" among the cards in "What needs attention" herself
7. Click "Daily Collection" in the sidebar (section "Overview") → `/dashboard/pharmacy/reports?report=daily-collection`; one day's clinic and pharmacy takings by payment mode with a cash count
8. Click "Dashboard" in the sidebar → `/dashboard`, stat and alert cards reload with skeleton "Loading dashboard…"
9. Click "Create Backup" in the card "Admin Controls" (section "Database Backup"; no confirmation dialog guards a whole-database dump) → button "Creating..."
10. Click "OK" on the browser alert "Database backup created successfully! Timestamp ... Location ... Size ... Backup saved to local server directory." → alert dismissed (failure shows a different alert "Backup Failed")
11. Click the header search box "Search patients, appointments, doctors..." → focus; results stay hidden until 2+ characters
12. Type "Lakshmi" (optional text, 2+ characters needed; 300 ms debounce) → dropdown with Patient, Appointment and Staff results
13. Click the first Patient result "Lakshmi Prasad" → `/dashboard/patients?search=<patient id>`; the Patients list search is seeded with the internal id rather than her name
14. Click "Open settings" (gear) → dialog "My Settings"; for an owner it contains no fields at all, only the buttons "Close" and "Save"
15. Click "Close" → back to the patients list
16. Click "Users" in the sidebar → "Users Management", table "All Users"
17. Click "Reset password" on Priya Nair's row → dialog "Reset password for Priya Nair"
18. Click "I have confirmed who is asking. Create code" (guards the account: anyone with the code can set the password) → code "K7MQ-4XWP" shown once
19. Click "Copy code" (optional) → copied
20. Close the dialog → confirm step restored; code gone
21. Click the "Log out" icon in the sidebar footer → `/login`, no confirmation

### Variations
- Instead of step 5-6, click "View reports & alerts" at the bottom of the bell: goes to `/dashboard/reports` ("Reports & Analytics").
- ADMIN signs in: the same walk plus "Pharmacy Desk" and "Pharmacy Counter" in the menu.
- The owner types `/dashboard/pharmacy?section=desk` directly: Pharmacy Desk is hidden from OWNER's menu but the route is not guarded in the frontend.

### Edge Cases
- Backup: only OWNER and ADMIN can create one; a DOCTOR who tried the API directly would get 403 "Insufficient permissions. Admin access required." (a deliberate exception to doctors passing every role check).
- Alerts load failure: Dashboard card "System Alerts" shows "Couldn't load clinic alerts" with "Try again"; the bell silently shows "No notifications" on any error, so a failure looks like an all-clear.
- Same information on several surfaces: low-stock and expiry counts appear in the bell, Dashboard "System Alerts" (Low Stock Alert, Expiring Items), Inventory Today, Reports "Low Stock Alerts" and Pharmacy Report "Expiring Stock"; overdue invoices appear in the bell, "System Alerts" and Sales `?pay=CREDIT`; "Daily Collection" and "Pharmacy Report" in the sidebar open the same workspace.
- "Test Transcribe" (a developer test page) is in the owner's production menu next to Fee list.
