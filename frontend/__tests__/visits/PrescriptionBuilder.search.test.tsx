import { act, fireEvent, render, screen } from '@testing-library/react';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn(), getPatient: jest.fn().mockResolvedValue({}),
  getClinicAssets: jest.fn().mockResolvedValue([]), getPrinterProfiles: jest.fn().mockResolvedValue([]),
  getAllPatientVisitHistory: jest.fn().mockResolvedValue([]), getPatientVisitHistory: jest.fn().mockResolvedValue({ visits: [] }),
  getPrescriptionTemplates: jest.fn().mockResolvedValue({ templates: [{ id: 'tpl', name: 'Test template', items: [] }] }),
  getPrescriptionPrintEvents: jest.fn().mockResolvedValue({ totals: {} }),
  autocompletePrescriptionField: jest.fn().mockResolvedValue([]),
} }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
const get = apiClient.get as jest.Mock;
const pending = () => {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const medicineText = (name: string) => (_: string, element: Element | null) => element?.classList.contains('font-medium') === true && element.textContent === name;
const drug = (name: string) => ({ id: name, name, dosageForm: 'CREAM' });
async function tick(ms = 300) { await act(async () => { jest.advanceTimersByTime(ms); }); }
async function mount(template = false) {
  localStorage.setItem('rxDraft:search-test:standalone', JSON.stringify({ items: [{ drugName: '', dosage: '', frequency: 'ONCE_DAILY', duration: 7, durationUnit: 'DAYS' }] }));
  render(<PrescriptionBuilder patientId="search-test" visitId={null} doctorId="doctor" />);
  await tick(1000);
  if (template) {
    fireEvent.click(screen.getByRole('button', { name: 'New template' }));
    return screen.getByPlaceholderText('Search drug name or brand (min 2 chars)');
  }
  const input = screen.getByPlaceholderText('Search medicine name...');
  fireEvent.focus(input);
  return input;
}
beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  jest.clearAllMocks();
  get.mockResolvedValue([]);
});
afterEach(() => { jest.useRealTimers(); });

describe.each([false, true])('prescription medicine search (template=%s)', template => {
  it('retains the latest results when an older query finishes later', async () => {
    const old = pending();
    get.mockImplementation((url, params) => url === '/prescriptions/drugs/autocomplete'
      ? params.q === 'old' ? old.promise : Promise.resolve([drug('Latest medicine')])
      : Promise.resolve([]));
    const input = await mount(template);
    fireEvent.change(input, { target: { value: 'old' } });
    await tick();
    fireEvent.change(input, { target: { value: 'latest' } });
    await tick();
    expect(screen.getByText(medicineText('Latest medicine'))).toBeInTheDocument();
    await act(async () => old.resolve([drug('Stale medicine')]));
    expect(screen.getByText(medicineText('Latest medicine'))).toBeInTheDocument();
    expect(screen.queryByText(medicineText('Stale medicine'))).not.toBeInTheDocument();
  });

  it('does not let an old failure clear a newer result or trigger a fallback', async () => {
    const old = pending();
    get.mockImplementation((url, params) => url === '/prescriptions/drugs/autocomplete'
      ? params.q === 'old' ? old.promise : Promise.resolve([drug('Latest medicine')])
      : Promise.resolve([]));
    const input = await mount(template);
    fireEvent.change(input, { target: { value: 'old' } });
    await tick();
    fireEvent.change(input, { target: { value: 'latest' } });
    await tick();
    await act(async () => old.reject(new Error('offline')));
    expect(screen.getByText(medicineText('Latest medicine'))).toBeInTheDocument();
    expect(get.mock.calls.some(([url]) => url === '/drugs/autocomplete')).toBe(false);
  });

  it('uses one request for an empty result', async () => {
    const input = await mount(template);
    fireEvent.change(input, { target: { value: 'missing' } });
    await tick();
    expect(get.mock.calls.filter(([url]) => url.includes('/autocomplete'))).toEqual([
      ['/prescriptions/drugs/autocomplete', { q: 'missing', limit: 30 }],
    ]);
  });

  it('preserves server ranking instead of re-sorting suggestions', async () => {
    get.mockImplementation((url) => Promise.resolve(url === '/prescriptions/drugs/autocomplete'
      ? [drug('Reviewed alias medicine'), drug('Query cream')] : []));
    const input = await mount(template);
    fireEvent.change(input, { target: { value: 'Query' } });
    await tick();
    const first = screen.getByText('Reviewed alias medicine');
    const second = screen.getByText(medicineText('Query cream'));
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('clears results immediately when the query is shortened and ignores pending results', async () => {
    const old = pending();
    get.mockImplementation((url) => url === '/prescriptions/drugs/autocomplete' ? old.promise : Promise.resolve([]));
    const input = await mount(template);
    fireEvent.change(input, { target: { value: 'old' } });
    await tick();
    fireEvent.change(input, { target: { value: 'o' } });
    await act(async () => old.resolve([drug('Stale medicine')]));
    expect(screen.queryByText(medicineText('Stale medicine'))).not.toBeInTheDocument();
  });
});
