// Repo path: frontend/src/lib/voice/copy.ts
// Lives in lib/voice, not components/voice, so lib/voice/intents.ts can use it without importing a component folder.
// Every string the voice feature shows: the bar, its review card, its messages, the two dialog
// notes and the tour step. Wording is candidate 2's (usage.md section 3 and its copy.ts), adjusted
// to the synthesis decisions; strings candidate 2 did not have are marked NEW.
// Plain English for clinic staff: short sentences, no jargon, no "AI".
// VoiceBar.states.test.tsx asserts these exact strings, so a wording change is a reviewed change.
// lib/voice/intents.ts imports COPY for slot messages; pages import VOICE_DIALOG_COPY and TOUR_COPY.

import type { FailureKind, VisitSectionKey, VoiceIntent, VisitNoteUndone } from './types';

/**
 * @cc [owner:nareshshah139,label:product] voice-copy-single-source
 * Every visible string of the voice bar, its review, its notices and its dialog notes MUST be
 * defined here; other modules MUST import it rather than write their own wording.
 */
export const SECTION_LABELS: Readonly<Record<VisitSectionKey, string>> = {
  chiefComplaints: 'Chief Complaints',
  examination: 'Examination',
  pastHistory: 'Past history',
  medicationHistory: 'Medication history',
};

/** "A", "A and B", "A, B and C" */
export function joinList(items: readonly string[]): string { throw new Error('not implemented'); }
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lines = (n: number) => (n === 1 ? '1 line' : `${n} lines`);

export const COPY = {
  // ---- idle ----
  placeholder: {
    'visit-note': 'Speak the visit notes, or type them here',
    'book-appointment': 'Say or type: Book Meera Iyer tomorrow at 4:30 with Dr Shravya',
    'stock-count': 'Say or type: Paracetamol 500, batch B12, 48 strips',
  } satisfies Record<VoiceIntent, string>,

  // ---- busy states ----
  openingMic: 'Opening the microphone…',                                     // NEW
  listening: (mmss: string) => `Listening ${mmss}`,
  listeningHint: 'Press Esc to discard.',
  listeningEnding: (secondsLeft: number) => `Stopping in ${secondsLeft} s`,
  transcribing: 'Writing down what you said…',
  working: 'Working out your request…',
  replanning: 'Checking…',

  // ---- review ----
  draftReady: 'Draft ready. Check it, then use the button.',
  heardPrefix: 'Heard:',
  heardEdit: 'Edit',
  discard: 'Discard',
  applyDisabledNeedsYou: 'Answer the question above to continue.',
  visitNothingPlaced: 'Choose where each line goes. Nothing is added until you do.',
  visitNotPlacedHeading: (n: number) => `Not placed (${n})`,
  visitPlaceLabel: 'Put this line in',
  visitPlaceUnsorted: 'Not placed yet',                                       // NEW: option that moves a line back
  visitPartial: (added: readonly VisitSectionKey[], left: number) =>
    `Added to ${joinList(added.map((k) => SECTION_LABELS[k]))}. ${lines(left)} still to place.`,
  visitAddedAfter: (n: number) => `Added after the ${n === 1 ? 'line' : `${n} lines`} already there.`,
  applyFailed: 'Could not add this to the form. Nothing was changed. Please try again.',
  apply: {
    visitNote: 'Add to form',
    bookingComplete: 'Open booking form',
    bookingPartial: "Fill what's known",                                      // NEW (base label)
    stockEdit: 'Open stock count form',
    showMatches: 'Show matches in the list',
  },
  rowLabels: {
    patient: 'Patient', doctor: 'Doctor', when: 'When', date: 'Date', time: 'Time',
    medicine: 'Medicine', batch: 'Batch', onShelf: 'On the shelf now',
  },
  onShelfChange: (now: number, said: number, unit: string) => `${now} ${unit} → you said ${said} ${unit}`,
  expires: (monthYear: string) => `Expires ${monthYear}`,

  // ---- applied and after ----
  done: 'Done',
  undo: 'Undo',
  undoneFallback: 'Undone.',
  applied: {
    visitNote: (added: readonly VisitSectionKey[], leftOut: number) =>
      `Added to ${joinList(added.map((k) => SECTION_LABELS[k]))}. You can still edit them.` +
      (leftOut > 0 ? ` ${lines(leftOut)} ${leftOut === 1 ? 'was' : 'were'} left out.` : ''),
    bookingComplete: 'Booking form is open. Nothing is booked until you press Confirm Booking.',
    bookingPartial: (set: readonly ('doctor' | 'date' | 'patient')[], remaining: string) =>
      // "Doctor and date are set. <remaining>"; first word capitalised; set is never empty here.
      `${capitalise(joinList(set))} ${set.length === 1 ? 'is' : 'are'} set. ${remaining}`, // NEW
    stockEdit: 'Stock count form is open. Nothing changes until a doctor or admin approves it.',
    stockSearch: (text: string) => `Showing stock for "${text}". Use Edit stock on the right row.`, // NEW (base)
  },
  undone: (r: VisitNoteUndone) =>
    r.kept.length === 0
      ? 'Undone.'
      : `Undone for ${joinList(r.restored.map((k) => SECTION_LABELS[k]))}. ` +
        `${joinList(r.kept.map((k) => SECTION_LABELS[k]))} ${r.kept.length === 1 ? 'was' : 'were'} left as it is because you have edited it.`,
  discarded: 'Recording discarded.',                                           // NEW
  pageChanged: 'The page changed, so this draft was discarded.',               // decision 3
  tooLong: (limit: number) => `That is too long to send at once. Please keep it under ${limit} characters.`, // NEW

  // ---- booking slot messages (used by lib/voice/intents.ts) ----
  booking: {
    whichDoctor: 'Which doctor?',
    noDoctorCalled: (name: string) => `No doctor called "${name}". Choose one.`,
    shownOnCalendar: 'Shown on the calendar',
    whichPatient: (name: string) => `Which ${name}?`,
    noPatient: (name: string) => `No patient found for "${name}". Check the spelling, or add the patient first.`,
    patientNotSaid: 'Say or pick the patient.',
    choosePatient: 'Choose a patient to continue.',
    morningOrNight: (spoken: string) => `Is that ${spoken} in the morning or ${spoken} at night?`,
    outsideHours: (time: string, doctor: string, start: string, end: string) =>
      `${time} is outside ${doctor}'s hours (${start} to ${end} on this day). Pick a time slot on the calendar.`,
    timePassed: 'That time has already passed today. Pick a later slot.',
    pickSlot: 'Pick a time slot on the calendar.',
    doctorAndDateFirst: 'Choose the doctor and date first.',
    date: {
      missing: 'Say the day, or pick a date on the calendar.',                 // NEW
      past: 'That date has passed. Pick a date from today onwards.',
      invalid: 'That date does not exist. Pick a date on the calendar.',       // NEW
    },
  },

  // ---- stock slot messages ----
  stock: {
    sayAll: 'Say the medicine, the batch number and the count.',
    noBatch: (batch: string, product: string) => `No batch ${batch} found for "${product}". Search the list and use Edit stock.`,
    whichOne: 'Which one?',
    unitMismatch: (rowUnit: string, spoken: string) =>
      `This batch is counted in ${rowUnit}. You said ${spoken}. Open Edit stock and enter the count in ${rowUnit}.`,
    matchesShelf: 'This count matches the current stock. Nothing to submit.',
    belowHeld: (held: number, unit: string) =>
      `${held} ${unit} are set aside for pending sales. The count cannot be lower than that.`, // decision 5
    wholeNumber: 'Say the count as a whole number.',
  },

  // ---- controls (aria-labels; titles repeat them) ----
  micIdle: 'Speak',
  micStop: 'Stop and send',
  sendLabel: 'Send',
  discardRecordingLabel: 'Discard recording',
  tryAgain: 'Try again',
  shortcutHint: 'Ctrl+/',
  shortcutHintMac: '⌘/',
  barLabel: 'Voice and text command bar',
  textBoxLabel: 'Type your request',

  notConfigured: 'The voice bar is not set up. Ask your administrator to add the OpenAI key.',
} as const;

/** Exact failure copy. `retryLabel` null means no Try again button; it matches Failure.retry === null. */
export const FAILURE_COPY: Readonly<Record<FailureKind, { message: string; retryLabel: string | null }>> = {
  'not-configured':        { message: COPY.notConfigured, retryLabel: null },
  'mic-blocked':           { message: 'Microphone is blocked. Allow it from the lock icon in the address bar, then try again. You can also type here.', retryLabel: COPY.tryAgain },
  'mic-missing':           { message: 'No microphone found. Connect one and try again, or type here.', retryLabel: COPY.tryAgain },
  'recording-unsupported': { message: 'This browser cannot record audio. Type here instead.', retryLabel: null },
  'heard-nothing':         { message: 'Did not catch anything. Please try again.', retryLabel: COPY.tryAgain },
  'transcribe-failed':     { message: 'Could not write down your recording. Try again.', retryLabel: COPY.tryAgain },
  'recording-too-long':    { message: 'That recording is too long. Please try a shorter one.', retryLabel: COPY.tryAgain },
  'understand-failed':     { message: 'Could not work out the request just now. Try again, or fill the form by hand.', retryLabel: COPY.tryAgain },
  forbidden:               { message: 'You do not have permission to use voice for this.', retryLabel: null },
  unauthorised:            { message: 'Your session has ended. Please sign in again.', retryLabel: null },
  offline:                 { message: 'No internet connection. Check it and try again.', retryLabel: COPY.tryAgain },
  'nothing-found':         { message: 'Could not find anything to fill in from that. Please say it again.', retryLabel: COPY.tryAgain },
  'rate-limited':          { message: 'Too many requests in the last minute. Wait a moment, then try again.', retryLabel: COPY.tryAgain }, // NEW (decision 8)
};

/** Notes inside the existing dialogs when they were filled by voice (package P renders them). */
export const VOICE_DIALOG_COPY = {
  bookingNote: 'Filled by voice. Check every line before you confirm.',
  stockNote: 'Filled by voice. Check the count, then write the reason.',      // NEW wording for c2's "Filled by voice" box
  heard: 'Heard:',
  patient: 'Patient:',
  doctor: 'Doctor:',
  when: 'When:',
} as const;

/** DoctorTour step that replaces the per-field mic steps (package V). */
export const TOUR_COPY = {
  title: 'Voice and text bar',
  body: 'Press the mic in the bar at the bottom, or type. Check the draft, then press Add to form. Press Ctrl+/ to jump to the bar.',
} as const;
