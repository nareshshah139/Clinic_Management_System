import { act, fireEvent, render, screen } from '@testing-library/react';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn(), getPatient: jest.fn().mockResolvedValue({}),
  getClinicAssets: jest.fn().mockResolvedValue([]), getPrinterProfiles: jest.fn().mockResolvedValue([]),
  getAllPatientVisitHistory: jest.fn().mockResolvedValue([]), getPatientVisitHistory: jest.fn().mockResolvedValue({ visits: [] }),
  getPrescriptionTemplates: jest.fn().mockResolvedValue({ templates: [] }),
  getPrescriptionPrintEvents: jest.fn().mockResolvedValue({ totals: {} }),
  autocompletePrescriptionField: jest.fn().mockResolvedValue([]),
} }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
const get = apiClient.get as jest.Mock;

async function tick(ms = 300) { await act(async () => { jest.advanceTimersByTime(ms); }); }
const medicineInputs = () => screen.getAllByPlaceholderText('Search medicine name...') as HTMLInputElement[];

async function typeMedicine(query: string) {
  localStorage.setItem('rxDraft:keyboard-test:standalone', JSON.stringify({ items: [{ drugName: '', dosage: '', frequency: 'ONCE_DAILY', duration: 7, durationUnit: 'DAYS' }] }));
  render(<PrescriptionBuilder patientId="keyboard-test" visitId={null} doctorId="doctor" />);
  await tick(1000);
  const input = medicineInputs()[0];
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: query } });
  await tick();
  return input;
}

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  jest.clearAllMocks();
  get.mockImplementation((url: string) => Promise.resolve(url === '/prescriptions/drugs/autocomplete'
    ? [{ id: 'amox', name: 'Amoxicillin 500', dosageForm: 'CAPSULE' }, { id: 'clav', name: 'Amoxiclav 625', dosageForm: 'TABLET' }]
    : []));
});
afterEach(() => { jest.useRealTimers(); });

describe('medicine search keyboard', () => {
  it('ArrowDown then Enter puts the highlighted medicine in the row instead of adding a row', async () => {
    const input = await typeMedicine('amo');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const active = document.getElementById(input.getAttribute('aria-activedescendant') || '');
    expect(active).toHaveTextContent('Amoxicillin 500');
    fireEvent.keyDown(input, { key: 'Enter' });
    await tick();

    expect(medicineInputs().map((el) => el.value)).toEqual(['Amoxicillin 500', '']);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('arrow keys wrap through the options and Enter takes the one shown as active', async () => {
    const input = await typeMedicine('amo');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Amoxiclav 625');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Amoxiclav 625');
    fireEvent.keyDown(input, { key: 'Enter' });
    await tick();

    expect(medicineInputs().map((el) => el.value)).toEqual(['Amoxiclav 625', '']);
  });

  it('Enter with no highlighted option takes the best match', async () => {
    const input = await typeMedicine('amo');

    fireEvent.keyDown(input, { key: 'Enter' });
    await tick();

    expect(medicineInputs().map((el) => el.value)).toEqual(['Amoxicillin 500', '']);
  });

  it('Escape closes the list and keeps the typed text, then Enter moves to the next row', async () => {
    const input = await typeMedicine('Custom compound');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(input, { key: 'Enter' });
    await tick(50);

    expect(medicineInputs().map((el) => el.value)).toEqual(['Custom compound', '']);
    expect(document.activeElement).toBe(medicineInputs()[1]);
  });

  it('a mouse click on an option still selects it', async () => {
    await typeMedicine('amo');

    fireEvent.click(screen.getAllByRole('option')[1]);
    await tick();

    expect(medicineInputs().map((el) => el.value)).toEqual(['Amoxiclav 625', '']);
  });
});
