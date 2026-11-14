export type ReviewAppointment = { id: string; date: string; slot: string; doctorName: string };

export type ReviewBooking =
  | { status: 'booked'; appointment: ReviewAppointment }
  | { status: 'moved'; appointment: ReviewAppointment; previous: { date: string; slot: string } }
  | { status: 'existing'; appointment: ReviewAppointment }
  | { status: 'already-scheduled'; appointment: ReviewAppointment; kept?: ReviewAppointment }
  | { status: 'full'; date: string; kept?: ReviewAppointment }
  | { status: 'skipped'; reason: 'no-review-date' }
  | { status: 'skipped'; reason: 'past-date' | 'cancelled-by-staff'; date: string }
  | { status: 'failed' };

export type ReviewMessage = { text: string; tone: 'success' | 'warning'; linkDate?: string };

type Skipped = Extract<ReviewBooking, { status: 'skipped' }>;
type Kind = Exclude<ReviewBooking['status'], 'skipped'> | Skipped['reason'];
type OutcomeOf<K extends Kind> = K extends Skipped['reason'] ? Extract<Skipped, { reason: K }> : Extract<ReviewBooking, { status: K }>;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(date: string) {
  const d = new Date(`${date}T00:00:00.000Z`);
  return { weekday: WEEKDAYS[d.getUTCDay()], day: d.getUTCDate(), month: MONTHS[d.getUTCMonth()] };
}

const shortDate = (date: string) => { const p = parts(date); return `${p.day} ${p.month}`; };
const longDate = (date: string) => { const p = parts(date); return `${p.weekday} ${p.day} ${p.month}`; };
const start = (slot: string) => slot.split('-')[0];
const doctorLabel = (name: string) => (/^dr\.?\s/i.test(name) ? name : `Dr. ${name}`);
const when = (a: { date: string; slot: string }) => `${longDate(a.date)} at ${start(a.slot)}`;

const MESSAGES: { [K in Kind]: (outcome: OutcomeOf<K>, reviewDate: string) => ReviewMessage | null } = {
  booked: ({ appointment }) => ({ tone: 'success', text: `Review booked for ${when(appointment)} with ${doctorLabel(appointment.doctorName)}` }),
  moved: ({ appointment, previous }) => ({ tone: 'success', text: `Review moved to ${when(appointment)} (was ${longDate(previous.date)} ${start(previous.slot)})` }),
  existing: ({ appointment }) => ({ tone: 'success', text: `Review already booked for ${when(appointment)} with ${doctorLabel(appointment.doctorName)}` }),
  'already-scheduled': ({ appointment, kept }) => {
    const text = `Patient already sees ${doctorLabel(appointment.doctorName)} on ${when(appointment)}, so no separate review was booked`;
    return kept
      ? { tone: 'warning', text: `${text}. The earlier review on ${when(kept)} is still booked`, linkDate: kept.date }
      : { tone: 'success', text };
  },
  full: ({ date, kept }) => ({
    tone: 'warning',
    text: kept ? `No free slot on ${shortDate(date)}, so the review stays on ${when(kept)}` : `No free slot on ${shortDate(date)}. Book the review from Appointments`,
    linkDate: date,
  }),
  failed: (_outcome, reviewDate) => ({
    tone: 'warning',
    text: `The review was not booked. Book it from Appointments${reviewDate ? ` for ${shortDate(reviewDate)}` : ''}`,
    linkDate: reviewDate,
  }),
  'cancelled-by-staff': ({ date }) => ({ tone: 'warning', text: `The review on ${shortDate(date)} was cancelled at the desk, so it was not booked again`, linkDate: date }),
  'past-date': () => ({ tone: 'warning', text: 'The review date has passed, so no appointment was booked' }),
  'no-review-date': () => null,
};

/**
 * @cc [owner:nareshshah139,label:product] review-booking-outcome-message
 * After a visit completes, the doctor MUST be told in plain words what happened to the review: booked, moved (with
 * the previous date and time), already booked, not booked because the patient already sees the same doctor that day,
 * not booked again because the desk cancelled it, no free slot, a past date, or a failure. Every outcome the desk
 * must act on (no free slot, a failure, a review cancelled at the desk, or an earlier review kept beside another
 * appointment) MUST offer a link to the Appointments page on the day to act on, for that patient and doctor.
 */
export function reviewBookingMessage(outcome: ReviewBooking | undefined, reviewDate: string): ReviewMessage | null {
  if (!outcome) return null;
  const kind: Kind = outcome.status === 'skipped' ? outcome.reason : outcome.status;
  return (MESSAGES[kind] as (outcome: ReviewBooking, reviewDate: string) => ReviewMessage | null)(outcome, reviewDate);
}
