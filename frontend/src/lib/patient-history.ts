export const PATIENT_HISTORY_CHANGED = 'patient-history-changed';
export function encounterTime(visit: Record<string, any>): number {
  const value = visit.encounterDate || visit.appointment?.date || visit.createdAt;
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}
export function encounterDay(visit: Record<string, any>): string {
  const appointmentDate = visit.appointment?.date;
  if (appointmentDate) {
    const parsed = new Date(appointmentDate);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '';
  }
  if (!visit.encounterDate && !visit.createdAt) return '';
  if (!Number.isFinite(new Date(visit.encounterDate || visit.createdAt).getTime())) return '';
  const date = new Date(encounterTime(visit));
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
