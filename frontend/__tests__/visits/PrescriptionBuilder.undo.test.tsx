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
const row = (drugName: string, duration: number) => ({ drugName, dosage: '', dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration, durationUnit: 'DAYS' });
const medicineNames = () => (screen.getAllByPlaceholderText('Search medicine name...') as HTMLInputElement[]).map((el) => el.value);
const duration = (name: string) => screen.getByLabelText(`Duration for ${name}`) as HTMLInputElement;

async function mount(items: object[]) {
  localStorage.setItem('rxDraft:undo-test:standalone', JSON.stringify({ items }));
  render(<PrescriptionBuilder patientId="undo-test" visitId={null} doctorId="doctor" />);
  await wait(1000);
}

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
});
afterEach(() => { jest.useRealTimers(); });

describe('prescription undo and redo', () => {
  it('undoes a burst of keystrokes in one step and redoes it', async () => {
    await mount([row('Cetirizine 10', 7)]);

    fireEvent.change(duration('Cetirizine 10'), { target: { value: '1' } });
    await wait(200);
    fireEvent.change(duration('Cetirizine 10'), { target: { value: '14' } });
    await wait(2000);
    fireEvent.change(duration('Cetirizine 10'), { target: { value: '21' } });

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(duration('Cetirizine 10').value).toBe('14');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(duration('Cetirizine 10').value).toBe('7');
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(duration('Cetirizine 10').value).toBe('14');
  });

  it('brings back a deleted row', async () => {
    await mount([row('Cetirizine 10', 7), row('Doxycycline 100', 14)]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Cetirizine 10' }));
    expect(medicineNames()).not.toContain('Cetirizine 10');

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(medicineNames().slice(0, 2)).toEqual(['Cetirizine 10', 'Doxycycline 100']);
    expect(duration('Doxycycline 100').value).toBe('14');
  });

  it('typing a medicine name and undoing restores the previous name', async () => {
    await mount([row('Cetirizine 10', 7)]);
    const input = screen.getAllByPlaceholderText('Search medicine name...')[0];

    fireEvent.change(input, { target: { value: 'Cetirizine 1' } });
    fireEvent.change(input, { target: { value: 'Cetirizine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(medicineNames()[0]).toBe('Cetirizine 10');
  });
});
