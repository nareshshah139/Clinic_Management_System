import { act, fireEvent, render, screen } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';
import { TELE_VIDEO_CONSENT_REQUIRED } from '@/lib/tele-consultation';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), getPatient: jest.fn(), getPatientVisitHistory: jest.fn(), getAllPatientVisitHistory: jest.fn(), getVisits: jest.fn(), updateVisit: jest.fn(), createVisit: jest.fn(), completeVisit: jest.fn() } }));
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@/components/visits/PrescriptionBuilder', () => function Editor({ consultationType, teleVideoConsent }: any) { return <output data-testid="editor-consultation">{consultationType}:{String(teleVideoConsent)}</output>; });
jest.mock('@/components/visits/VisitPhotos', () => function Photos() { return null; });
jest.mock('@/components/tours', () => ({ DoctorTour: () => null }));
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const selectTele = () => fireEvent.change(screen.getByLabelText('Consultation type'), { target: { value: 'TELE_VIDEO' } });
const consent = () => screen.getByRole('checkbox', { name: 'Patient consented to tele-video consultation' });
const save = async () => { await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))); };

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); localStorage.clear();
  (apiClient.get as jest.Mock).mockResolvedValue({ id: 'v', complaints: [], consultationType: 'IN_PERSON' });
  (apiClient.getPatient as jest.Mock).mockResolvedValue({ id: 'p', name: 'Synthetic Patient' });
  (apiClient.getPatientVisitHistory as jest.Mock).mockResolvedValue({ visits: [] });
  (apiClient.getAllPatientVisitHistory as jest.Mock).mockResolvedValue([]);
  (apiClient.getVisits as jest.Mock).mockResolvedValue({ visits: [] });
  (apiClient.updateVisit as jest.Mock).mockResolvedValue({ id: 'v' });
  (apiClient.createVisit as jest.Mock).mockResolvedValue({ id: 'v' });
});
afterEach(() => jest.useRealTimers());

it('defaults to in-person, blocks missing consent, then saves tele-video and switches back', async () => {
  render(<MedicalVisitForm patientId="p" doctorId="d" userRole="ADMIN" />); await flush();
  expect(screen.getByLabelText('Consultation type')).toHaveValue('IN_PERSON');
  expect(screen.queryByRole('checkbox', { name: 'Patient consented to tele-video consultation' })).toBeNull();
  selectTele();
  await save();
  expect(apiClient.createVisit).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: TELE_VIDEO_CONSENT_REQUIRED }));
  fireEvent.click(consent()); await save();
  expect(apiClient.createVisit).toHaveBeenCalledWith(expect.objectContaining({ consultationType: 'TELE_VIDEO', teleVideoConsent: true }), expect.anything());
  expect(screen.getByTestId('editor-consultation')).toHaveTextContent('TELE_VIDEO:true');
  fireEvent.change(screen.getByLabelText('Consultation type'), { target: { value: 'IN_PERSON' } });
  await save();
  expect(apiClient.updateVisit).toHaveBeenLastCalledWith('v', expect.objectContaining({ consultationType: 'IN_PERSON', teleVideoConsent: false }), expect.anything());
  selectTele();
  expect(consent()).not.toBeChecked();
  fireEvent.click(consent()); await save();
  const first = (apiClient.updateVisit as jest.Mock).mock.calls.at(-1)[2].idempotencyKey;
  fireEvent.change(screen.getByLabelText('Consultation type'), { target: { value: 'IN_PERSON' } });
  await save();
  selectTele(); fireEvent.click(consent()); await save();
  expect((apiClient.updateVisit as jest.Mock).mock.calls.at(-1)[2].idempotencyKey).not.toBe(first);
});

it('blocks autosave until consent and restores the choice from the local draft', async () => {
  const view = render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="ADMIN" />); await flush();
  selectTele();
  await act(async () => jest.advanceTimersByTime(8100));
  expect(apiClient.updateVisit).not.toHaveBeenCalled();
  view.unmount();
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="ADMIN" />); await flush();
  expect(screen.getByLabelText('Consultation type')).toHaveValue('TELE_VIDEO');
  expect(consent()).not.toBeChecked();
  fireEvent.click(consent());
  await act(async () => jest.advanceTimersByTime(8100));
  expect(apiClient.updateVisit).toHaveBeenCalledWith('v', expect.objectContaining({ consultationType: 'TELE_VIDEO', teleVideoConsent: true }), expect.anything());
});

it('reopens a saved tele-video visit with its consent checked', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({ id: 'v', complaints: [], consultationType: 'TELE_VIDEO', teleVideoConsentById: 'staff', teleVideoConsentAt: '2026-09-27T10:00:00Z' });
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="ADMIN" />); await flush();
  expect(screen.getByLabelText('Consultation type')).toHaveValue('TELE_VIDEO');
  expect(consent()).toBeChecked();
});
