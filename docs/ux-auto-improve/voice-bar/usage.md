# Voice bar: the caller's view

This is the synthesized design. The base is candidate 1. Candidate 2's failure model, copy, layout, keyboard and stock extras are folded in. Types are in `sketch/`. Line numbers are for the working tree and were opened while writing this.

Two callers. The **page author** adds one `useVoiceCapability(...)` call. The **clinic user** speaks or types into a bar at the bottom of the screen.

## 1. What a page does

A page that owns a form registers one object with one hook:

```ts
import { useVoiceCapability } from '@/components/voice/VoiceBarProvider';

useVoiceCapability({
  intent: 'book-appointment',   // one of the closed set in @cms/shared-types/voice
  context: { … },               // data the intent needs from the page; typed per intent
  scope: someKey,               // optional, opaque; a change discards an open draft
  apply: (prefill) => { … },    // write a reviewed prefill into the form; never save
});
// or useVoiceCapability(null) when the page offers nothing right now
```

That is the whole public surface. The page never sees audio, transcripts, model output, slots, review state or wording.

- `apply` receives `Reviewed<PrefillOf<K>>`. It is already resolved to the page's own records: ids came from the app's lookups, never from the model. Only the bar's Apply transition mints the `Reviewed` brand.
- `apply` returns `IntentApplyResults[K]`. For the visit note that is `{ written, undo }`. For booking and stock it is `void`: they open a dialog, and the dialog's Cancel is the undo. The type has no place for a booking or stock undo.
- `scope` is an opaque string. A registration's identity is (registrant, intent, scope). If the scope changes while a recording, a request or a review is open, the bar discards it and shows "The page changed, so this draft was discarded." Any pending Undo is dropped too.
- Pages write no user-facing words. The dialog notes they render come from `@/lib/voice/copy`.

The bar appears only while a mounted component has a non-null registration. Nobody keeps a route list.

## 2. Call site 1: visit note (`frontend/src/components/visits/PrescriptionBuilder.tsx`)

Delete the recorder hook call, `applyText` and the `VoiceButton` `useCallback` (about `:525-573`), `<VoiceButton fieldName="chiefComplaints" />` (about `:4757`) and `<VoiceButton fieldName="objective" />` (about `:5029`), and the imports that become unused (grep first). Add:

```tsx
import { useVisitNoteVoice } from './visit-note-voice';

// next to the other state; clinicalScopeKey already exists at :221 (JSON of patientId, visitId, doctorId)
useVisitNoteVoice({
  chiefComplaints:   { value: chiefComplaints,   set: setChiefComplaints,
                       markTouched: () => setChiefComplaintsTouched(true) },   // as typing does (:4756)
  examination:       { value: exObjective,       set: setExObjective },      // never touches the disclosure
  pastHistory:       { value: pastHistory,       set: setPastHistory },
  medicationHistory: { value: medicationHistory, set: setMedicationHistory },
}, clinicalScopeKey);
```

`VisitNoteFields` is mapped over `VISIT_NOTE_SECTIONS` (four keys this round). A section added to the wire list fails the build here until it is bound. Inside, `useVisitNoteVoice` calls:

```ts
useVoiceCapability({
  intent: 'visit-note',
  context: {},
  scope,                                   // clinicalScopeKey: a patient, visit or doctor change discards the draft
  apply: (prefill) => applyVisitNote(latest, prefill),   // appends, marks touched, returns { written, undo }
});
```

## 3. Call site 2: book appointment (`frontend/src/components/appointments/AppointmentsCalendar.tsx`)

```tsx
import { useVoiceCapability } from '@/components/voice/VoiceBarProvider';

const voiceAllowed = !hideHeaderControls && !controlledDoctorId && !controlledDate && doctors.length > 0;
const [voiceSummary, setVoiceSummary] = useState<VoiceBookingSummary | null>(null);

useVoiceCapability(voiceAllowed ? {
  intent: 'book-appointment',
  context: {
    doctors,                                    // the list the page already loaded (getUsers limit 100, :185)
    shownDoctorId: doctorId || null,            // labels that option "Shown on the calendar"; never preselected
    slotMinutes: gridMinutes,
    defaultHours: { startHour: timeSlotConfig.startHour, endHour: timeSlotConfig.endHour },
  },
  apply: (prefill) => {
    // One batch of setters. Never searchPatients() (it opens quick create on zero results, :291-294)
    // and never handleBookingRequest() (it reads selectedPatient from this render's closure, :306-316).
    if (prefill.doctor) setDoctorId(prefill.doctor.id);
    if (prefill.date) setDate(prefill.date);
    if (prefill.patient.kind === 'chosen') {
      selectPatientRow(prefill.patient.ref.record);   // extracted from the row onClick; both paths share it
    } else if (prefill.patient.kind === 'search') {
      setPatientSearch(prefill.patient.text);          // shows the existing "+ Add" button; no dialog opens
      setPatients([]); setSelectedPatientId(''); setSelectedPatient(null);
    }
    if (prefill.complete) {
      setPendingBookingSlot(prefill.slot);             // 'HH:MM-HH:MM'
      setVoiceSummary(prefill.summary);
      setBookingDialogOpen(true);                      // Confirm Booking stays the only write
    }
  },                                                   // returns nothing: no undo for booking
} : null);
```

`AppointmentBookingDialog` gets `voiceSummary?: VoiceBookingSummary | null`. When set, the dialog shows a `role="note"` box with `VOICE_DIALOG_COPY.bookingNote` and the Heard, Patient, Doctor and When lines, and focuses Cancel first through `onOpenAutoFocus`. Closing the dialog clears `voiceSummary`.

The calendar's hours effect (`:117-142`) switches to `workingHoursOn(meta, date, prev)` from `lib/working-hours.ts`, so the calendar and voice read hours one way.

## 4. Call site 3: stock count (`frontend/src/components/inventory/WorkspaceStock.tsx`)

`canSubmitEdits` is `:75` (OWNER, ADMIN, PHARMACIST); `stockEdit` is `:76`; `navigate` is a prop; the dialog mounts at `:1374`.

```tsx
import { useVoiceCapability } from '@/components/voice/VoiceBarProvider';

const [stockEdit, setStockEdit] = useState<{
  item: any; field: 'price' | 'stock'; initialValue?: string; voice?: { heard: string } | null;
} | null>(null);

useVoiceCapability(canSubmitEdits && !itemId ? {
  intent: 'stock-count',
  context: {},
  apply: (prefill) => {
    if (prefill.action === 'edit-count') {
      setStockEdit({ item: prefill.row.record, field: 'stock',
                     initialValue: String(prefill.count), voice: { heard: prefill.heard } });
    } else {
      navigate({ search: prefill.text, page: '1', item: '' });   // the search box's own mechanism (:157)
    }
  },                                                              // returns nothing: no undo for stock
} : null);
```

`StockEditDialog` gets `initialValue?: string`, `voice?: { heard: string } | null` and `expiryDate?` on `item`. With `voice` set it shows a `role="note"` box with `VOICE_DIALOG_COPY.stockNote` and the heard text, the count input loses `autoFocus` (`:72` today) and the reason textarea gets it. The reason stays empty, so "Submit for approval" stays disabled until a person types one (`valid`, `:26-27`).

## 5. The shell mount (`frontend/src/components/layout/dashboard-layout.tsx`)

```tsx
<DashboardUserProvider value={contextValue}>
  <VoiceBarProvider>                                                      {/* registry only */}
    <div className="flex bg-background h-[var(--voice-shell-height,100dvh)] mt-[var(--voice-shell-offset,0px)]">
      …sidebar…                                                          {/* root was h-screen (:116) */}
      <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
        …header, mobile top bar…
        <main className="min-w-0 flex-1 overflow-auto p-4 md:p-6">{children}</main>   {/* :159-161 */}
        <VoiceBar />                                                      {/* in-flow sibling: main shrinks */}
      </div>
    </div>
  </VoiceBarProvider>
</DashboardUserProvider>
```

`frontend/src/app/dashboard/layout.tsx` (a server component) gains:

```ts
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-content',
};
```

Android Chrome then shrinks the layout for the keyboard. iOS Safari ignores `interactiveWidget`, so while the bar's text box has focus, `useVisualViewportShell` (in `components/voice/visual-viewport.ts`) writes the two CSS variables from `window.visualViewport`, and the shell fits above the keyboard. Dialogs are Radix portals above the overlay, so the bar never covers a dialog's action row; it sits under the overlay and is inert while a dialog is open.

## 6. How the bar looks

Existing tokens and components only. No new colours, fonts or radii.

| Part | Built from |
|---|---|
| Surface | `border-t border-border bg-card`, `px-4 md:px-6 pt-2`, inner `mx-auto w-full max-w-3xl`, `pb-[max(0.5rem,env(safe-area-inset-bottom))]` |
| Text box | `ui/textarea` `Textarea`, `rows={1}`, `max-h-28`, `text-base` on phones (no iOS zoom), `md:text-sm` |
| Mic, Send | `ui/button`, `size="icon"` with `size-11 md:size-9` (44 px on phones); `lucide-react` `Mic`, `Square`, `ArrowUp` |
| Recording | red `bg-destructive` dot with `animate-pulse motion-reduce:animate-none`; time in `font-mono tabular-nums` |
| Busy | `ui/spinner` plus text; `aria-busy` on the bar |
| Draft card | `rounded-lg border bg-background p-3`; scroll area `max-h-[45dvh]`, `max-h-[30dvh]` while the text box has focus; the Apply row sits outside the scroll area |
| Unplaced and warning rows | `bg-warning-soft text-warning-text border-warning-border` |
| Choices | radio rows `min-h-11 rounded-md border`; selected `border-primary bg-primary-soft` |
| Applied | `bg-success-soft text-success-text border-success-border`, in the `role="status"` line |
| Failure | `bg-destructive-soft text-destructive-text border-destructive-border`, `role="alert"` |

## 7. Keyboard

| Key | Where | Does |
|---|---|---|
| `Ctrl+/` or `Cmd+/` | anywhere on a page with a capability, including inside a text field | focuses the bar's text box and remembers the element that had focus |
| `Enter` | text box | sends (the same path as a transcript) |
| `Shift+Enter` | text box | new line |
| `Enter` | while listening | stops and sends |
| `Esc` | while listening | discards the recording; nothing is uploaded; focus returns to the remembered element |
| `Esc` | draft, applied or failure showing | dismisses and returns focus to the remembered element |
| `Tab` | draft | choices, section selects, Apply, Discard in reading order |

One `role="status" aria-live="polite"` line carries every state. Failures use `role="alert"`. Focus moves on its own only after Edit (into the text box), after Esc (back to the remembered element), after a visit-note apply (to the text box), and when a dialog opens.

## 8. What the user sees: walkthroughs

All wording below is exact and lives in `lib/voice/copy.ts`.

### Utterance 1, visit: "Itching on both elbows for two weeks, worse at night. On examination there are scaly plaques over the extensor surfaces. Using only moisturiser at home. Review after four weeks."

The doctor is on the Prescription tab. Chief Complaints already holds two typed lines.

1. Idle bar, placeholder "Speak the visit notes, or type them here". The doctor presses `Ctrl+/` or taps the mic.
2. "Opening the microphone…", then **Listening 0:07** with "Press Esc to discard." Buttons: Stop and send, Discard recording.
3. The doctor taps Stop. "Writing down what you said…".
4. "Working out your request…".
5. **Draft ready. Check it, then use the button.** The card:
   - Heard: "Itching on both elbows for two weeks, worse at night. On examination…" with an Edit button.
   - Chief Complaints: "Itching on both elbows for two weeks, worse at night." Under it, muted: "Added after the 2 lines already there."
   - Examination: "On examination there are scaly plaques over the extensor surfaces."
   - Medication history: "Using only moisturiser at home."
   - Not placed (1): "Review after four weeks." with a "Put this line in" select: Not placed yet, Chief Complaints, Examination, Past history, Medication history.
   - Every placed line has the same select, so the doctor can move it, or move it back to "Not placed yet".
   - Buttons: **Add to form**, Discard.
6. One line is unplaced, but three are placed, so Add to form is enabled. The doctor presses it. The three fields are appended on a new line each. Existing line breaks in Chief Complaints are kept, and Chief Complaints is marked touched as typing does.
7. The bar stays in review, now holding only the unplaced line: "Added to Chief Complaints, Examination and Medication history. 1 line still to place." Edit is gone, because part of the draft is already in the form.
8. Follow-up is not a section this round, so the doctor presses Discard. Discard is the only way an unplaced line is thrown away. The status line reads "Added to Chief Complaints, Examination and Medication history. You can still edit them. 1 line was left out." Buttons: Undo, Done. There is no timer.
9. Undo restores a field only if it still holds exactly what the bar wrote. If the doctor has typed in Chief Complaints since: "Undone for Examination and Medication history. Chief Complaints was left as it is because you have edited it." Otherwise "Undone."

Variants

- **Doctor places the last line instead.** They pick Examination for "Review after four weeks." and press Add to form again. The bar goes idle with "Added to Chief Complaints, Examination and Medication history. You can still edit them." Undo reverts both applies of this utterance.
- **Nothing placed** (the model was unsure of every sentence). All lines sit under "Not placed". Add to form is disabled, with "Choose where each line goes. Nothing is added until you do."
- **Nothing usable** ("um, okay"). "Could not find anything to fill in from that. Please say it again." Try again.
- **Mixed sentence.** "Itching for two weeks and papules on the forearms." is one sentence, so it lands in one section. The doctor moves it with the select, or edits the field after applying.
- **Patient change with a draft open.** The doctor switches patient or visit while a draft or a recording is open. `clinicalScopeKey` changes, the bar drops the draft and shows "The page changed, so this draft was discarded." A pending Undo is dropped too, so it cannot write into the new visit.
- **Edit.** Before anything was applied, Edit puts the heard text in the text box. The doctor fixes a word and presses Enter.
- **Another tab.** The builder stays mounted on the other tabs of the visit form (`forceMount`), so the bar shows there too. The applied line names the sections the text went to. This is an open question.
- **390 px.** The card scrolls inside `max-h-[45dvh]` (`30dvh` while the text box has focus). The Add to form and Discard row stays outside the scroll area. Section selects are full-width native selects, 44 px high.

### Utterance 2, appointments: "Book Meera Iyer tomorrow at four thirty with Dr Shravya."

The receptionist is on the Calendar tab. Today is Mon 16 Nov 2026. The calendar shows whichever doctor loaded first.

1. Placeholder "Say or type: Book Meera Iyer tomorrow at 4:30 with Dr Shravya". They type it, or speak it, and press Enter.
2. "Working out your request…". The server returns words only: name, doctor word, "tomorrow", 4:30, no am or pm. The bar looks up the doctor in the page's list and the patient through the existing patient search, reads Dr Shravya's hours for 17 Nov, and resolves the time in code.
3. **Draft ready.**
   - Heard: "Book Meera Iyer tomorrow at four thirty with Dr Shravya" Edit
   - Patient: Meera Iyer · P-00231 · 34 F · 98xxxxxx12
   - Doctor: Dr Shravya
   - When: Tue 17 Nov 2026, 16:30 to 17:00 (only 4:30 pm falls inside hours of 9 to 18)
   - Buttons: **Open booking form**, Discard.
4. They press Open booking form. Doctor, date and patient are set on the calendar, and the existing booking dialog opens with "Filled by voice. Check every line before you confirm." Focus is on Cancel.
5. The bar shows "Booking form is open. Nothing is booked until you press Confirm Booking." Button: Done. There is no Undo. Cancel in the dialog is the undo.
6. They press Confirm Booking. The existing `createAppointment` call runs, and the existing success feedback shows. Whether the slot is still free is checked by the server here, as today.

Variants

- **No doctor said.** The question "Which doctor?" lists every doctor. The one on the calendar is labelled "Shown on the calendar" but is not selected. An unspoken doctor is a choice, because the calendar's selected doctor is simply the first one loaded (`:188`). With exactly one doctor in the clinic, that doctor is used.
- **Several doctors** ("Dr Shah" with two Shahs). "Which doctor?" with the two names. Choosing one re-checks the time against that doctor's hours.
- **No doctor by that name.** `No doctor called "Shravya". Choose one.` with all doctors. In a clinic with more than 100 doctors the calendar loads only 100 (`:185`), so a real doctor can be reported missing.
- **Several patients** (three Meera Iyers). "Which Meera Iyer?" with three rows, each with ID, age, sex and phone. Open booking form stays disabled with "Answer the question above to continue."
- **No patient found.** Patient reads `No patient found for "Meera Iyer". Check the spelling, or add the patient first.` The button is "Fill what's known". It sets doctor and date and puts "Meera Iyer" in the patient search, where the existing "+ Add" button is. No dialog opens on its own. The bar then says `Doctor and date are set. No patient found for "Meera Iyer". Check the spelling, or add the patient first.`
- **Ambiguous time** ("at 9:30", hours 8 to 22). "Is that 9:30 in the morning or 9:30 at night?" with "9:30 am" and "9:30 pm". With one reading inside the hours there is no question.
- **Outside hours.** Time reads "4:30 pm is outside Dr Shravya's hours (9:00 to 13:00 on this day). Pick a time slot on the calendar." "Fill what's known" sets doctor, date and patient; the receptionist picks a slot.
- **Past time or date.** "That time has already passed today. Pick a later slot." or "That date has passed. Pick a date from today onwards." The rest can still be filled.
- **Embedded calendar** (controlled doctor or date, or hidden header controls). The page registered `null`, so there is no bar.
- **390 px.** Choices are full-width 44 px rows. The dialog's own Cancel and Confirm row stays visible, because the dialog is above the bar.

### Utterance 3, stock: "Paracetamol five hundred, batch B twelve, forty-eight strips."

The pharmacist is on the inventory stock list.

1. Placeholder "Say or type: Paracetamol 500, batch B12, 48 strips".
2. The server returns words only: product, batch B12, 48, "strips". The bar fetches the list's own endpoint with that search and keeps rows whose normalised batch is `B12`.
3. **Exactly one row.** The card:
   - Heard: "Paracetamol five hundred, batch B twelve, forty-eight strips" Edit
   - Medicine: Paracetamol 500 mg tablets (the matched row, not the spoken words)
   - Batch: B12 · Expires Mar 2027
   - On the shelf now: 52 strip → you said 48 strip
   - Buttons: **Open stock count form**, Discard.
4. The existing Edit stock dialog opens with 48, "Filled by voice. Check the count, then write the reason." and the heard text. The reason is empty and has focus. Submit for approval is disabled until a reason is typed.
5. The bar shows "Stock count form is open. Nothing changes until a doctor or admin approves it." Button: Done. There is no Undo; Cancel in the dialog is the undo.

Variants

- **No matching batch.** `No batch B12 found for "Paracetamol 500". Search the list and use Edit stock.` The button is "Show matches in the list". Pressing it sets the list's search; nothing else happens.
- **Several rows share the batch.** "Which one?" with name, batch, expiry and shelf count per row. Choose, then Open stock count form.
- **Unit mismatch** (row counted in tablet). "This batch is counted in tablet. You said strips. Open Edit stock and enter the count in tablet." The button is "Show matches in the list". No form opens.
- **Count equals the shelf.** "This count matches the current stock. Nothing to submit." No button but Discard.
- **Count below set-aside stock** (6 strip set aside, 4 said). "6 strip are set aside for pending sales. The count cannot be lower than that." No button but Discard.
- **Missing batch or count.** "Say the medicine, the batch number and the count."
- **Reception or doctor user.** The page registered `null` (`canSubmitEdits`), so there is no bar. An OWNER sees the bar; the parse route answers 403 unless OWNER holds the inventory-change permission, exactly as the form's submit would.
- **Item detail view.** The page registers only on the list (`!itemId`).

### Failures common to all three

| Situation | What the bar shows | Buttons |
|---|---|---|
| No OpenAI key (status says not configured, or a 503 names the key) | "The voice bar is not set up. Ask your administrator to add the OpenAI key." Text box and mic disabled. Sending shows the same line. | none |
| Mic blocked | "Microphone is blocked. Allow it from the lock icon in the address bar, then try again. You can also type here." | Try again (opens the mic again) |
| No microphone | "No microphone found. Connect one and try again, or type here." | Try again |
| Browser cannot record | "This browser cannot record audio. Type here instead." The mic is not offered. | none |
| Under 1 second, or empty transcript | "Did not catch anything. Please try again." | Try again |
| Transcription failed | "Could not write down your recording. Try again." | Try again (re-sends the same recording; no re-speaking) |
| Recording too large (413) | "That recording is too long. Please try a shorter one." | Try again |
| Parse failed (503, timeout) | "Could not work out the request just now. Try again, or fill the form by hand." The heard text is back in the text box. | Try again (re-sends the text) |
| Too many requests (429) | "Too many requests in the last minute. Wait a moment, then try again." | Try again |
| Nothing usable | "Could not find anything to fill in from that. Please say it again." | Try again |
| Not allowed (403) | "You do not have permission to use voice for this." | none |
| Session ended (401) | "Your session has ended. Please sign in again." The existing redirect runs. | none |
| Offline | "No internet connection. Check it and try again." | Try again (that step) |
| Typed text over the limit | "That is too long to send at once. Please keep it under 500 characters." (8000 for a visit note). The text stays. | none |
| Apply threw | "Could not add this to the form. Nothing was changed. Please try again." The draft stays. | Apply again |
| Page changed mid-attempt | "The page changed, so this draft was discarded." | none |
| Recording discarded with Esc | "Recording discarded." | none |

Navigation mid-recording: leaving the page unregisters the capability, which stops the microphone and uploads nothing. The next page starts with an idle bar.
