import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), getPatient: jest.fn(), getPatientVisitHistory: jest.fn(), getAllPatientVisitHistory: jest.fn(), getVisits: jest.fn(), updateVisit: jest.fn(), createVisit: jest.fn(), completeVisit: jest.fn() } }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/components/visits/PrescriptionBuilder', () => function Editor() { return null; });
jest.mock('@/components/visits/VisitPhotos', () => function Photos() { return null; });
const mockStartTour = jest.fn();
const mockTourUnmounted = jest.fn();
jest.mock('@/components/tours', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    DoctorTour: function Tour({ children }: { children: (start: () => void) => React.ReactNode }) {
      useEffect(() => () => mockTourUnmounted(), []);
      return <>{children(mockStartTour)}</>;
    },
  };
});
const flush = async () => { await act(async () => { await Promise.resolve(); }); };

beforeEach(() => {
  jest.clearAllMocks(); localStorage.clear();
  (apiClient.get as jest.Mock).mockResolvedValue({});
  (apiClient.getPatient as jest.Mock).mockResolvedValue({ id: 'cuxpatient-internal-7', patientCode: 'UX004', name: 'Synthetic Patient', phone: '9800000000', allergies: 'Sulfa drugs', medicalHistory: 'Type 2 diabetes' });
  (apiClient.getPatientVisitHistory as jest.Mock).mockResolvedValue({ visits: [] });
  (apiClient.getAllPatientVisitHistory as jest.Mock).mockResolvedValue([]);
  (apiClient.getVisits as jest.Mock).mockResolvedValue({ visits: [] });
});

const renderForm = (userRole: string) => render(
  <MedicalVisitForm patientId="cuxpatient-internal-7" doctorId="d" userRole={userRole}
    identity={<p>Synthetic Patient · 51 · Male</p>} headerActions={<button type="button">Back</button>} />,
);

it('shows a nurse one header row with identity, visit state, consultation type, help and back', async () => {
  renderForm('NURSE');
  await flush();
  expect(screen.getByText('Synthetic Patient · 51 · Male')).toBeInTheDocument();
  expect(screen.getByText('Visit #1')).toBeInTheDocument();
  expect(screen.getByText('Draft')).toBeInTheDocument();
  expect(screen.getByLabelText('Consultation type')).toHaveValue('IN_PERSON');
  expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Overview', 'Vitals', 'Photos', 'History']);
});

it('keeps allergies and history in the patient context and never shows the internal id', async () => {
  renderForm('NURSE');
  await flush();
  expect(await screen.findByText('Sulfa drugs')).toBeInTheDocument();
  expect(screen.getByText('Type 2 diabetes')).toBeInTheDocument();
  expect(screen.getByText('Patient code: UX004')).toBeInTheDocument();
  expect(screen.getByText('Phone: 9800000000')).toBeInTheDocument();
  expect(screen.queryByText(/cuxpatient-internal-7/)).toBeNull();
});

it('opens the quick guide, the visit tour and the shortcuts from the help menu', async () => {
  renderForm('DOCTOR');
  await flush();
  const openHelp = () => fireEvent.keyDown(screen.getByRole('button', { name: 'Help' }), { key: 'Enter' });

  openHelp();
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Quick Guide' }));
  const guide = await screen.findByRole('dialog', { name: 'Visit guide' });
  expect(within(guide).getByText('The visit opens on the Prescription tab')).toBeInTheDocument();
  fireEvent.keyDown(guide, { key: 'Escape' });

  openHelp();
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Visit tour' }));
  await waitFor(() => expect(mockStartTour).toHaveBeenCalledTimes(1));
  expect(mockTourUnmounted).not.toHaveBeenCalled();

  openHelp();
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Shortcuts' }));
  expect(await screen.findByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeInTheDocument();
});
