import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientHistoryTimeline } from '@/components/visits/PatientHistoryTimeline';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  apiClient: { getAllPatientVisitHistory: jest.fn(), getPrescription: jest.fn() },
}));

const history = apiClient.getAllPatientVisitHistory as jest.Mock;
const getRx = apiClient.getPrescription as jest.Mock;

const visits = [
  {
    id: 'v-open',
    entryType: 'visit',
    status: 'IN_PROGRESS',
    createdAt: '2026-11-10T10:00:00Z',
    complaints: [{ complaint: 'Itching' }],
  },
  {
    id: 'v-done',
    entryType: 'visit',
    status: 'COMPLETED',
    createdAt: '2026-10-10T10:00:00Z',
    complaints: [{ complaint: 'Acne' }],
    prescription: { id: 'rx-1' },
  },
];

beforeEach(() => {
  history.mockReset().mockResolvedValue(visits);
  getRx.mockReset().mockResolvedValue({
    id: 'cmrx1internalid',
    prescriptionNumber: 'RX-0001',
    status: 'ACTIVE',
    createdAt: '2026-10-10T10:00:00Z',
    doctor: { id: 'd1', firstName: 'Priya', lastName: 'Menon' },
    patient: { id: 'p1', name: 'Asha Verma' },
    items: [
      { drugName: 'Doxycycline', duration: 14, durationUnit: 'DAYS' },
      { drugName: 'Cetirizine', duration: '2 weeks' },
    ],
  });
});

async function openDialog() {
  const user = userEvent.setup();
  render(<PatientHistoryTimeline patientId="p1" />);
  const buttons = await screen.findAllByRole('button', { name: /show details/i });
  for (const b of buttons) await user.click(b);
  await user.click(await screen.findByRole('button', { name: 'View Prescription' }));
  return screen.findByRole('dialog');
}

it('shows a numeric duration with its unit', async () => {
  const dialog = await openDialog();
  expect(await screen.findByText(/Duration: 14 days/)).toBeInTheDocument();
  expect(dialog).toHaveTextContent('Duration: 2 weeks');
});

it('names the prescribing doctor', async () => {
  const dialog = await openDialog();
  await waitFor(() => expect(dialog).toHaveTextContent('Dr. Priya Menon'));
  expect(dialog).toHaveTextContent('Asha Verma');
});

it('does not show the prescription\'s internal id', async () => {
  const dialog = await openDialog();
  await waitFor(() => expect(dialog).toHaveTextContent('RX-0001'));
  expect(dialog).not.toHaveTextContent('ID:');
  expect(dialog).not.toHaveTextContent('cmrx1internalid');
});

it('labels a completed visit Open visit and an in-progress one Resume session', async () => {
  render(<PatientHistoryTimeline patientId="p1" />);
  expect(await screen.findByRole('button', { name: /open visit/i })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /resume session/i })).toHaveLength(1);
});

it('puts the record count next to the title, before Refresh', async () => {
  render(<PatientHistoryTimeline patientId="p1" />);
  const heading = await screen.findByRole('heading', { name: 'Patient History' });
  const badge = screen.getByText('2 Records');
  const refresh = screen.getByRole('button', { name: 'Refresh' });
  expect(heading.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(badge.compareDocumentPosition(refresh) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('says 1 Record for a single entry', async () => {
  history.mockResolvedValue([visits[0]]);
  render(<PatientHistoryTimeline patientId="p1" />);
  expect(await screen.findByText('1 Record')).toBeInTheDocument();
});
