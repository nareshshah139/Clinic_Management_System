# Hand-test checklist: the voice bar

Walk this after all five packages are merged. Use the local dev stack with a throwaway database and the seeded users (one each of DOCTOR, RECEPTION, PHARMACIST, OWNER and PATIENT). Exact wording is in `frontend/src/lib/voice/copy.ts`; compare against it, not memory.

## Setups to repeat

Run every section in each of these unless it says otherwise:

| Code | Setup |
|---|---|
| D-L | Desktop browser, 1440 px wide, light theme |
| D-D | Desktop browser, 1440 px wide, dark theme |
| M-L | 390 px wide (device emulation), light theme |
| M-D | 390 px wide, dark theme |
| KB | 1440 px, keyboard only: no mouse or trackpad from page load to the end |
| iOS | iOS Simulator, Safari, iPhone at 390 pt, on-screen keyboard shown |

Two key states: with `OPENAI_API_KEY` set (S1), and without it (S0). Run S0 only in section 7.

## 1. Where the bar appears

- [ ] Visit form (doctor login): the bar shows under the page, across the content column, not over the sidebar.
- [ ] Appointments calendar (reception login): the bar shows.
- [ ] Inventory stock list (pharmacist login): the bar shows. Open one item's detail view: the bar disappears.
- [ ] Inventory stock list (reception login): no bar.
- [ ] Appointments embedded in another page with a fixed doctor or date: no bar.
- [ ] Any other dashboard page (patients, pharmacy, settings): no bar. The pharmacy page's agent card is unchanged.
- [ ] The bar never covers content: scroll `<main>` to its bottom; the last row and any sticky footer sit above the bar.
- [ ] Open the booking dialog and the Edit stock dialog: the dialog's buttons are fully visible; the bar is under the overlay and does not take clicks.
- [ ] Toasts still appear at the top right and never overlap the bar.
- [ ] D-D and M-D: bar surface, draft card, warning rows, applied line and failure box use the theme colours; text is readable; focus rings show.

## 2. Old per-field mics are gone

- [ ] Prescription tab: no mic button next to Chief Complaints or Detailed Examination.
- [ ] Medical visit form: no other mic button anywhere.
- [ ] Doctor tour: the mic steps are replaced by one step about the bar, with the TOUR_COPY wording; no step says "real-time" or "any text field".
- [ ] `/test-transcribe` still shows its speaker panels (it now sends `diarize=true`).
- [ ] Network panel during the whole session: no request to `/api/visits/transcribe/health`; exactly one request to `/api/voice/status` per page load; no request to `/api/visits/transcribe/status`.

## 3. Visit note

Start with Chief Complaints holding two typed lines.

- [ ] Speak utterance 1 from `usage.md` section 8. States in order: "Opening the microphone…", "Listening 0:0N" with "Press Esc to discard.", "Writing down what you said…", "Working out your request…", "Draft ready. Check it, then use the button."
- [ ] The card shows Heard with Edit, three placed sections, "Added after the 2 lines already there." under Chief Complaints, and "Not placed (1)" with a select.
- [ ] Add to form is enabled with one line unplaced. Press it. The three fields gain their text on new lines; the two typed Chief Complaints lines keep their line break.
- [ ] The bar stays in review with only the unplaced line and "Added to Chief Complaints, Examination and Medication history. 1 line still to place." Edit is gone.
- [ ] Press Discard. The line reads "… You can still edit them. 1 line was left out." with Undo and Done.
- [ ] Undo with no edits: all three fields return to their exact earlier text; "Undone."
- [ ] Repeat, edit Chief Complaints after applying, then Undo: "Undone for Examination and Medication history. Chief Complaints was left as it is because you have edited it."
- [ ] Repeat and place the last line instead of discarding, then Add to form again: the bar goes idle with the applied line; one Undo reverts both applies.
- [ ] Move a placed line back to "Not placed yet", apply, then Discard: that sentence is not in the form.
- [ ] A dictation the model cannot sort: everything under "Not placed"; Add to form disabled; "Choose where each line goes. Nothing is added until you do."
- [ ] "um, okay": "Could not find anything to fill in from that. Please say it again." with Try again.
- [ ] A mixed sentence ("Itching for two weeks and papules on the forearms.") lands in one section; moving it with the select works.
- [ ] Apply into Examination while Detailed Examination is folded: it stays folded; the text shows in the always-visible Examination box.
- [ ] Clear Chief Complaints after a voice apply and save: the saved visit has no complaints (touched flag).
- [ ] Type the note instead of speaking: same card, same result.
- [ ] Edit before applying: the heard text goes to the text box; fix a word; Enter gives a new draft.
- [ ] Switch to another tab of the visit form: the bar is still there (known open question); note what it does.

### Patient change with an open draft

- [ ] With a draft in review, switch to another patient's visit: "The page changed, so this draft was discarded." No text lands in the new visit.
- [ ] While listening, switch patient: recording stops, nothing uploads (network panel), the same notice shows.
- [ ] Apply a draft, then switch patient, then look for Undo: it is gone; nothing in the new visit changes.

## 4. Book appointment

Today is set to a known date; pick a doctor with known hours.

- [ ] Type utterance 2. Card: Heard with Edit, Patient with ID, age, sex and phone, Doctor, When with the long date and "16:30 to 17:00". Button "Open booking form".
- [ ] Press it: doctor, date and patient change on the calendar; the booking dialog opens with "Filled by voice. Check every line before you confirm." and Heard, Patient, Doctor, When lines; focus is on Cancel.
- [ ] The bar shows "Booking form is open. Nothing is booked until you press Confirm Booking." with Done and **no Undo**.
- [ ] Cancel: no appointment exists. Repeat and Confirm Booking: the appointment exists; the usual success feedback shows.
- [ ] No doctor said: "Which doctor?" lists all doctors; the calendar's doctor is labelled "Shown on the calendar" and not selected; Open booking form stays disabled with "Answer the question above to continue."
- [ ] One doctor in the clinic, none said: no question.
- [ ] "Dr Shah" with two Shahs: a choice of two. Choosing re-checks the time.
- [ ] Unknown doctor name: `No doctor called "…". Choose one.`
- [ ] Three patients with the same name: "Which Meera Iyer?" with three identity rows.
- [ ] Unknown patient: the no-patient message; "Fill what's known" sets doctor and date and puts the name in the patient search; the quick-create dialog does not open by itself; "+ Add" is there.
- [ ] "at 9:30" with hours 8 to 22: "Is that 9:30 in the morning or 9:30 at night?"; "4:30" with hours 9 to 18: no question.
- [ ] Outside hours, past time, past date: the matching message; "Fill what's known" fills the rest.
- [ ] A slot already taken: the confirm fails on the server as today; the dialog shows that error.

## 5. Stock count

- [ ] Speak utterance 3 (one matching row). Card: Medicine (the row's name), Batch with expiry, "On the shelf now: 52 strip → you said 48 strip". Button "Open stock count form".
- [ ] Press it: Edit stock opens with 48, "Filled by voice. Check the count, then write the reason.", the heard text, an empty reason with focus; Submit for approval disabled until a reason is typed.
- [ ] The bar shows "Stock count form is open. Nothing changes until a doctor or admin approves it." with Done and **no Undo**.
- [ ] Submit with a reason: an approval request is created; stock does not change.
- [ ] Unknown batch: the no-batch message; "Show matches in the list" sets the list's search and opens nothing.
- [ ] Two rows on one batch: "Which one?" with name, batch, expiry, shelf count.
- [ ] Unit mismatch: the tablet message; "Show matches in the list".
- [ ] Count equal to the shelf: "This count matches the current stock. Nothing to submit."; only Discard.
- [ ] Count below set-aside stock: "N unit are set aside for pending sales. The count cannot be lower than that."; only Discard.
- [ ] Missing batch: "Say the medicine, the batch number and the count."
- [ ] OWNER login: the bar shows; note whether the parse returns 403 (open question).

## 6. Keyboard only (KB)

- [ ] From inside the Chief Complaints textarea, press Ctrl+/ (Cmd+/ on Mac): focus moves to the bar's text box.
- [ ] Type, Shift+Enter: a new line, nothing sent. Enter: sent.
- [ ] Esc on the draft: the draft is dismissed and focus returns to Chief Complaints.
- [ ] Tab through a draft: choices, section selects, Add to form, Discard, in order; each has a visible focus ring.
- [ ] Space on the mic starts recording; Enter stops and sends; Esc while listening discards with "Recording discarded." and focus returns.
- [ ] Undo, Done and Try again are reachable and work with Enter or Space.
- [ ] Screen reader (VoiceOver): each state is read from the status line; failures are read as alerts; the bar is announced as "Voice and text command bar".

## 7. Failures

- [ ] S0 (no key): "The voice bar is not set up. Ask your administrator to add the OpenAI key." Text box and mic disabled; no Try again; no repeated status calls.
- [ ] Block the microphone in the browser: the blocked message with Try again; after allowing it, Try again opens the mic.
- [ ] No microphone (emulated): the no-microphone message.
- [ ] A browser without MediaRecorder: the cannot-record message; typing still works.
- [ ] A recording under a second: "Did not catch anything. Please try again."
- [ ] Make transcription fail once (stop the backend's network to the provider, or a test key): "Could not write down your recording. Try again." Try again re-sends the same recording; you are not asked to speak again (one upload of the same size in the network panel).
- [ ] Make parsing fail (503): the heard text is back in the text box with the understand-failed message; Try again re-sends it.
- [ ] 21 parse requests within a minute as one user: the 21st shows "Too many requests in the last minute. Wait a moment, then try again." A second user is not affected.
- [ ] Offline (devtools): "No internet connection. Check it and try again."
- [ ] A role without the route's permission: "You do not have permission to use voice for this."; no Try again.
- [ ] An expired session: "Your session has ended. Please sign in again." and the usual redirect.
- [ ] Typed text over 500 characters on the calendar: the too-long message; the text stays.
- [ ] PATIENT login: `POST /api/visits/transcribe`, `/transcribe/chunk*` and `GET /api/voice/status` return 403.

## 8. Navigation mid-recording

- [ ] Start recording on the calendar, then click Patients in the sidebar: the mic indicator in the browser turns off; no upload happens.
- [ ] Start a parse, then navigate to the visit page before it returns: the new page's bar is idle, with no draft and no failure.
- [ ] Browser back to the calendar: the bar is idle; Try again from before is gone.

## 9. Phone width and the on-screen keyboard

At M-L, M-D and iOS:

- [ ] The bar spans the width with 16 px gutters and respects the bottom safe area.
- [ ] Mic and Send are 44 px targets; choice rows and section selects are 44 px high.
- [ ] Focus the text box: the keyboard opens and the bar sits directly above it (iOS: the shell shrinks to the visible area; Android emulation: the layout resizes). Nothing of the bar is under the keyboard.
- [ ] With a visit draft open and the text box focused, the card scroll area is shorter (30 per cent of the height) and the Add to form and Discard row is visible above the keyboard.
- [ ] Blur the text box: the shell returns to full height; no gap at the bottom; page scroll is normal.
- [ ] Rotate the Simulator with the keyboard up and back: the bar stays above the keyboard.
- [ ] Typing in the text box does not zoom the page on iOS.
- [ ] The booking and Edit stock dialogs at 390 px with the keyboard open: their Cancel and Confirm or Submit rows remain reachable.
