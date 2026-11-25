# Follow-up loop

Reception confirms a patient's WhatsApp number, a doctor completes a visit with a follow-up plan, and the scheduler opens the first check-in when it falls due and sends the patient a single-purpose link. The patient opens the link on a phone without logging in, answers the questions and adds a photo. An urgent answer, or any WhatsApp message from the patient, puts an item on the Follow-ups worklist; staff claim it, reply inside WhatsApp's 24-hour window and resolve it. A review appointment booked for tomorrow gets a reminder from the same scheduler.

## Sub-features

- `loop-confirm-number`: "Patient agreed to WhatsApp" queues a `number_confirmation` template; typing its 6-digit code under "Confirm number" makes consent `OPTED_IN` with a confirmed number (Release 1a consent, sent through PP-11/PP-12).
- `loop-plan-picker`: the visit form's "Follow-up plan" select lists "No follow-up" first; completing the visit with "Two-week skin check" starts one ACTIVE track with two check-ins (PP-26, PP-27).
- `loop-scheduler`: on the shifted clock the send pass opens the day-3 check-in, makes one task link and sends `check_in_opened` with the token only in the URL-button parameter, inside the 09:00-20:00 window (PP-14, PP-30, PP-31, PP-35).
- `loop-task-page`: the portal service's `/t#<token>` at 390px drops the fragment from the address bar, greets the patient by first name with the clinic and doctor, shows no surname, and never puts the token in a request URL, referrer, storage or cookie (PP-36, PP-40).
- `loop-photo-answer`: a severity of 9 plus a 3000×4000 camera JPEG with EXIF saves one response pinned to the instrument version with one photo, flags it URGENT and shows the call-the-clinic screen (PP-42, PP-44).
- `loop-inbound`: a signed webhook message from the patient is stored, acknowledged with `patient_message_ack`, and opens a "Patient message" item; an unsigned post gets 401 (Release 1a inbound webhook).
- `loop-staff-reply`: reception claims the message item, sends a reply that fake Meta receives as free text, and resolves it as "Replied on WhatsApp" (PP-49, PP-50, PP-51).
- `loop-urgent-resolve`: reception sees the photo but gets "Only doctors, nurses and admins can resolve an urgent item"; after Release, the doctor claims and resolves it (PP-48, PP-50).
- `loop-audit`: every write to the two attention items leaves an `AuditLog` row with the action, the actor kind (`webhook` for the message item's opening, `task link` for the urgent item's, `staff` for claims and resolutions) and the changed field names, never a value or user id (PP-88).
- `loop-review-reminder`: a second patient's visit with a review date of tomorrow (shifted clock) books a review appointment, and the pass sends exactly one `review_reminder` (PP-34).

## How to get to it (user POV)

- Reception: sidebar **Patients** → a patient → **Info** tab → "WhatsApp and patient portal" card.
- Doctor: patient page → **Start new visit** → fill Chief complaints, Diagnosis and Follow-up instructions → section "Follow-up and language" → **Follow-up plan** or **Review date** → **Complete Visit**.
- Patient: the WhatsApp message's button opens the portal service's `/t#<token>` (no login). Run the portal (clinic-patient-portal) behind its `scripts/https-proxy.cjs`, launch the stack with `PORTAL_BASE_URL` set to that HTTPS address and `PORTAL_SERVICE_SECRET` shared with the portal.
- Staff: sidebar **Clinical → Follow-ups** (`/dashboard/follow-ups`, PP-47) → **Needs attention** → an item → Claim / Send reply / Resolve.

## Driving it with Playwright

Preconditions:

- `fake-meta.cjs --name loop --advance-days 3` is running, and the stack was launched with `--env-file output/verify-clinic/fake-meta/loop.env` after it. A new fake Meta has a new port and secret, so relaunch the stack whenever you restart it.
- Run the whole loop within one IST day: the offset is computed for "today + 3 days at 10:00 IST".

- **Run the whole proof.** `NODE_PATH=~/pw/node_modules node .claude/skills/verify-clinic/scripts/drive-follow-up-loop.cjs --instance loop --fake loop`. It prints PASS/FAIL per check and exits 0 only if all pass. `--no-review-leg` skips the second patient. `--patients <loopId>,<reviewId>` reuses already-confirmed patients to skip the 5-minute wait for the confirmation send.
- **Plans.** The schema starts without plans. The driver posts `/api/follow-ups/import` as the owner (there is no import screen); a doctor's import is refused.
- **Confirm a number.** Click "Patient agreed to WhatsApp"; wait for `fake.waitForSend(meta, s => template === 'number_confirmation')`; its second body parameter is the code. Fill `#whatsapp-code` and click "Confirm number".
- **Visit.** Use the ids `#visit-chief-complaints`, `#visit-diagnosis`, `#visit-followup-instructions` (labels are ambiguous), `#follow-up-plan` and `input[aria-label="Review date"]`. "Complete Visit" ends at "Completed. Read only.".
- **Clock.** Nothing to click: the backend's cron pass runs every 5 minutes on `MESSAGING_CLOCK_OFFSET_MS`. Wait for `check_in_opened` in `F.sends.jsonl` and read the token from `urlButtonParam`.
- **Patient page.** New context with 390×844, `isMobile`. Radios are visually hidden: `input[type=radio][value="9"]`, `[value="worse"]` with `{ force: true }`; the photo input is `input[type=file]`. The urgent screen is `getByTestId('urgent')` with a `tel:` link.
- **Inbound.** `fake.deliverWebhook(meta, state, fake.inboundText(e164, text))` signs the raw body with the app secret and posts it to `${state.api}/webhooks/whatsapp`.
- **Worklist.** `getByRole('list', { name: 'Items that need attention' })`, then `getByRole('region', { name: 'Item details' })`. Resolve with `#resolution-code`, `#resolution-note` and the "Resolve" button.
- **Proof artifacts.** `output/verify-clinic/evidence/<stamp>-follow-up-loop/`: `summary.md`, `checks.json`, `network.json`, `fake-meta-sends.json`, `01..12-*.png` and, on failure, `zz-failure-*.png`.

## Gotchas

- Only the send pass uses the shifted clock. Rows written by requests (answers, inbound messages, staff replies) carry the real time, so the worklist shows an answer "submitted" three days before its check-in opened. The 24-hour reply window is measured on the real clock and still holds.
- One care message per patient per IST day, review reminders first. Give the loop patient no review date tomorrow, or the check-in link waits a day.
- Automated care messages send only between 09:00 and 20:00 IST on the shifted clock; the offset lands on 10:00, which leaves about nine hours of real time.
- The seeded branch has no phone, so the urgent screen's call button needs `CLINIC_PHONE` (the fake Meta env sets it).
- Headless Chromium on a bare VM renders the Telugu and Hindi language buttons as boxes until `fonts-noto-core` is installed. That is a missing system font, not an app bug.
- `/auth/login` throttles at 5 calls a minute; the driver logs in each role once (`lib.openPage`).
