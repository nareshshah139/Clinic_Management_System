import { isEmptyHistoryEntry } from '@/lib/history-visibility';
it('hides empty appointment and generic visit placeholders', () => {
  expect(isEmptyHistoryEntry({ entryType: 'appointment' })).toBe(true);
  expect(isEmptyHistoryEntry({ entryType: 'visit', complaints: [{ complaint: 'General consultation' }], history: null, exam: '{}', diagnosis: '[]', plan: { dermatology: { medications: {}, procedures: [] } } })).toBe(true);
});
it.each([
  { complaints: [{ complaint: 'No new complaints' }] },
  { appointmentNotes: 'A saved note' }, { history: { pastHistory: 'Recorded history' } },
  { complaints: [{ complaint: 'Rash' }] }, { complaints: [{ complaint: 'General consultation', notes: 'Specific observation' }] },
  { plan: { dermatology: { labResults: { CBC: { value: '12' } } } } }, { exam: { dermatology: { itchScore: 0 } } },
  { prescriptionItems: [{ drugName: 'Medicine' }] }, { photos: 1 }, { scribeJson: { notes: 'Recorded text' } },
  { appointment: { notes: 'A saved booking note' } },
])('retains every record with saved content: %j', data => {
  expect(isEmptyHistoryEntry({ entryType: 'visit', ...data })).toBe(false);
});
