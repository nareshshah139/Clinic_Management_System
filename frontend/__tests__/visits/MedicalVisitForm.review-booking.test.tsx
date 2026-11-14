import { act, fireEvent, render, screen } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';
const mockToast = jest.fn();
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), getPatient: jest.fn(), getPatientVisitHistory: jest.fn(), getAllPatientVisitHistory: jest.fn(), getVisits: jest.fn(), updateVisit: jest.fn(), createVisit: jest.fn(), completeVisit: jest.fn() } }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@/components/visits/PrescriptionBuilder', () => function Editor({ onSummaryChange }: any) { return <button onClick={() => onSummaryChange({ complaint: true, diagnosis: false, plan: false, medicines: 1, vitals: false })}>Record complaint and one medicine</button>; });
jest.mock('@/components/visits/VisitPhotos', () => function Photos() { return null; });
jest.mock('@/components/tours/DoctorTour', () => ({ DoctorTour: () => null }));
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const booked = { id: 'r', date: '2026-11-21', slot: '10:30-11:00', doctorName: 'Shravya' };
const seen = { id: 'a', date: '2026-11-21', slot: '10:00-10:30', doctorName: 'Dr. Shravya Rao' };
const earlier = { id: 'e', date: '2026-11-16', slot: '09:00-09:30', doctorName: 'Shravya' };

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); localStorage.clear();
  localStorage.setItem('clinic:visit-draft:d:p:visit-v', JSON.stringify({ version: 1, visitId: 'v', data: { complaints: ['Complaint'], plan: 'Plan', reviewDate: '2026-11-21', completedSections: [] } }));
  (apiClient.get as jest.Mock).mockResolvedValue({ id: 'v', patientId: 'p', complaints: [], history: {}, plan: {}, exam: {} });
  (apiClient.getPatient as jest.Mock).mockResolvedValue({ id: 'p', name: 'Synthetic Patient' });
  (apiClient.getPatientVisitHistory as jest.Mock).mockResolvedValue({ visits: [] });
  (apiClient.getAllPatientVisitHistory as jest.Mock).mockResolvedValue([]);
  (apiClient.getVisits as jest.Mock).mockResolvedValue({ visits: [] });
  (apiClient.updateVisit as jest.Mock).mockResolvedValue({ id: 'v', version: 1 });
});
afterEach(() => { jest.useRealTimers(); });

async function completeWith(reviewAppointment: unknown) {
  (apiClient.completeVisit as jest.Mock).mockResolvedValue({ id: 'v', status: 'COMPLETED', version: 2, reviewAppointment });
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="ADMIN" />);
  await flush();
  fireEvent.click(screen.getByRole('button', { name: 'Record complaint and one medicine' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Complete Visit' })); });
  expect(apiClient.completeVisit).toHaveBeenCalledWith('v', expect.objectContaining({ followUpDate: '2026-11-21' }), expect.anything());
  return mockToast.mock.calls.at(-1)![0];
}

const link = (date: string) => `/dashboard/appointments?date=${date}&doctorId=d&patientId=p`;

it.each([
  ['booked', { status: 'booked', appointment: booked }, 'success', 'Review booked for Sat 21 Nov at 10:30 with Dr. Shravya', null],
  ['moved', { status: 'moved', appointment: booked, previous: { date: '2026-11-16', slot: '09:00-09:30' } }, 'success', 'Review moved to Sat 21 Nov at 10:30 (was Mon 16 Nov 09:00)', null],
  ['existing', { status: 'existing', appointment: booked, date: '2026-11-21' }, 'success', 'Review already booked for Sat 21 Nov at 10:30 with Dr. Shravya', null],
  ['existing after a desk move', { status: 'existing', appointment: { ...booked, date: '2026-11-26', slot: '11:00-11:30' }, date: '2026-11-21' }, 'success', 'Review already booked for Thu 26 Nov at 11:00 with Dr. Shravya (moved at the desk)', null],
  ['already-scheduled', { status: 'already-scheduled', appointment: seen }, 'success', 'Patient already sees Dr. Shravya Rao on Sat 21 Nov at 10:00, so no separate review was booked', null],
  ['already-scheduled with an earlier review kept', { status: 'already-scheduled', appointment: seen, kept: earlier }, 'warning', 'Patient already sees Dr. Shravya Rao on Sat 21 Nov at 10:00, so no separate review was booked. The earlier review on Mon 16 Nov at 09:00 is still booked', link('2026-11-16')],
  ['cancelled-by-staff', { status: 'skipped', reason: 'cancelled-by-staff', date: '2026-11-21' }, 'warning', 'The review on 21 Nov was cancelled at the desk, so it was not booked again', link('2026-11-21')],
  ['missed', { status: 'missed', appointment: { ...earlier, date: '2026-11-22' }, date: '2026-11-21' }, 'warning', 'The patient missed the review on Sun 22 Nov. Book a new one from Appointments', link('2026-11-21')],
  ['done', { status: 'done', appointment: { ...earlier, date: '2026-11-22' } }, 'success', 'The review on Sun 22 Nov has already taken place', null],
  ['in-progress', { status: 'in-progress', appointment: earlier, date: '2026-11-21' }, 'warning', 'The current review is under way, so the new review date was not booked', link('2026-11-21')],
  ['full', { status: 'full', date: '2026-11-21' }, 'warning', 'No free slot on 21 Nov. Book the review from Appointments', link('2026-11-21')],
  ['full with the earlier review kept', { status: 'full', date: '2026-11-21', kept: earlier }, 'warning', 'No free slot on 21 Nov, so the review stays on Mon 16 Nov at 09:00', link('2026-11-21')],
  ['failed', { status: 'failed' }, 'warning', 'The review was not booked. Book it from Appointments for 21 Nov', link('2026-11-21')],
  ['past-date', { status: 'skipped', reason: 'past-date', date: '2026-11-10' }, 'warning', 'The review date has passed, so no appointment was booked', null],
  ['no-review-date', { status: 'skipped', reason: 'no-review-date' }, 'success', 'All documentation has been marked complete.', null],
])('tells the doctor the %s outcome', async (_name, outcome, variant, description, href) => {
  const toast = await completeWith(outcome);
  expect(toast).toMatchObject({ title: 'Visit completed', description, variant });
  if (href) {
    render(toast.action);
    expect(screen.getByRole('link', { name: 'Open Appointments' })).toHaveAttribute('href', href);
  } else {
    expect(toast.action).toBeUndefined();
  }
});
