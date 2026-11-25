import { act, fireEvent, render, screen } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), getPatient: jest.fn(), getPatientVisitHistory: jest.fn(), getAllPatientVisitHistory: jest.fn(), getVisits: jest.fn(), updateVisit: jest.fn(), createVisit: jest.fn(), completeVisit: jest.fn() } }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/components/visits/PrescriptionBuilder', () => function Editor({ vitalsExtra }: any) { return <div>{vitalsExtra}</div>; });
jest.mock('@/components/visits/VisitPhotos', () => function Photos({ readOnly }: any) { return <output data-testid="photos-read-only">{String(Boolean(readOnly))}</output>; });
jest.mock('@/components/tours/DoctorTour', () => ({ DoctorTour: () => null }));
const flush = async () => { await act(async () => { await Promise.resolve(); }); };

const serve = (status: 'COMPLETED' | 'IN_PROGRESS') => {
  (apiClient.get as jest.Mock).mockResolvedValue({ id: 'v', status, version: 2, complaints: [], consultationType: 'TELE_VIDEO', teleVideoConsentById: 'staff', teleVideoConsentAt: '2026-09-27T10:00:00Z' });
  (apiClient.getPatient as jest.Mock).mockResolvedValue({ id: 'p', name: 'Synthetic Patient' });
  (apiClient.getPatientVisitHistory as jest.Mock).mockResolvedValue({ visits: [] });
  (apiClient.getAllPatientVisitHistory as jest.Mock).mockResolvedValue([]);
  (apiClient.getVisits as jest.Mock).mockResolvedValue({ visits: [] });
};
beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); });

it.each([
  ['COMPLETED', false],
  ['IN_PROGRESS', true],
] as const)('a %s visit has editable consultation type, consent and nurse vitals: %s', async (status, editable) => {
  serve(status);
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="NURSE" />); await flush();
  const state = editable ? 'toBeEnabled' : 'toBeDisabled';
  expect(screen.getByLabelText('Consultation type'))[state]();
  expect(screen.getByRole('checkbox', { name: 'Patient consented to tele-video consultation' }))[state]();
  for (const label of ['BP Systolic', 'Heart Rate', 'Temperature', 'Weight', 'Height', 'Resp. Rate', 'Pain Score (0-10)']) {
    expect(screen.getByText(label).parentElement!.querySelector('input'))[state]();
  }
});

it('unlocks the controls after Edit visit on a completed visit', async () => {
  serve('COMPLETED');
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="DOCTOR" />); await flush();
  expect(screen.getByLabelText('Temp (°F)')).toBeDisabled();
  expect(screen.getByLabelText('Consultation type')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Edit visit' }));
  expect(screen.getByLabelText('Temp (°F)')).toBeEnabled();
  expect(screen.getByLabelText('Consultation type')).toBeEnabled();
});

it('hands the photo tab the read-only flag for a completed visit only', async () => {
  serve('COMPLETED');
  const view = render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="NURSE" />); await flush();
  fireEvent.mouseDown(screen.getByRole('tab', { name: /photos/i }), { button: 0 });
  expect(await screen.findByTestId('photos-read-only')).toHaveTextContent('true');
  view.unmount();
  serve('IN_PROGRESS');
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="NURSE" />); await flush();
  fireEvent.mouseDown(screen.getByRole('tab', { name: /photos/i }), { button: 0 });
  expect(await screen.findByTestId('photos-read-only')).toHaveTextContent('false');
});
