import { act, fireEvent, render, screen } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), getPatient: jest.fn(), getPatientVisitHistory: jest.fn(), getAllPatientVisitHistory: jest.fn(), getVisits: jest.fn(), updateVisit: jest.fn(), createVisit: jest.fn(), completeVisit: jest.fn() } }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/components/visits/VisitPhotos', () => function Photos() { return null; });
jest.mock('@/components/tours/DoctorTour', () => ({ DoctorTour: () => null }));
// Like the real editor: echoes the consultation type, reports the patient's saved personal history once it loads, and restores its own draft.
jest.mock('@/components/visits/PrescriptionBuilder', () => function Editor({ consultationType, teleVideoConsent, onClinicalDataChange }: any) {
  const React = jest.requireActual('react');
  const [personalHistory, setPersonalHistory] = React.useState(undefined);
  const [note, setNote] = React.useState(() => localStorage.getItem('editor-draft-note') ?? undefined);
  React.useEffect(() => { const timer = setTimeout(() => setPersonalHistory('Vegetarian, daily sunscreen'), 50); return () => clearTimeout(timer); }, []);
  React.useEffect(() => {
    onClinicalDataChange({ ...(consultationType ? { consultationType, teleVideoConsent } : {}), history: { personalHistory, pastHistory: note } });
  }, [consultationType, teleVideoConsent, personalHistory, note, onClinicalDataChange]);
  return <input aria-label="Clinical note" onChange={(event: any) => { localStorage.setItem('editor-draft-note', event.target.value); setNote(event.target.value); }} />;
});

const flush = async () => { await act(async () => { jest.advanceTimersByTime(100); await Promise.resolve(); }); };
const leavePrompted = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); localStorage.clear();
  (apiClient.get as jest.Mock).mockResolvedValue({ id: 'v', patientId: 'p', version: 3, status: 'IN_PROGRESS', consultationType: 'IN_PERSON', complaints: [{ complaint: 'Acne on cheeks' }], diagnosis: [{ diagnosis: 'Acne vulgaris' }], history: {}, plan: {}, exam: {} });
  (apiClient.getPatient as jest.Mock).mockResolvedValue({ id: 'p', name: 'Synthetic Patient' });
  (apiClient.getPatientVisitHistory as jest.Mock).mockResolvedValue({ visits: [] });
  (apiClient.getAllPatientVisitHistory as jest.Mock).mockResolvedValue([]);
  (apiClient.getVisits as jest.Mock).mockResolvedValue({ visits: [] });
  (apiClient.updateVisit as jest.Mock).mockResolvedValue({ id: 'v', version: 4, status: 'IN_PROGRESS' });
  (apiClient.createVisit as jest.Mock).mockResolvedValue({ id: 'new-visit', version: 1, status: 'IN_PROGRESS' });
});
afterEach(() => { jest.useRealTimers(); });

it('opens a new visit clean and lets the doctor leave without a prompt', async () => {
  render(<MedicalVisitForm patientId="p" doctorId="d" userRole="ADMIN" />);
  await flush(); await flush();
  expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  expect(leavePrompted()).toBe(false);
});

it('opens a saved visit as saved after the server and editor hydrate it', async () => {
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="ADMIN" />);
  await flush(); await flush();
  expect(screen.getByRole('status')).toHaveTextContent('Saved');
  expect(leavePrompted()).toBe(false);
  await act(async () => { jest.advanceTimersByTime(20000); });
  expect(apiClient.updateVisit).not.toHaveBeenCalled();
});

it('marks one typed character unsaved, guards leaving, and clears after saving', async () => {
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="ADMIN" />);
  await flush(); await flush();
  fireEvent.change(screen.getByLabelText('Clinical note'), { target: { value: 'x' } });
  await flush();
  expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
  expect(leavePrompted()).toBe(true);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })); });
  expect(apiClient.updateVisit).toHaveBeenCalledWith('v', expect.objectContaining({ history: { personalHistory: 'Vegetarian, daily sunscreen', pastHistory: 'x' } }), expect.anything());
  expect(screen.getByRole('status')).toHaveTextContent(/^Saved/);
  expect(leavePrompted()).toBe(false);
});

it('reopens a visit saved in this browser as saved', async () => {
  const first = render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="ADMIN" />);
  await flush(); await flush();
  fireEvent.change(screen.getByLabelText('Clinical note'), { target: { value: 'Saved note' } });
  await flush();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })); });
  first.unmount();
  (apiClient.get as jest.Mock).mockResolvedValue({ id: 'v', patientId: 'p', version: 4, status: 'IN_PROGRESS', consultationType: 'IN_PERSON', complaints: [], history: { pastHistory: 'Saved note' }, plan: {}, exam: {} });
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="ADMIN" />);
  await flush(); await flush();
  expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  expect(leavePrompted()).toBe(false);
});
