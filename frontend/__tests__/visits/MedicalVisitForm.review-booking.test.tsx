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

it('says the review was booked, with day, time and doctor', async () => {
  const toast = await completeWith({ status: 'booked', appointment: booked });
  expect(toast).toMatchObject({ title: 'Visit completed', description: 'Review booked for Sat 21 Nov at 10:30 with Dr. Shravya', variant: 'success' });
  expect(toast.action).toBeUndefined();
});

it('says the review was already booked', async () => {
  const toast = await completeWith({ status: 'existing', appointment: booked });
  expect(toast.description).toBe('Review already booked for Sat 21 Nov at 10:30 with Dr. Shravya');
});

it('says there is no free slot and links to Appointments on that day for the patient', async () => {
  const toast = await completeWith({ status: 'full', date: '2026-11-21' });
  expect(toast).toMatchObject({ description: 'No free slot on 21 Nov. Book the review from Appointments', variant: 'warning' });
  render(toast.action);
  expect(screen.getByRole('link', { name: 'Open Appointments' })).toHaveAttribute('href', '/dashboard/appointments?date=2026-11-21&doctorId=d&patientId=p');
});

it('says the review was not booked after a failure and gives the same link', async () => {
  const toast = await completeWith({ status: 'failed' });
  expect(toast.description).toBe('The review was not booked. Book it from Appointments for 21 Nov');
  render(toast.action);
  expect(screen.getByRole('link', { name: 'Open Appointments' })).toHaveAttribute('href', expect.stringContaining('date=2026-11-21'));
});

it('keeps the plain completion message when the server skipped booking', async () => {
  const toast = await completeWith({ status: 'skipped', reason: 'past-date' });
  expect(toast.description).toBe('All documentation has been marked complete.');
});
