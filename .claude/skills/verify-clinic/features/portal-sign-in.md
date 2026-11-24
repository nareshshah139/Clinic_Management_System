# Portal sign-in and records

A patient signs in to the portal at `/p` with a six-digit code sent on WhatsApp to a confirmed number, picks whose records to open when the phone is shared by family members, and reads appointments, visits with their prescriptions, check-ins and the message thread, without any diagnosis or clinical note. They can write to the clinic from the portal. When staff reply after the 24-hour WhatsApp window has shut, the reply goes into the portal and the patient gets a WhatsApp notice template to read it there. Sign out ends one device's session; "Sign out on every device" ends all of them.

## Sub-features

- `portal-code`: "Send me a code" shows the same answer for every number; an eligible confirmed number gets `portal_sign_in_code` from fake Meta at once (send-now, no 5-minute pass); an unknown number gets nothing (PP-55).
- `portal-picker`: a phone shared by two patients shows "Who are you signing in for?" with first names and branch only (PP-61); a single profile is chosen automatically.
- `portal-session`: the session is the `__Host-portal_session` cookie (HttpOnly, Secure, SameSite=Lax, path `/`); only its hash is in `portal_sessions`; page script and storage never see it (PP-58).
- `portal-records`: Home (next appointment, open check-ins, latest prescription), Appointments, Prescriptions (visit date, doctor, `items` and `instructions`), Check-ins, Messages; no complaint, diagnosis, note, HSN code or surname (PP-63, PP-64). Every view is a `RECORD_VIEW` access event (PP-66).
- `portal-switch`: the profile switch rebuilds the list and shows only the chosen patient's records (PP-61, OwnDataOnly).
- `portal-write`: "Write to the clinic" stores one `PORTAL` inbound message with a client key and opens a "Patient message" worklist item (PP-65).
- `portal-reply`: on the worklist the reply box reads "Reply in the patient portal" with the closed-window note; "Send reply" queues and sends `portal_reply_notice` (no reply text) and the reply appears in the portal thread (PP-65).
- `portal-guard`: a cross-origin or Origin-less portal write gets 403 (PP-59); the portal cookie opens no staff API or `/dashboard`, and a staff session opens no portal record (PP-62).
- `portal-sign-out`: "Sign out" ends that device's session only; "Sign out on every device" ends the rest (PP-60). A consumed code cannot sign in again (PP-56).

## How to get to it (user POV)

- Patient: open `/p` on a phone → "Your WhatsApp number" → "Send me a code" → "6-digit code" → "Sign in" → choose a profile → `/p/records` with tabs Home, Appointments, Prescriptions, Check-ins, Messages; footer "Sign out" and "Sign out on every device".
- Staff: sidebar **Clinical → Follow-ups** → **Needs attention** → the patient's "Patient message" → Claim → "Reply in the patient portal" → Send reply.
- Reception confirms the number first on the patient page ("Patient agreed to WhatsApp", then the code), as in the follow-up loop.

## Driving it with Playwright

Preconditions: `fake-meta.cjs --name portal` (no clock shift needed) is running; the stack was launched after it with an env file that is `portal.env` plus `PORTAL_BASE_URL=https://127.0.0.1:44300`; and `https-proxy.cjs --port 44300 --target <stack base>` is running. The SKILL.md block has the exact commands.

- **Run the whole proof.** `NODE_PATH=~/pw/node_modules node .claude/skills/verify-clinic/scripts/drive-portal-sign-in.cjs --instance portal --fake portal --portal https://127.0.0.1:44300`. It prints PASS/FAIL per check and exits 0 only if all pass. Most of its ~10 minutes is the two number confirmations, which wait for the 5-minute send pass. `--reuse-phone <10 digits>` reuses the two patients of an earlier run on that phone and skips registration, confirmation and booking.
- **Shared phone.** Register two patients with the same 10-digit phone and confirm the number on each patient page in turn; each confirmation is a new `number_confirmation` send to the same number, so take the newest one.
- **Records data.** Appointments are booked by reception with `POST /api/appointments`; the prescription is saved by the doctor with `POST /api/prescriptions` on the visit started from "Start new visit" (the visit id is read from the database). The plan "Two-week skin check" gives the check-ins.
- **Code.** `fake.waitForSend(meta, s => template === 'portal_sign_in_code')`; the code is the first body parameter. Labels: `getByLabel('Your WhatsApp number')`, `getByLabel('6-digit code')`; the picker is `getByTestId('profile-picker')`, the switch `getByTestId('profile-switch')`, tabs are buttons inside `getByRole('navigation')`.
- **Messages.** `getByLabel('Write to the clinic')`, button "Send"; the thread is `getByTestId('thread')`, staff replies are `li[data-from="clinic"]`.
- **Probes.** Use Node `fetch` with `Cookie: __Host-portal_session=…` taken from `context.cookies()`; browsers cannot forge `Origin`.
- **Proof artifacts.** `output/verify-clinic/evidence/<stamp>-portal-sign-in/`: `summary.md`, `checks.json`, `network.json`, `fake-meta-sends.json`, `01..13-*.png`.

## Gotchas

- The portal writes must come from `PORTAL_BASE_URL`'s origin, and the browser sends `Origin` on POST. `boot.cjs` sets it to the stack's own frontend; the env file overrides it with the proxy's origin.
- Chromium drops the `Secure` `__Host-portal_session` cookie set over `http://127.0.0.1` (the response carries it, the cookie jar stays empty), so the patient's pages go through the TLS proxy with `ignoreHTTPSErrors`.
- The prescription POST needs an `Idempotency-Key` header, and it bumps the visit's version: the open visit page then shows "This visit changed elsewhere". The driver reopens `/dashboard/visits?visitId=…`, discards the stale local draft, picks the plan again (the plan is applied on completion, not by Save Draft) and completes.
- Scheduled check-ins are not history: right after the visit the plan's check-ins are `SCHEDULED`, so Check-ins shows "No check-ins yet." and the driver asserts that from the database.
- Earlier runs on the same stack hold the 10:30 and 16:00 slots and leave "Patient message" items for other "Asha Portal…" patients: the driver walks forward to a free day and filters the worklist by the full patient name.
- Sign-in codes are limited to 3 per phone per 15 minutes: the driver uses two. A rerun inside 15 minutes needs a new phone, which it picks at random unless `--reuse-phone` is given.
- Fake Meta accepts every template, so Meta's approval and rendering of `portal_sign_in_code` (copy-code button) and `portal_reply_notice` (static `/p` button) are not proven here.
