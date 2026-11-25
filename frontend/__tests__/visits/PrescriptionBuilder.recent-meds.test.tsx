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

async function wait(ms: number) { await act(async () => { jest.advanceTimersByTime(ms); }); }
const row = (drugName: string) => ({ drugName, dosage: '', dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: 7, durationUnit: 'DAYS' });
const medicineInputs = () => screen.queryAllByPlaceholderText('Search medicine name...') as HTMLInputElement[];
const medicineNames = () => medicineInputs().map((el) => el.value);

async function mount(items: object[]) {
  localStorage.setItem('rx_recent:drugNames', JSON.stringify(['Azithromycin 500']));
  localStorage.setItem('rxDraft:recent-test:standalone', JSON.stringify({ items }));
  render(<PrescriptionBuilder patientId="recent-test" visitId={null} doctorId="doctor" />);
  await wait(1000);
}
const clickRecent = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Azithromycin 500' }));
  await wait(100);
};

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
});
afterEach(() => { jest.useRealTimers(); });

describe('recent medicine chips', () => {
  it('adds the medicine when the prescription has no rows', async () => {
    await mount([]);
    expect(medicineInputs()).toHaveLength(0);

    await clickRecent();

    expect(medicineNames()).toEqual(['Azithromycin 500', '']);
  });

  it('adds a row instead of overwriting the filled row being edited', async () => {
    await mount([row('Cetirizine 10')]);
    fireEvent.focus(medicineInputs()[0]);

    await clickRecent();

    expect(medicineNames()).toEqual(['Cetirizine 10', 'Azithromycin 500', '']);
  });

  it('fills the blank row being edited', async () => {
    await mount([row('Cetirizine 10'), row(''), row('Doxycycline 100')]);
    fireEvent.focus(medicineInputs()[1]);

    await clickRecent();

    expect(medicineNames()).toEqual(['Cetirizine 10', 'Azithromycin 500', 'Doxycycline 100', '']);
  });
});
