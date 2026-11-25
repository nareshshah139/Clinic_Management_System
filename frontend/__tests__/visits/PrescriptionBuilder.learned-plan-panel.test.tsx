import { act, render, screen } from '@testing-library/react';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';

jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn().mockResolvedValue([]), getPatient: jest.fn().mockResolvedValue({}),
  getClinicAssets: jest.fn().mockResolvedValue([]), getPrinterProfiles: jest.fn().mockResolvedValue([]),
  getAllPatientVisitHistory: jest.fn().mockResolvedValue([]), getPatientVisitHistory: jest.fn().mockResolvedValue({ visits: [] }),
  getPrescriptionTemplates: jest.fn().mockResolvedValue({ templates: [] }),
  getPrescriptionPrintEvents: jest.fn().mockResolvedValue({ totals: {} }),
  autocompletePrescriptionField: jest.fn().mockResolvedValue([]),
} }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
});
afterEach(() => { jest.useRealTimers(); });

it('shows treatment suggestions as one line when there is no suggestion', async () => {
  render(<PrescriptionBuilder patientId="panel-test" visitId={null} doctorId="doctor" />);
  await act(async () => { jest.advanceTimersByTime(1000); });

  expect(screen.getByRole('region', { name: 'Treatment suggestions' })).toHaveTextContent(
    'Treatment suggestionsEnter a diagnosis to see treatment suggestions.',
  );
  expect(screen.queryByText('meds prefilled')).not.toBeInTheDocument();
  expect(screen.queryByText('matching plans')).not.toBeInTheDocument();
});
