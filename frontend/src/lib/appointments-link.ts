const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @cc [owner:nareshshah139,label:product] appointments-deep-link
 * A link to the Appointments page MAY name a day as ?date=YYYY-MM-DD, a doctor as ?doctorId= and a patient as ?patientId=.
 * The page MUST open on that day and doctor, MUST ignore a malformed date, and MUST preselect the patient for booking.
 */
export function appointmentsHref(date?: string | null, doctorId?: string | null, patientId?: string | null): string {
  const params = new URLSearchParams();
  if (date && ISO_DATE.test(date)) params.set('date', date);
  if (doctorId) params.set('doctorId', doctorId);
  if (patientId) params.set('patientId', patientId);
  const query = params.toString();
  return query ? `/dashboard/appointments?${query}` : '/dashboard/appointments';
}

export function readAppointmentsLink(search: Pick<URLSearchParams, 'get'>): { date?: string; doctorId?: string } {
  const date = search.get('date');
  return { date: date && ISO_DATE.test(date) ? date : undefined, doctorId: search.get('doctorId') || undefined };
}
