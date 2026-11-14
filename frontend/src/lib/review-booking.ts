export type ReviewAppointment = { id: string; date: string; slot: string; doctorName: string };

export type ReviewBooking =
  | { status: 'booked'; appointment: ReviewAppointment }
  | { status: 'existing'; appointment: ReviewAppointment }
  | { status: 'full'; date: string }
  | { status: 'skipped'; reason: 'no-review-date' | 'past-date' }
  | { status: 'failed' };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(date: string) {
  const d = new Date(`${date}T00:00:00.000Z`);
  return { weekday: WEEKDAYS[d.getUTCDay()], day: d.getUTCDate(), month: MONTHS[d.getUTCMonth()] };
}

const shortDate = (date: string) => { const p = parts(date); return `${p.day} ${p.month}`; };
const longDate = (date: string) => { const p = parts(date); return `${p.weekday} ${p.day} ${p.month}`; };
const doctorLabel = (name: string) => (/^dr\.?\s/i.test(name) ? name : `Dr. ${name}`);

function reviewPhrase(a: ReviewAppointment) {
  return `${longDate(a.date)} at ${a.slot.split('-')[0]} with ${doctorLabel(a.doctorName)}`;
}

/**
 * @cc [owner:nareshshah139,label:product] review-booking-outcome-message
 * After a visit completes, the doctor MUST be told in plain words whether the review was booked, was already
 * booked, or could not be booked. A day with no free slot and a failed booking MUST offer a link to the
 * Appointments page on that day for that patient and doctor.
 */
export function reviewBookingMessage(
  outcome: ReviewBooking | undefined,
  reviewDate: string,
): { text: string; needsAction: boolean } | null {
  if (!outcome || outcome.status === 'skipped') return null;
  switch (outcome.status) {
    case 'booked':
      return { text: `Review booked for ${reviewPhrase(outcome.appointment)}`, needsAction: false };
    case 'existing':
      return { text: `Review already booked for ${reviewPhrase(outcome.appointment)}`, needsAction: false };
    case 'full':
      return { text: `No free slot on ${shortDate(outcome.date)}. Book the review from Appointments`, needsAction: true };
    case 'failed':
      return { text: `The review was not booked. Book it from Appointments${reviewDate ? ` for ${shortDate(reviewDate)}` : ''}`, needsAction: true };
  }
}
