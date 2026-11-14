import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PatientDetailsPage from '@/app/dashboard/patients/[id]/page';
import { DashboardUserProvider } from '@/components/layout/dashboard-user-context';
import { apiClient } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({ id: 'p1' }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/components/patients/PatientProgressTracker', () => function Tracker() { return null; });
jest.mock('@/components/visits/VisitPhotos', () => function Photos() { return null; });
jest.mock('@/lib/api', () => ({ apiClient: {
  getPatient: jest.fn(),
  getAllPatientVisitHistory: jest.fn(),
  getUsers: jest.fn(),
  getRooms: jest.fn(),
} }));

const api = apiClient as jest.Mocked<typeof apiClient>;
const patient = { id: 'p1', patientCode: 'UX002', name: 'Rohan Kulkarni', gender: 'MALE', age: 38, dob: '1988-07-19T00:00:00.000Z', phone: '9822011102', email: 'rohan@example.test', address: '22 Karve Road', primaryDoctor: { firstName: 'Priya', lastName: 'Menon' } };
const history = [
  { id: 'v2', entryType: 'visit', createdAt: '2026-11-13T05:00:00.000Z', complaints: [{ complaint: 'Follow-up for chemical peel' }], diagnosis: [{ diagnosis: 'Hyperpigmentation' }], plan: { notes: 'Review in 3 weeks.' } },
  { id: 'v1', entryType: 'visit', createdAt: '2026-09-29T05:00:00.000Z', complaints: [{ complaint: 'Acne' }], diagnosis: [{ diagnosis: 'Acne vulgaris' }], prescriptionItems: [{ drugName: 'Adapalene Gel' }, { drugName: 'Cetirizine' }] },
];

function renderAs(role: string) {
  api.getPatient.mockResolvedValue(patient as never);
  api.getAllPatientVisitHistory.mockResolvedValue(history as never);
  api.getUsers.mockResolvedValue({ data: [] } as never);
  api.getRooms.mockResolvedValue({ rooms: [] } as never);
  const user = { id: 'u1', role, firstName: 'A', lastName: 'B', email: 'a@example.test', phone: '1' };
  return render(<DashboardUserProvider value={{ user: user as never, loading: false, refresh: jest.fn(), logout: jest.fn() }}><PatientDetailsPage /></DashboardUserProvider>);
}

const lastVisitPanel = async () => (await screen.findByRole('heading', { name: 'Last visit' })).parentElement as HTMLElement;
const ready = async () => { await within(await lastVisitPanel()).findByText('Hyperpigmentation'); };

describe('patient page', () => {
  it('answers what happened last time on arrival', async () => {
    renderAs('DOCTOR');
    await ready();
    const panel = within(await lastVisitPanel());
    expect(panel.getByText('Follow-up for chemical peel')).toBeInTheDocument();
    expect(panel.getByText('No medicines prescribed')).toBeInTheDocument();
    expect(panel.getByText(/Adapalene Gel, Cetirizine/)).toBeInTheDocument();
    expect(panel.getByText('Review in 3 weeks.')).toBeInTheDocument();
  });

  it('shows the phone, age, gender and email once and no internal id', async () => {
    renderAs('DOCTOR');
    await ready();
    expect(screen.getAllByText('9822011102')).toHaveLength(1);
    expect(screen.getAllByText('rohan@example.test')).toHaveLength(1);
    expect(screen.getAllByText('38 yrs')).toHaveLength(1);
    expect(screen.getAllByText('MALE')).toHaveLength(1);
    expect(screen.queryByText(/^ID:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Info' })).not.toBeInTheDocument();
  });

  it('offers one Book appointment and one Start visit to a doctor', async () => {
    renderAs('DOCTOR');
    await ready();
    expect(screen.getAllByRole('button', { name: 'Start visit' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Book appointment' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Resume last visit|Start new visit/ })).not.toBeInTheDocument();
  });

  it('does not offer Start visit to reception', async () => {
    renderAs('RECEPTION');
    await ready();
    expect(screen.queryByRole('button', { name: 'Start visit' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Book appointment' })).toBeInTheDocument();
  });

  it('opens the edit dialog from the Edit button with the stored phone', async () => {
    const user = userEvent.setup();
    renderAs('RECEPTION');
    await ready();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Edit patient')).toBeInTheDocument();
    expect(await within(dialog).findByLabelText('Phone *')).toHaveValue('9822011102');
  });
});
