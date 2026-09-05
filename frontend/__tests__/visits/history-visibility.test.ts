import { isEmptyHistoryEntry } from '@/lib/history-visibility';

const now = new Date('2026-09-05T12:00:00Z');
const pastVisit = { entryType: 'visit', createdAt: '2026-09-04T10:00:00Z' };
it('hides only a past visit with no saved details', () => {
  expect(isEmptyHistoryEntry({ ...pastVisit, complaints: [], history: null, exam: '{}', diagnosis: '[]', plan: { dermatology: { medications: {}, procedures: [] } } }, now)).toBe(true);
});
it.each([
  { ...pastVisit, entryType: 'appointment' },
  { ...pastVisit, entryType: undefined },
  { entryType: 'visit' },
  { ...pastVisit, createdAt: 'invalid' },
  { ...pastVisit, createdAt: '2026-09-05T00:00:00Z' },
  { ...pastVisit, createdAt: '2026-09-06T00:00:00Z' },
  { ...pastVisit, appointment: { date: '2026-09-05T00:00:00Z' } },
  { ...pastVisit, appointment: { date: 'invalid' } },
])('retains appointments, unknown dates, and current/future visits: %j', entry => {
  expect(isEmptyHistoryEntry(entry, now)).toBe(false);
});
it('uses the appointment day even when the visit was created later', () => {
  expect(isEmptyHistoryEntry({ ...pastVisit, createdAt: '2026-09-05T10:00:00Z', appointment: { date: '2026-09-04T00:00:00Z' } }, now)).toBe(true);
});
it('uses India midnight to distinguish past visits from today', () => {
  const visit = { ...pastVisit, createdAt: '2026-09-04T18:29:00Z' };
  expect(isEmptyHistoryEntry(visit, new Date('2026-09-04T18:29:59Z'))).toBe(false);
  expect(isEmptyHistoryEntry(visit, new Date('2026-09-04T18:30:00Z'))).toBe(true);
  expect(isEmptyHistoryEntry({ ...visit, createdAt: '2026-09-04T18:30:00Z' }, now)).toBe(false);
});
it.each([
  { complaints: [{ complaint: 'No new complaints' }] },
  { complaints: [{ complaint: 'General consultation' }] },
  { complaints: [{ complaint: 'Photo documentation visit' }] },
  { complaints: 'A brief complaint' },
  { complaints: { complaint: 'Legacy complaint' } },
  { history: { fever: false } },
  { appointmentNotes: 'A saved note' }, { history: { pastHistory: 'Recorded history' } },
  { complaints: [{ complaint: 'Rash' }] }, { complaints: [{ complaint: 'General consultation', notes: 'Specific observation' }] },
  { plan: { dermatology: { labResults: { CBC: { value: '12' } } } } }, { exam: { dermatology: { itchScore: 0 } } },
  { prescriptionItems: [{ drugName: 'Medicine' }] }, { photos: 1 }, { scribeJson: { notes: 'Recorded text' } },
  { appointment: { notes: 'A saved booking note' } },
])('retains every record with saved content: %j', data => {
  expect(isEmptyHistoryEntry({ ...pastVisit, ...data }, now)).toBe(false);
});
