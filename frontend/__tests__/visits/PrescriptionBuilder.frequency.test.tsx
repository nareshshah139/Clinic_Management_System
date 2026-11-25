import { act, fireEvent, render, screen } from '@testing-library/react';
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

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

async function wait(ms: number) { await act(async () => { jest.advanceTimersByTime(ms); }); }
const row = (drugName: string) => ({ drugName, dosage: '', dosageUnit: 'TABLET', frequency: '', timing: '', duration: 7, durationUnit: 'DAYS' });

async function mount(...names: string[]) {
  localStorage.setItem('rxDraft:frequency-test:standalone', JSON.stringify({ items: names.map(row) }));
  render(<PrescriptionBuilder patientId="frequency-test" visitId={null} doctorId="doctor" />);
  await wait(1000);
}
async function pick(trigger: string, option: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: trigger }), { key: 'ArrowDown' });
  await wait(50);
  fireEvent.click(screen.getByRole('option', { name: option }));
  await wait(50);
}

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
});
afterEach(() => { jest.useRealTimers(); });

describe('prescription frequency shortcuts', () => {
  it('the HS preset sets once daily at bedtime', async () => {
    await mount('Cetirizine 10');
    fireEvent.focus(screen.getAllByPlaceholderText('Search medicine name...')[0]);

    fireEvent.click(screen.getByRole('button', { name: 'HS' }));

    expect(screen.getByRole('combobox', { name: 'Frequency for Cetirizine 10' })).toHaveTextContent('Once daily');
    expect(screen.getByRole('combobox', { name: 'When for Cetirizine 10' })).toHaveTextContent('HS');
  });

  it('single-dose patterns fill in morning or night', async () => {
    await mount('Cetirizine 10', 'Montelukast 10');

    await pick('Frequency for Cetirizine 10', '1-0-0');
    await pick('Frequency for Montelukast 10', '0-0-1');

    expect(screen.getByRole('combobox', { name: 'When for Cetirizine 10' })).toHaveTextContent('AM');
    expect(screen.getByRole('combobox', { name: 'When for Montelukast 10' })).toHaveTextContent('PM');
  });

  it('offers weekly and monthly frequencies', async () => {
    await mount('Fluconazole 150', 'Vitamin D3 60000');

    await pick('Frequency for Fluconazole 150', 'Weekly');
    await pick('Frequency for Vitamin D3 60000', 'Monthly');

    expect(screen.getByRole('combobox', { name: 'Frequency for Fluconazole 150' })).toHaveTextContent('Weekly');
    expect(screen.getByRole('combobox', { name: 'Frequency for Vitamin D3 60000' })).toHaveTextContent('Monthly');
  });
});
