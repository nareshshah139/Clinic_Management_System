# Sign-in, app shell & dashboard

> Topic slug: `auth-shell-dashboard`. Written from a read-only pass over the code; nothing was run.
> Paths are relative to `frontend/src/` unless prefixed. Quoted strings are the literal UI copy in the
> source. Where an outcome is deduced from two pieces of code rather than read off one line, it is
> marked **(derived from code — confirm when walked)**.
>
> Things that apply to every story below:
> - Every API error message shown to the user has ` (Reference: <uuid>)` appended by `lib/api.ts`
>   (`request()`), including the login and reset-password errors.
> - The desktop header (search, `Start Tour`, `Branded`, bell, cog, user name) is rendered only at
>   `md` width and above (`components/layout/dashboard-layout.tsx`).
> - The signed-in user's name appears twice on desktop: header right (name only) and sidebar footer
>   (initials, name, raw role enum such as `RECEPTION`). Neither is a menu. Logout exists only in the
>   sidebar footer.

---

## STORY-001: Receptionist signs in with her phone number at the start of the shift

**Type**: short
**Topic**: Sign-in, app shell & dashboard
**Persona**: Riya Sharma, receptionist, 8:50 am on a Monday with two patients already at the desk
**Goal**: Get from a closed browser to a working dashboard
**Preconditions**: Riya has an ACTIVE user with role RECEPTION, phone stored as `9848022417`; no `auth_token` cookie in this browser
**Ideal path**: 3 — identifier, password, submit; nothing else is needed to authenticate.
**Alternate paths**: none found for authenticating (one form, no SSO / OTP / sign-up). Entry points that all funnel into the same form: `/` (server redirect to `/dashboard`), any `/dashboard/*` URL without a cookie (middleware redirect to `/login?next=…`), `/login` typed directly, and `Back to sign in` on `/reset-password`.

### Steps
1. Riya opens the clinic bookmark (`/`) → `app/page.tsx` redirects to `/dashboard`; `middleware.ts` finds no `auth_token` cookie and redirects to `/login?next=%2Fdashboard`. She sees the letterhead image, the heading "ClinicMS Login", and a `Branded` switch in the top-right corner.
2. The "Phone or email" field already has focus. She types `98480 22417` → the server strips the space before lookup (`auth.service.ts` `validateUser`). The `Sign in` button stays disabled until both fields have content.
3. She tabs to "Password" and types her password. She hesitates: the placeholder is `••••••••` and there is no show-password control, so she cannot check what she typed.
4. She presses Enter (or clicks `Sign in`) → button shows a spinner and "Signing in…"; the server sets an HttpOnly `auth_token` cookie valid for 7 days; the page does `router.replace('/dashboard')`.
5. The dashboard shows "Dashboard — Welcome back! Here's what's happening at your clinic today." with a skeleton labelled "Loading dashboard…", then the stat cards, `System Alerts` and `Today's Appointments`. The sidebar footer shows `RS`, "Riya Sharma", `RECEPTION`.

### Variations
- **Signs in with e-mail**: typing `riya@linaeclinic.in` (anything containing `@`) switches the server to a case-insensitive e-mail lookup. Same 3 actions.
- **Wrong password**: an inline red `role="alert"` line reads "Invalid password (Reference: 3f2a…)" — the reference UUID is appended to every error. She retypes the password and submits again (+2 actions).
- **Mistyped number**: "Account not found (Reference: …)". The copy distinguishes an unknown account from a wrong password.
- **Number typed with a leading zero** (`09848022417`): "Phone number must start with a valid country code". The lookup is an exact match on the stored digits, so `919848022417` also fails if the user was saved as `9848022417` **(derived from code — confirm when walked)**.
- **Deep link**: if she had opened a bookmarked `/dashboard/appointments`, `next` carries that path and she lands there instead of the dashboard (see STORY-003).

### Edge Cases
- **Empty submit**: the button is disabled; if submitted anyway the client shows "Phone or email and password are required".
- **Suspended or disabled account**: "Account suspended" / "Account disabled" (HTTP 403).
- **Six tries in a minute**: login is throttled to 5 attempts per minute per client (`auth.controller.ts`); the sixth returns HTTP 429. POSTs are not retried by the client, so the throttle message is shown inline (exact wording unverified).
- **Phone keyboard**: the identifier input is `type="text" inputMode="email"`, so a phone shows the e-mail keyboard even though the label offers "Phone" first.
- **Already signed in and opens `/login`**: the form is shown anyway; nothing redirects a signed-in user away from it.
- **Unsafe `next`** (`//evil.example`, backslashes, control characters, `/%2f…`): ignored; destination falls back to `/dashboard` (`loginDestination` in `app/login/page.tsx`).

---

## STORY-002: Locked-out nurse gets a one-time reset code from the admin and sets a new password

**Type**: medium
**Topic**: Sign-in, app shell & dashboard
**Persona**: Lakshmi Devi, nurse, back from two weeks' leave and cannot remember her password; Praveen Reddy, clinic admin, at the back-office PC
**Goal**: Lakshmi can sign in again without anyone else learning her password
**Preconditions**: Lakshmi's user is ACTIVE. Praveen is signed in as ADMIN (or OWNER). Both are physically in the clinic.
**Ideal path**: 8 — admin: open Users, `Reset password` on the row, confirm (3); nurse: open the reset page, code, new password, confirm, submit (5) and be signed in. The code hand-off is deliberate (in person, by design per `@cc admin-reset-code`), so it cannot be removed, but the second sign-in afterwards could be.
**Alternate paths**: none found in the UI. Not UI: a server operator script (`issueResetCodeAsOperator` in `backend/src/modules/auth/password-reset.service.ts`) for when no OWNER/ADMIN can sign in; the API `POST /users/:id/change-password` exists but no screen calls it. The Users "Edit User" dialog does **not** offer a password field (it appears only when creating a user).

### Steps
1. Lakshmi opens `/login`, types `9000412766` and what she thinks is her password, presses Enter → "Invalid password (Reference: …)".
2. She tries a second guess → same error. She stops, aware she may lock herself out (5 attempts a minute).
3. She reads the line under the button: "Forgot password? Ask your clinic admin for a reset code, then enter your reset code." There is no e-mail or SMS self-service, so she walks to Praveen.
4. Praveen, already signed in, clicks `Users` in the sidebar (Admin section) → `/dashboard/users`, header "Users Management".
5. He scans the users table for "Lakshmi Devi" (no search box was found in `components/users/UsersManagement.tsx`; with ~10 staff this is a visual scan).
6. In her row he clicks `Reset password` (key icon; sits beside `Edit` and `Delete`) → dialog "Reset password for Lakshmi Devi" with the warning "Only issue a code to Lakshmi Devi after confirming in person that they are asking. Anyone with the code can set this account's password." and "Issuing a code cancels any earlier code for them. It is recorded in the audit log."
7. He clicks `I have confirmed who is asking. Create code` → button reads "Creating code…", then the dialog shows the code in large monospace, e.g. `K7MP-X4QD`, with "Give this code to Lakshmi Devi in person. It works once and expires 14 Nov 2026, 9:12 am." and "This code is shown only once. Closing this window does not cancel it; issuing another code does."
8. He clicks `Copy code` → the code goes to the clipboard; **no toast or "Copied" state confirms it**, so he clicks it a second time to be sure, then writes the code on a sticky note instead (Lakshmi is on a different computer, so the clipboard does not help).
9. He closes the dialog (X or Esc) → the dialog resets to the confirm step; the code can never be displayed again.
10. Back at the nurses' station Lakshmi clicks the link `enter your reset code` on the login page → `/reset-password`, card title "Set a new password".
11. She types `k7mp x4qd` into "Reset code" (placeholder `ABCD-EFGH`; helper "The 8-character code your clinic admin gave you. It works once and expires after 24 hours."). Case, spaces and dashes are ignored by the server.
12. She types a new password in "New password" (helper "At least 8 characters.").
13. She retypes it in "Confirm new password".
14. She clicks `Set new password` → "Saving…", then the form is replaced by "Password updated. Taking you to sign in…" and after 2.5 s the page goes to `/login`.
15. She types her phone number again, the new password, and presses Enter (3 actions) → `/dashboard`.

Honest count: 2 failed attempts aside, 6 admin actions (steps 4–9) + 8 nurse actions (steps 10–15) = 14.

### Variations
- **Admin resets another admin (or an owner)**: the server refuses — "You cannot reset the password of a user at or above your role." shown as a red alert in the same dialog; only an OWNER can reset an ADMIN or OWNER (`ROLE_RANK` in `password-reset.service.ts`). The `Reset password` button is nevertheless shown on every row.
- **Manager opens Users**: MANAGER has the Users sidebar entry and sees the `Reset password` button, but `POST /auth/users/:id/reset-code` is `@Roles(OWNER, ADMIN)`; the click ends in an error inside the dialog.
- **Praveen issues a second code** because the sticky note was lost: the first code silently stops working.
- **Lakshmi changes her mind** and remembers the password: `Back to sign in` returns to `/login`; the unused code stays valid for 24 h.

### Edge Cases
- **Wrong, expired or already-used code**: one message for all cases — "This reset code is invalid or has expired. Ask an admin for a new one. (Reference: …)".
- **Passwords differ**: client-side "The two passwords do not match." before any request.
- **Too short / too long**: "Use 8 to 72 characters." Note the mismatch with user creation, where the admin form demands "Password (8-20 chars)".
- **Brute force**: reset is throttled to 5 attempts a minute per client.
- **Visual discontinuity**: `/login` has the letterhead image and a `Branded` switch; `/reset-password` uses `components/auth/AuthCard.tsx` and has neither.

---

## STORY-003: Accountant returns after a week away and is sent back to the report she bookmarked

**Type**: short
**Topic**: Sign-in, app shell & dashboard
**Persona**: Meenakshi Iyer, part-time accountant, comes in on Friday evenings to tally cash
**Goal**: Open Daily Collection straight from her bookmark
**Preconditions**: Role ACCOUNTANT. Her 7-day `auth_token` cookie has expired. Bookmark is `/dashboard/pharmacy/reports?report=daily-collection`.
**Ideal path**: 3 — identifier, password, submit; the app should then return her to the bookmarked report without further navigation.
**Alternate paths**: after signing in to the plain dashboard she can reach the same screen via sidebar `Daily Collection` (Overview section) or sidebar `Pharmacy Report` → "Daily Collection" in the Accounting category (the same report under two sidebar entries).

### Steps
1. She clicks the bookmark → middleware sees no cookie and redirects to `/login?next=%2Fdashboard%2Fpharmacy%2Freports%3Freport%3Ddaily-collection`. Nothing on the login page tells her she will be returned to the report.
2. She types `meenakshi@linaeclinic.in` in "Phone or email".
3. She types her password.
4. She clicks `Sign in` → `router.replace` to the full `next` value, query string intact → the Daily Collection report opens inside the shell; sidebar highlights `Daily Collection` (not `Pharmacy Report`, because the deeper link wins in `linkIsActive`).

### Variations
- **Cookie present but token rejected** (e.g. server secret rotated): middleware lets the page through because it only checks that the cookie exists. The shell renders, `GET /auth/me` returns 401, and two redirects fire: `lib/api.ts` sets `window.location.href = /login?next=<path+query+hash>` and `dashboard-layout.tsx` calls `router.replace('/login')` with no `next`. Which one wins decides whether she returns to the report or to the dashboard **(derived from code — confirm when walked)**.
- **Session dies mid-work**: any API call that returns 401 triggers the same `window.location` redirect with the current URL as `next`; unsaved in-page state is lost (visit and prescription drafts have their own localStorage recovery, covered in other topics).
- **Opens `/dashboard/billing` or another legacy link**: the `next` value is preserved, then the page's own redirect runs after login.

### Edge Cases
- `lib/api.ts` and `lib/authRedirect.ts` both write the return path to `localStorage` key `cms_next_after_login` "for fallback"; nothing in `frontend/src` reads it.
- `/dashboard/appointments/google-callback` is exempt from the cookie check so the Google OAuth return can load.
- `/test-transcribe` (sidebar "Test Transcribe") is outside `/dashboard`, so the middleware never guards it and it renders without the shell.

---

## STORY-004: Receptionist uses the header search to pull up a caller's record

**Type**: medium
**Topic**: Sign-in, app shell & dashboard
**Persona**: Riya Sharma, receptionist, phone on her shoulder; the caller is Sravani Kondapalli asking "what time is my appointment tomorrow, and can you check my number on file?"
**Goal**: Answer the appointment-time question and open Sravani's patient record
**Preconditions**: Signed in on a desktop-width screen (the search does not exist below `md`). Sravani exists as a patient with an appointment on 14 Nov 2026, 11:30 with Dr. Anusha Rao.
**Ideal path**: 3 — focus search, type a few letters, pick the patient → patient record opens showing phone and next appointment.
**Alternate paths**: (a) sidebar `Patients` → page search box → row `View`; (b) sidebar `Appointments` → the calendar's own patient search; (c) for doctors, Dashboard `My Patients` search → row link straight to `/dashboard/patients/<id>`; (d) Visits setup patient type-ahead. Four separate patient searches plus this one, each with different result behaviour.

### Steps
1. Riya clicks the header field "Search patients, appointments, doctors...".
2. She types `srav` → after the second character a spinner appears in the field; 300 ms after she stops typing three requests run one after another (patients, limit 5; appointments, limit 5; users, limit 3) and a dropdown opens.
3. She reads the dropdown. Rows carry a right-hand badge `Patient`, `Appointment` or `Staff`:
   - "Sravani Kondapalli" / `9848155302` / "Patient • Female • 29 yrs" — badge `Patient`
   - "Sravani Kondapalli - 11:30-11:45" / "Dr. Anusha Rao" / "Appointment • 14 Nov 2026 • OPD" — badge `Appointment`
   Footer hint: "Press Enter to go to first result • Type more to refine search".
   The appointment row already answers the caller's first question, and the patient row already shows the phone on file; she tells Sravani "11:30 tomorrow with Dr. Anusha".
4. To open the record she clicks the `Patient` row → the search box clears and the app navigates to `/dashboard/patients?search=<patient id>`.
5. The Patients page loads with its own search box pre-filled with the internal ID (a string like `cmf3k2x9h0007…`) and the list shows "No patients found — Adjust your search or filters to find a patient." The header link passes the database ID, but the patients search matches only name, phone, ABHA ID, patient code and e-mail (`backend/src/modules/patients/patients.service.ts`) **(derived from code — confirm when walked)**. Riya pauses, unsure whether the record was deleted.
6. She selects the ID text in the Patients search box and deletes it.
7. She types `sravani` → after the 500 ms debounce the row appears.
8. She clicks `View` on the row → `/dashboard/patients/<id>` with the summary card.

Honest count to open the record: 7 actions (steps 1, 2, 4, 6, 7, 8 plus the dead-end read at 5) against an ideal of 3.

### Variations
- **Presses Enter instead of clicking**: opens the *first* result, whatever its type. Patients are listed first, so Enter leads to the same dead end.
- **Clicks the `Appointment` row** to reschedule: lands on plain `/dashboard/appointments` — no date, doctor or appointment is carried over. The calendar shows whichever doctor and date were last remembered in `localStorage`; she must set `Doctor` and `Date` by hand and find the tile (+3 or more actions).
- **Searches a doctor** ("anusha"): a `Staff` row links to `/dashboard/users?search=<user id>`. Riya has no Users entry in her sidebar and the Users page does not read `search`, so she gets the unfiltered staff table (or its error state for her role).
- **Presses Escape**: the dropdown closes and the text stays; focusing the field again reopens the results (`@cc search-dismissal`).
- **Changes her mind mid-typing**: clicking anywhere outside closes the dropdown, text is kept.

### Edge Cases
- **One character**: nothing happens (minimum 2 non-space characters), and no hint says so.
- **No match**: "No results found for "srv"" / "Try searching for patient names, phone numbers, or doctor names".
- **A request fails**: each of the three lookups swallows its own error (console only); a failed patients call simply yields fewer rows, indistinguishable from "no such patient".
- **Results are mouse-only**: rows are `div`s with `onClick`; there is no arrow-key selection, only Enter for the first row.
- **Role without a grant** (e.g. PHARMACIST searching a patient name): forbidden lookups are dropped silently; the user sees "No results found".

---

## STORY-005: Pharmacist follows a low-stock notification from the bell

**Type**: short
**Topic**: Sign-in, app shell & dashboard
**Persona**: Imran Khan, pharmacist, quiet half-hour after the morning OPD
**Goal**: See which items are low and get to the list he can act on
**Preconditions**: Signed in as PHARMACIST on desktop width; `/reports/alerts` returns low-stock and near-expiry items
**Ideal path**: 2 — open the bell, click the item → a stock list already filtered to low stock.
**Alternate paths**: the same low-stock/expiry information is reachable from Dashboard `System Alerts` ("Low Stock Alert — 6 items are below reorder level", read-only), sidebar `Inventory` → Today "What needs attention" queues, Inventory › Stock list filters, `Pharmacy Report` › Expiring Stock, and the Pharmacy Desk `Stock` metric. The bell is the only one of these that tries to deep-link.

### Steps
1. Imran notices a red count badge "8" on the bell (`aria-label="Notifications"`); the badge is red because at least one item is `destructive`.
2. He clicks the bell → dropdown "Notifications" lists up to five red rows such as "Low stock: Tretinoin 0.025% Cream" / "Stock 2 • Reorder 10" and up to three amber rows such as "Expiring soon: Azithromycin 500 mg Tab" / "21 days left • Qty 40", then a separator and `View reports & alerts`.
3. He clicks "Low stock: Tretinoin 0.025% Cream" → navigates to `/dashboard/inventory?tab=low-stock`. The Inventory workspace does not read `tab`, so it opens on the **Today** area, not on a low-stock list and not on the Tretinoin item (see discovery, Redundancy Leads D).
4. He finds the low-stock row in "What needs attention" on Today and clicks it → the filtered stock list.

### Variations
- **Clicks `View reports & alerts`**: goes to `/dashboard/reports`. PHARMACIST has no `Reports` sidebar entry (OWNER/ADMIN/MANAGER only), so he lands on a page his navigation says he should not have.
- **ACCOUNTANT**: rows are "Pending ₹1,250.00 (UPI)" and "Overdue Invoice INV-…", all linking to `/dashboard/pharmacy/sales?pay=CREDIT`; ACCOUNTANT has no `Sales` sidebar entry.
- **RECEPTION**: up to four "Upcoming: {patient} on {date}" rows (→ `/dashboard/appointments`, no appointment focus) and up to three "Overdue Invoice …" rows (→ Sales with `pay=CREDIT`; RECEPTION has no `Sales` entry either).
- **DOCTOR**: up to six "{patient} on {date}" rows, each → `/dashboard/visits?appointmentId=…` (the only notification type that lands on the specific record).
- **OWNER / ADMIN / MANAGER / NURSE** (default branch): count summaries — "3 overdue invoices", "2 pending payments", "6 low-stock items", "4 near-expiry items", "5 upcoming appointments — Within 48 hours".

### Edge Cases
- **Alerts request fails**: silently shows "No notifications" — the same text as a genuinely quiet day.
- **Nothing to show**: no badge; dropdown says "No notifications" and the `View reports & alerts` footer is hidden.
- **Freshness**: polled every 60 s; label shows "Notifications • Loading…" while fetching. Items cannot be dismissed or marked read, so the badge count never goes down by user action.
- **More than 9**: badge reads "9+" (cannot happen for a pharmacist: max 5 + 3).
- **Mobile**: there is no bell at all below `md`.

---

## STORY-006: Doctor sets up her signature, Saturday hours, conference leave and WhatsApp confirmations in "My Settings"

**Type**: medium
**Topic**: Sign-in, app shell & dashboard
**Persona**: Dr. Anusha Rao, dermatologist, ten minutes before OPD, leaving for a conference next Thursday
**Goal**: Upload a new signature, shorten Saturdays to a half day, block 19–21 Nov as leave, and switch on automatic WhatsApp confirmations
**Preconditions**: Signed in as DOCTOR on desktop width; a scanned signature PNG under 2 MB on the computer; at least one active "appointment_confirmation" WhatsApp template
**Ideal path**: 9 — open settings, choose signature file, change Saturday end time, add leave (from, to, reason, add), toggle WhatsApp, one Save. A single save for the whole dialog would remove three intermediate saves.
**Alternate paths**: an OWNER/ADMIN can do the hours, leave and overbooking part for her from `Users` → her row → `Working Hours`, and the WhatsApp part from `Users` → `WhatsApp Settings` (that version has extra phone-number-ID and token fields). Letterhead/print layout is also editable in Visits › Customization and in the prescription preview. Signature upload: only here.

### Steps
1. She clicks the cog in the header (`aria-label="Open settings"`, icon only, no tooltip text) → dialog "My Settings" opens, scrollable, with sections in this order: `Doctor signature`, `Prescription letterhead`, `Weekly working hours (IST)`, `Overbooking`, `Leave and blocked time`, "Send WhatsApp on appointment creation", "Use WhatsApp Template", "How to enable WhatsApp (Doctor steps)", then `Close` / `Save`.
2. Under `Doctor signature` she clicks the file input labelled "Upload signature" (reads "Replace signature" if one exists).
3. She picks `anusha-signature.png` → status line "Saving signature…" then "Signature saved." and a preview appears. It has saved already; the helper says "Only you can change your signature. Changes save immediately."
4. She scrolls to `Weekly working hours (IST)` and changes the Saturday end time (input `aria-label="Saturday shift 1 end"`) from 18:00 to 13:00.
5. She clicks `Save hours` → status "Working hours saved."
6. She scrolls to `Leave and blocked time`; in the dashed form she leaves "Type" on `Leave`.
7. She sets "From" to 19-11-2026.
8. She sets "To" to 21-11-2026 ("All day" is ticked by default).
9. She types "Dermacon conference" in "Reason (optional)".
10. She clicks `Add leave` → a "Leave · {date span} · Dermacon conference" entry is added to the list above the form (exact date-span format unverified).
11. She scrolls on and flips the switch "Send WhatsApp on appointment creation".
12. She flips "Use WhatsApp Template" → an "Approved Templates" select plus "Template Name" and "Language Code" inputs appear.
13. She opens "Approved Templates" and picks the saved appointment template → name and language fill in.
14. She clicks the footer `Save` → toast "Settings saved — WhatsApp preferences updated." and the dialog closes.

She hesitates at step 14: the footer `Save` looks like it saves the whole dialog, but it saves only the two WhatsApp switches; hours, overbooking, leave, signature and letterhead each saved on their own. Conversely, had she clicked `Close` after step 13 believing everything auto-saves like the signature, the WhatsApp changes would have been discarded without warning.

### Variations
- **Any non-doctor role** (reception, nurse, pharmacist, admin…) clicks the cog: the dialog shows only the title and `Close` / `Save`. Clicking `Save` still calls `PATCH /users/:id/profile`, writes WhatsApp keys into that user's metadata and toasts "Settings saved — WhatsApp preferences updated." (`saveDoctorSettings` in `components/layout/header.tsx` has no role check).
- **Template mode on, nothing chosen**: `Save` shows a warning toast "WhatsApp settings incomplete — Choose a WhatsApp template or turn template mode off." Bad language code: "Use a valid WhatsApp language code, such as en, en_US, or hi."
- **No templates exist**: "No active appointment templates were found. You can still enter the template name and language manually."
- **Lunch block instead of leave**: Type `Blocked time`, untick "All day", set "Start time" 13:00 / "End time" 14:00, `Add blocked time`.
- **Allow two patients per slot**: `Overbooking` → switch "Allow overbooking" → "Up to [2] patients per slot" → `Save overbooking` → "Saved: up to 2 patients per slot."
- **Copy Monday's hours**: `Copy Monday to Tue–Fri`, then `Save hours`.

### Edge Cases
- **First-time hours**: a note explains the source — "No hours set yet; the clinic default 09:00-18:00 applies every day. Save to set a schedule."
- **End before start**: "The end date must be on or after the start date." / "The end time must be after the start time."
- **Signature upload fails**: red alert with `Reload signature`.
- **WhatsApp not configured on the server**: the toggles save happily; the dialog only says "Requires backend WhatsApp credentials."
- **Mobile**: no cog exists below `md`, so a doctor on a phone cannot reach any of these settings.
- **Naming**: the control is "Open settings" (aria), the dialog "My Settings", the toast "WhatsApp preferences", and the same hours screen under Users is `Working Hours`.

---

## STORY-007: New receptionist's first morning — sign in, look around, take every guided tour, sign out

**Type**: long
**Topic**: Sign-in, app shell & dashboard
**Persona**: Swathi Naidu, receptionist on her first day, given a login by the admin and told "the system will show you around"
**Goal**: Learn what the front desk can do in ClinicMS before the first patient arrives
**Preconditions**: New ACTIVE user with role RECEPTION (phone `9701234588`, initial password set by the admin). Desktop browser with empty `localStorage`. At least one appointment exists today.
**Ideal path**: 6 — sign in (3), start one tour (1) that carries her across pages, finish it (1), sign out (1). Today the tour is per page and must be restarted on each.
**Alternate paths**: help for the same screens exists in four forms — header `Start Tour` (intro.js, RECEPTION only), the page-header `Quick Guide` dialog (`components/common/QuickGuide.tsx`; Dashboard, Patients, Rooms, Pharmacy, Users, Reports, Procedures, Visits), the Appointments page's own in-page "Quick Guide", and the calendar legend. Doctors get a fifth: `Visit Workflow Tour` inside the visit form.

### Steps
1. Swathi opens the clinic URL → redirected to `/login?next=%2Fdashboard`.
2. She notices the `Branded` switch (palette icon, top-right) and flips it → the page shifts to a cream background with sage accents; the palette is extracted from `/letterhead.png` and the choice is stored in `localStorage` (`cms_branded_mode`). She leaves it on.
3. She types `9701234588` in "Phone or email".
4. She types the initial password.
5. She clicks `Sign in` → `/dashboard`. Branded mode is still on; the same `Branded` switch now sits in the header.
6. She reads the page: "Dashboard — Welcome back! Here's what's happening at your clinic today." and four cards — `Total Users 9`, `Active Users 9`, `Total Branches 1`, `System Status operational`. She hesitates: none of this is about patients or today's desk work (and Total and Active are the same server count).
7. She reads the sidebar: **Overview** — Dashboard; **Clinical** — Patients, Appointments, Rooms; **Pharmacy** — Pharmacy Desk, Pharmacy Counter, Inventory. Footer: `SN`, "Swathi Naidu", `RECEPTION`, a logout icon.
8. She clicks `Start Tour` in the header (help-circle icon; present only for RECEPTION) → an intro.js overlay opens: "Welcome to the Receptionist Dashboard! 🎉" with progress bullets.
9. `Next →` → the sidebar is highlighted: "Navigation Sidebar … Appointments / Patients / Rooms". (Her sidebar also lists three Pharmacy items the tour does not mention.)
10. `Next →` → the stat cards are highlighted: "Today's Overview — View quick stats for today including: Number of appointments scheduled, Patient registrations, Room occupancy status". The highlighted cards actually show users, branches and system status. She re-reads both.
11. `Next →` → `Today's Appointments` card highlighted: "Click on any appointment to view details, reschedule, or cancel."
12. `Finish` → overlay closes; `tour-seen-receptionist-/dashboard` is written to `localStorage`.
13. Following the tour, she clicks the first row in `Today's Appointments` ("Farhan Ali — 10:00-10:15 — CONFIRMED") → nothing happens; rows are not links.
14. She clicks `Quick Guide` in the page header → dialog "Dashboard Guide" with sections "Overview" and "System Alerts" ("Click on any alert to view more details").
15. She closes the dialog (X) and clicks the "Low Stock Alert" row in `System Alerts` → nothing happens; alerts are not clickable either.
16. She clicks `View All Appointments` at the bottom of the card → `/dashboard/appointments`.
17. She clicks `Start Tour` again → a different, 9-card tour: "Welcome to Appointment Management!".
18. `Next →` ×3 → "Step 1: Select a Doctor" (highlights the Doctor select), "Step 2: Choose the Date" (highlights the date picker), "Step 3: Choose Your View" (highlights the Calendar / Slots tabs; Calendar marked "Recommended").
19. `Next →` ×4 → four un-anchored cards: "Booking a New Appointment" (says "New patient? Click "Add Patient" button first"), "Understanding Appointment Colors", "Modifying Appointments", "Pro Tips & Time Savers".
20. `Next →` → "You're All Set!" recap ("Doctor & Date — Always select first", "Search Patient — Before clicking slots", "Click Slot — Or drag for longer", "Double-Click — To modify existing") and "Click the "Start Tour" button in the top-right corner anytime to replay this guide!".
21. `Finish`. (Steps 17–21: 10 clicks.)
22. She clicks `Patients` in the sidebar → `/dashboard/patients`.
23. `Start Tour` → 5 cards: "Patient Management 👥", "Add New Patient" (highlights the `New Patient` button; lists "Date of birth" and "Medical history and allergies"), "Search Patients", "Patient List" ("Click on any patient row to…"), "💡 Pro Tips" → `Next →` ×4, `Finish` (6 clicks).
24. She clicks `Rooms` in the sidebar → `/dashboard/rooms`.
25. `Start Tour` → 3 cards: "Room Management 🚪", "Room Calendar" (highlighted), "Room Assignment" (describes assigning a patient to a room and updating room status on arrival) → `Next →` ×2, `Finish` (4 clicks).
26. She clicks `Pharmacy Desk` in the sidebar → `/dashboard/pharmacy?section=desk`.
27. `Start Tour` → 3 text-only cards: "Pharmacy Workflows", "Pharmacy Desk" ("dashboard metrics, Codex assistant, packages, partner sync, invoices, and drug records" — most of which reception cannot see), "Pharmacy Counter" → `Next →` ×2, `Finish` (4 clicks). The same 3 cards play on `Pharmacy Counter`, because both share the pathname `/dashboard/pharmacy`.
28. She clicks `Inventory` in the sidebar and then `Start Tour` → a single card: "Receptionist Tour — The guided tour is available on these pages: Dashboard, Appointments, Patients, Rooms, Pharmacy Desk, Pharmacy Counter … Navigate to any of these pages and click the help button to start the tour!" → `Finish`.
29. The first patient walks in. She looks for "Sign out" under her name in the header (top-right) — the name there is plain text. She finds the small logout icon at the bottom of the sidebar (`aria-label="Log out"`, no text label).
30. She clicks it → no confirmation; `POST /auth/logout` expires the cookie and she is on `/login` (no `next`). Branded mode is still on for the next person at this computer.

Honest count: about 45 clicks and field entries (5 to sign in and toggle branding, 28 inside five tours, 4 sidebar navigations, 6 on dead-end clicks / the guide dialog, 1 to log out).

### Variations
- **Skips the tour**: Esc, the × in the tooltip, or a click on the dark overlay closes any tour at any card; the "seen" flag is set the moment `Start Tour` is clicked, not on completion.
- **Second visit**: nothing auto-starts (`autoStart` defaults to false and the header mounts `<ReceptionistTour />` without it), so the "seen" flags written to `localStorage` currently change nothing.
- **Any other role**: no `Start Tour` button. A nurse, pharmacist or accountant has only the `Quick Guide` dialogs.
- **Doctor**: no header tour; inside a visit, `Visit Workflow Tour` plays 18 un-anchored cards ("Welcome to the Doctor Visit Workflow!" … "Step 12: Completing the Visit" … "You're Ready to Go!"). The button is mounted in the visit form for every role that opens it, nurses included.
- **Turns branding off again**: flip `Branded` in the header; the `branded` class and the four `--brand-*` variables are removed immediately.

### Edge Cases
- **No appointments today**: the card shows "No appointments scheduled for today" and the `View All Appointments` button is not rendered, so step 16 needs the sidebar instead.
- **Tour target missing**: the hook waits up to 5 s for a highlighted element; if `Today's Appointments` failed to load the card still exists, so the highlight works over an error state.
- **Tour copy vs screen**: several cards describe UI that is not there or is named differently — stat cards (step 10), clickable appointment rows (11), "Add Patient" button (19; discovery records `+ Add "<text>" as a new patient` and `New Patient`), "Double-Click to modify" (20), "Date of birth" (23; the form asks for age), room assignment/status updates (25; the Rooms calendar is read-only for reception), "click the help button" (28; the button is labelled `Start Tour`).
- **Narrow window**: below `sm` the button shows only the icon; below `md` the whole header, and with it the tour, is gone.
- **Profile fetch fails after login**: the sidebar footer shows "Unknown User"; if the role is missing as well it shows "Unknown Role" and lists **every** navigation item, since `filterNavigationByRole` without a role returns them all.
- **Product name**: the login card and sidebar say "ClinicMS"; the browser tab says "Dashboard | Linaé"; the login image is the "Linaé Skin, Hair & Aesthetic Clinic" letterhead.

---

## STORY-008: Owner takes a database backup before the weekend

**Type**: short
**Topic**: Sign-in, app shell & dashboard
**Persona**: Dr. Kavitha Menon, clinic owner, Friday 7:30 pm before a software update planned for Sunday
**Goal**: Create a full backup and know that it exists
**Preconditions**: Signed in as OWNER (or ADMIN); on `/dashboard`
**Ideal path**: 2 — click `Create Backup`, read a clear result that says where the backup is and that it finished.
**Alternate paths**: none found in the UI (only this card calls `POST /auth/backup`). `GET /auth/backup/:jobId` exists for checking a job but no screen calls it.

### Steps
1. She scrolls past the four stat cards to the `Admin Controls` card ("Administrative tools and system management").
2. In the "Database Backup — Create a complete backup of the database" row she clicks `Create Backup` → the button changes to a spinner and "Creating...".
3. A native browser `alert()` appears. The page code expects the reply to contain `backup.timestamp`, `backup.directory` and `backup.size` and would show "✅ Database backup created successfully! … Backup saved to local server directory." The server, however, only queues a background job and replies `{ success: true, jobId }`, so reading `backup.timestamp` throws and the alert that appears is "❌ Backup Failed" followed by a JavaScript error message, even though the job was queued **(derived from code — `app/dashboard/page.tsx` `handleBackup` vs `backend/src/modules/auth/auth.controller.ts` `createBackup`; confirm when walked)**.
4. She clicks `OK` on the alert → the button returns to `Create Backup`. Nothing on the page records that a backup was requested, when, or whether it completed.

### Variations
- **Clicks again because it "failed"**: each click queues another full `pg_dump` job on the server.
- **Opens `Quick Guide` first**: for OWNER/ADMIN the "Dashboard Guide" gains an "Admin Controls" section ("Backups are stored locally on the server", "Regular backups are recommended for data safety").
- **Doctor**: the card is hidden, and the server refuses DOCTOR explicitly ("Insufficient permissions. Admin access required.") — a deliberate exception to doctors passing every role gate.

### Edge Cases
- **Server cannot enqueue**: alert "❌ Backup Failed" + "Failed to enqueue backup job (Reference: …)".
- **Job fails later** (e.g. the `cms-postgres` container is not running): the failure is written only to a job file on the server; the UI never learns of it.
- **No confirmation** before starting and no download: the note says "⚠️ Backups are stored locally on the server and contain sensitive data."
- Native `alert()` blocks the page and ignores branded mode; the rest of the app uses toasts.

---

## STORY-009: Doctor starts the day from the dashboard — reopen yesterday's visit, look up one of her patients, check today's list

**Type**: medium
**Topic**: Sign-in, app shell & dashboard
**Persona**: Dr. Anusha Rao, dermatologist, 9:40 am with coffee, OPD starts at 10
**Goal**: Finish the note she left open last evening, check an old patient who messaged her, and see who is booked today
**Preconditions**: Signed in as DOCTOR on desktop; she has visits on record, 34 patients with her as primary doctor, and appointments today
**Ideal path**: 4 — click the unfinished visit; back; click the patient; today's list is already on screen.
**Alternate paths**:
- Reopen a visit: Dashboard `Recent Visits`; bell notification (by appointment); sidebar `Visits` setup screen; `Patients` → patient → `Resume last visit` / tracker `Continue`; `Appointments` → appointment → `Start Visit`.
- Find her patient: Dashboard `My Patients`; header search; sidebar `Patients`; Visits type-ahead.
- Today's appointments: Dashboard card; bell; sidebar `Appointments` calendar; sidebar `Rooms` calendar.

### Steps
1. She lands on `/dashboard`. For a doctor the page order is: header with `Quick Guide`; **`Recent Visits`** and **`My Patients`** side by side; the four stat cards (`Total Users`, `Active Users`, `Total Branches`, `System Status`); `System Alerts`; `Today's Appointments`.
2. In `Recent Visits` ("Your latest consultations", latest 8) she finds "Farhan Ali — Acne vulgaris — 12 Nov 2026, 6:42 pm". No status is shown on the row, so she cannot tell from here which visits are still in progress; she goes by memory.
3. She clicks the row → `/dashboard/visits?patientId=…&visitId=…` opens that visit.
4. She completes the note there (visit topic), then clicks `Dashboard` in the sidebar → the dashboard reloads all its data from scratch.
5. In `My Patients` ("Patients with you as their primary doctor (34)") she clicks "Search by name, phone or code" and types `98490` → 250 ms later the list narrows; rows read "Padmaja Reddy" / "LN-0412 · 9849033178" / "Last visit 28 Oct 2026".
6. She clicks the row → `/dashboard/patients/<id>` (the record itself — unlike the header search in STORY-004).
7. She reads the summary, then clicks `Dashboard` in the sidebar again; the `My Patients` search box is empty again.
8. She scrolls past the stat cards and `System Alerts` to `Today's Appointments` ("Upcoming appointments for today"). For a doctor this is her own full schedule for the IST day; each row shows patient name, the booked slot text (e.g. "10:00-10:15") and a raw status badge (`CONFIRMED`, `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`).
9. She wants to start the 10:00 visit and clicks the row → nothing happens; rows are static.
10. She clicks `View All Appointments` → `/dashboard/appointments`, from where "Appointment Details" → `Start Visit` works (appointments topic).

### Variations
- **Uses the bell instead of step 8–10**: bell → "Farhan Ali on 13 Nov 2026" / "OPD • CONFIRMED" → `/dashboard/visits?appointmentId=…`, two clicks to the visit for that appointment. The bell covers the next 48 hours (max 6 rows), the dashboard card covers today only; the bell row shows the date but not the time.
- **Pages through her patients**: `Next` / `Previous` with "Page 2 of 4" (10 per page); typing in the search resets to page 1.
- **Other roles on the same page**: RECEPTION, NURSE, MANAGER, OWNER, ADMIN see `Today's Appointments` limited to the first 5 by slot across all doctors; PHARMACIST and ACCOUNTANT do not get the card at all and are left with four stat cards and `System Alerts`.

### Edge Cases
- **No visits yet**: "No visits yet". **No assigned patients**: "No patients assigned to you yet"; with a search term, "No matching patients".
- **Panel load fails**: "Could not load your recent visits. Refresh to try again." / "Could not load your patients. Refresh to try again." — no retry button, unlike the cards below.
- **Appointments or alerts fail**: "Couldn't load today's appointments" with either "Your account does not have access to this yet. Ask an admin to check your role permissions." (403) or "This is not an empty list. Check your connection and try again." and `Try again`.
- **Statistics fail**: swallowed; cards show `0`, `0`, `0`, `unknown`.
- **`System Alerts` is never empty** on success: a "System Status — All systems operational — LOW" row is always appended, so the "No alerts at this time" empty state with `Refresh dashboard` is unreachable in practice. "System Status" therefore appears twice on the page (stat card and alert row).
- **One-character search** in `My Patients`: ignored (minimum 2), list stays unfiltered with no hint.

---

## STORY-010: Nurse on her phone finds a patient list and signs out — without the header

**Type**: medium
**Topic**: Sign-in, app shell & dashboard
**Persona**: Lakshmi Devi, nurse, using her own Android phone in the procedure room because the desk PC is busy
**Goal**: Sign in, open Patients, and sign out again so the session is not left on a personal phone
**Preconditions**: Role NURSE; viewport narrower than `md` (768 px)
**Ideal path**: 5 — identifier, password, submit, one tap to Patients, one tap to sign out.
**Alternate paths**: none found on mobile for navigation (the hamburger sheet is the only route). On desktop the same sidebar is permanently visible. There is no second logout control anywhere.

### Steps
1. She opens the clinic URL on her phone → `/login?next=%2Fdashboard`; the `Branded` switch is in the top-right corner.
2. She taps "Phone or email" → the **e-mail** keyboard opens (`inputMode="email"`); she switches to digits and types `9000412766`.
3. She types her password.
4. She taps `Sign in` → `/dashboard`.
5. The screen shows a slim bar with a hamburger and "ClinicMS", then the dashboard content in one column. There is no search, no bell, no settings cog, no `Branded` switch and no user name — the desktop header is not rendered at this width.
6. She taps the hamburger (`aria-label="Open clinic navigation"`) → a left-hand sheet opens with the full sidebar: Overview — Dashboard; Clinical — Patients, Appointments, Visits, Rooms; footer `LD`, "Lakshmi Devi", `NURSE`, logout icon.
7. She taps `Patients` → the sheet closes and `/dashboard/patients` loads.
8. When done she taps the hamburger again.
9. She scrolls the sheet to the bottom and taps the logout icon (`aria-label="Log out"`) → cookie expired, redirected to `/login`.

### Variations
- **Wants to search for a patient from anywhere**: impossible on mobile; she must go to `Patients` and use that page's search.
- **Doctor on a phone**: cannot open "My Settings" (signature, hours, leave, WhatsApp) or see notifications at all.
- **Receptionist on a tablet in portrait** (< 768 px): no `Start Tour`.
- **Wanted branded colours**: can only be switched on the login screen at this width; once signed in the toggle is unreachable.

### Edge Cases
- **Sheet dismissed by tapping outside**: stays on the current page.
- **Rotating to landscape ≥ 768 px**: the layout switches to the desktop sidebar + header; an open sheet remains controlled by its own state.
- **Profile still loading**: the sheet footer shows "Loading…" for the name and "Unknown Role" until `/auth/me` and `/users/:id` return.
- **Logout request fails** (offline): the error is swallowed and she is still sent to `/login`, but the HttpOnly cookie has not been expired by the server, so reopening `/dashboard` signs her straight back in **(derived from code — `handleLogout` in `components/layout/dashboard-layout.tsx`; confirm when walked)**.

---

## Redundancy notes

### Duplicate paths to the same goal
- **Help / onboarding, four mechanisms**: header `Start Tour` (`components/tours/ReceptionistTour.tsx`, RECEPTION only, a different tour per pathname), page-header `Quick Guide` dialogs (`components/common/QuickGuide.tsx`, used by Dashboard, Patients, Rooms, Pharmacy, Users, Reports, Procedures, Visits), the Appointments page's own in-page "Quick Guide" (`app/dashboard/appointments/page.tsx`), and `Visit Workflow Tour` (`components/tours/DoctorTour.tsx`, mounted in `components/visits/MedicalVisitForm.tsx`). On Appointments a receptionist has `Start Tour`, "Quick Guide" and the legend at once.
- **Daily Collection twice in the sidebar**: `Daily Collection` (Overview) and `Pharmacy Report` → Daily Collection are the same report (`components/layout/sidebar.tsx`).
- **Patient lookup, five search boxes**: header global search (`components/layout/header.tsx`), Patients page, Appointments calendar, doctor Dashboard `My Patients` (`components/dashboard/DoctorPatientPanels.tsx`), Visits type-ahead. They disagree on the destination: `My Patients` opens the record; the header search opens the Patients list seeded with an internal ID.
- **Doctor availability and WhatsApp settings**: header "My Settings" (own) and Users › `Working Hours` / `WhatsApp Settings` (admin) render the same `DoctorAvailabilitySettings` and overlapping WhatsApp fields.
- **Reopening a visit**: Dashboard `Recent Visits`, bell (doctor), Visits setup, patient detail, appointment details.
- **Two login-redirect mechanisms plus a dead third**: middleware `?next=` (`middleware.ts`), client 401 handler `?next=` (`lib/api.ts`, `lib/authRedirect.ts`), and `localStorage` `cms_next_after_login`, which is written in both client files and read nowhere. `dashboard-layout.tsx` adds a fourth, `router.replace('/login')` without `next`, that can race the client handler.
- **Two auth-card implementations**: `/login` hand-rolls its card (with letterhead and `Branded`); `/reset-password` uses `components/auth/AuthCard.tsx` (neither).

### Same information on several surfaces
- **Low stock / expiry / overdue / pending payments**: Dashboard `System Alerts` (read-only summary rows), header bell (role-specific rows with links), Reports & Analytics alert strip, Inventory Today queues — all fed by `GET /reports/alerts`, with different wording ("Low Stock Alert", "Low stock: …", "low-stock items").
- **Today's / upcoming appointments**: Dashboard card (today, 5 rows; full day for doctors), bell (next 48 h), Appointments calendar, Rooms calendar.
- **"System Status"** is both a stat card and a permanent row in `System Alerts` (`app/dashboard/page.tsx`).
- **`Total Users` and `Active Users`** are the same number: `auth.controller.ts` `getStatistics` returns one count for both (likewise branches).
- **User identity** in the header (name) and sidebar footer (initials, name, role) on desktop.
- **`Branded` toggle** on the login page and in the header.

### Naming drift
- **Product**: "ClinicMS" (login heading, sidebar, mobile bar) vs "Linaé" (tab title, letterhead image alt text).
- **Sign in / Login / Log out**: heading "ClinicMS Login", button `Sign in`, link `Back to sign in`, sidebar `Log out`.
- **Reset**: users-table button `Reset password`, dialog "Reset password for …", login link `enter your reset code`, page title "Set a new password", button `Set new password`.
- **Settings**: aria "Open settings", dialog "My Settings", toast "WhatsApp preferences updated", Users buttons `Working Hours` / `WhatsApp Settings`.
- **Tour / guide / help**: `Start Tour`, `Quick Guide`, "Dashboard Guide", `Visit Workflow Tour`, and the tour's own text "click the help button".
- **Alerts / notifications**: card `System Alerts` ("Important notifications requiring your attention"), bell "Notifications", footer `View reports & alerts`.
- **Invoice vs bill**: bell and dashboard say "Overdue Invoice(s)" and link to the pharmacy `Sales` register, where the same things are "bills".
- **Role label**: raw enum in the sidebar (`RECEPTION`), "Receptionist" in the tour and Users form, "front desk" elsewhere.
- **Password rules**: "Password (8-20 chars)" when an admin creates a user (`components/users/UsersManagement.tsx`) vs "Use 8 to 72 characters" on reset (`app/reset-password/page.tsx`).

### Friction and stale paths seen in this topic
- Header search `Patient` result → `/dashboard/patients?search=<id>`; the patients search does not match on ID, so the click ends on an empty list (`header.tsx` line ~424, `backend/src/modules/patients/patients.service.ts` search `OR`). `Appointment` results always open the bare calendar; `Staff` results pass a `search` parameter the Users page ignores.
- Bell links use `/dashboard/inventory?tab=low-stock|expiry`, a parameter the Inventory workspace does not read; `View reports & alerts` and `…/sales?pay=CREDIT` point RECEPTION, PHARMACIST and ACCOUNTANT at pages missing from their sidebars.
- "My Settings" has five independent save points (signature and letterhead auto-save, `Save hours`, `Save overbooking`, `Add leave`, footer `Save` for WhatsApp only) and, for non-doctors, an empty dialog whose `Save` still writes WhatsApp metadata and reports success.
- `Create Backup` reads a response shape (`backup.timestamp/directory/size`) the server does not send (`{ success, jobId }`); no UI polls `GET /auth/backup/:jobId`.
- The Receptionist dashboard tour describes stat cards and clickable appointment rows that do not exist; dashboard stat cards (users, branches, system status) are identical for every role and unrelated to clinic work.
- `Today's Appointments` rows and `System Alerts` rows are not clickable although both the tour and the Quick Guide say they are.
- Tour "seen" flags are written to `localStorage` but nothing reads them to change behaviour, because no mount passes `autoStart`.
- Below `md` there is no search, bell, settings, tour or branded toggle; logout is an unlabeled icon at the bottom of a sheet.
- Login errors reveal whether an account exists ("Account not found" vs "Invalid password") and every error carries a trailing `(Reference: <uuid>)`.
