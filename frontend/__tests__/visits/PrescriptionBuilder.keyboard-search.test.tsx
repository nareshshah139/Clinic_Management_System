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

  it('after the query changes, the previous results cannot be picked before the new ones arrive', async () => {
    get.mockImplementation((url: string, params: { q: string }) => Promise.resolve(url !== '/prescriptions/drugs/autocomplete' ? []
      : params.q === 'azit' ? [{ id: 'azi', name: 'Azithromycin 500', dosageForm: 'TABLET' }]
      : [{ id: 'amox', name: 'Amoxicillin 500', dosageForm: 'CAPSULE' }]));
    const input = await typeMedicine('amox');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([expect.stringContaining('Amoxicillin 500')]);

    fireEvent.change(input, { target: { value: 'azit' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(medicineInputs().map((el) => el.value)).toEqual(['azit', '']);
    expect(screen.queryAllByRole('option')).toEqual([]);
    expect(screen.getByText('Searching…')).toBeInTheDocument();

    await tick();
    fireEvent.keyDown(input, { key: 'Enter' });
    await tick();
    expect(medicineInputs().map((el) => el.value)).toEqual(['Azithromycin 500', '']);
  });

  it('a mouse click on an option still selects it', async () => {
    await typeMedicine('amo');

    fireEvent.click(screen.getAllByRole('option')[1]);
    await tick();

    expect(medicineInputs().map((el) => el.value)).toEqual(['Amoxiclav 625', '']);
  });
});

describe('medicine search list placement', () => {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  afterEach(() => {
    Object.assign(window, { innerWidth: viewport.width, innerHeight: viewport.height });
    jest.restoreAllMocks();
  });

  it('fits a phone screen and follows the input when the page scrolls', async () => {
    Object.assign(window, { innerWidth: 375, innerHeight: 667 });
    let inputTop = 100;
    const box = (left: number, top: number, width: number, height: number) =>
      ({ left, top, width, height, bottom: top + height, right: left + width, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.id === 'rx-row-0-drug' ? box(16, inputTop, 200, 36) : box(0, 0, 0, 0);
    });
    await typeMedicine('amo');
    const list = screen.getByRole('listbox').parentElement!;
    expect(list.style).toMatchObject({ left: '8px', width: '359px', top: '140px', bottom: '', maxHeight: '256px' });

    inputTop = 600;
    fireEvent.scroll(window);

    expect(list.style).toMatchObject({ left: '8px', width: '359px', top: '', bottom: '71px', maxHeight: '256px' });
  });
});
