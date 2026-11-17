import { UserRole } from '@cms/shared-types';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardUserProvider } from '@/components/layout/dashboard-user-context';
import { VoiceBar } from '@/components/voice/VoiceBar';
import { useVoiceBar, VoiceBarProvider } from '@/components/voice/VoiceBarProvider';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';
import { apiClient } from '@/lib/api';
import type { User } from '@/lib/types';
import { resetVoiceFillStatusForTests, type VoiceBarApplyResult, type VoiceFillFields } from '@/lib/voice-fill';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn(), getPatient: jest.fn().mockResolvedValue({}),
  getClinicAssets: jest.fn().mockResolvedValue([]), getPrinterProfiles: jest.fn().mockResolvedValue([]),
  getAllPatientVisitHistory: jest.fn().mockResolvedValue([]), getPatientVisitHistory: jest.fn().mockResolvedValue({ visits: [] }),
  getPrescriptions: jest.fn().mockResolvedValue({ prescriptions: [] }),
  getPrescriptionTemplates: jest.fn().mockResolvedValue({ templates: [] }),
  getPrescriptionPrintEvents: jest.fn().mockResolvedValue({ totals: {} }),
  autocompletePrescriptionField: jest.fn().mockResolvedValue([]),
} }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

const get = apiClient.get as jest.Mock;
const user = { id: 'u1', role: UserRole.DOCTOR } as User;

let bar: ReturnType<typeof useVoiceBar>;
function Probe() {
  bar = useVoiceBar();
  return null;
}
const registration = () => bar.active!.form.current!;
const applyVoiceFill = async (fields: VoiceFillFields) => registration().apply(fields);
const previewVoiceFill = (fields: VoiceFillFields) => registration().preview(fields);

const renderBuilder = (props: { patientId?: string; visitId?: string | null; doctorId?: string } = {}) => render(
  <DashboardUserProvider value={{ user, loading: false, refresh: async () => {}, logout: async () => {} }}>
    <VoiceBarProvider>
      <Probe />
      <PrescriptionBuilder patientId="voice-rx" visitId={null} doctorId="doctor" {...props} />
      <VoiceBar />
    </VoiceBarProvider>
  </DashboardUserProvider>,
);
const fucibet = { id: 'fucibet', inventoryItemId: 'inv-fucibet', name: 'Fucibet cream', dosageForm: 'CREAM' };
const usual = { duration: 10, durationUnit: 'DAYS', frequency: 'ONCE_DAILY', dosePattern: '0-0-1', timing: 'PM', instructions: 'on the rash' };

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  jest.clearAllMocks();
  resetVoiceFillStatusForTests();
  get.mockImplementation((url: string, params?: { q?: string }) => Promise.resolve(
    url === '/voice-fill/status' ? { available: true }
      : url === '/prescriptions/drugs/autocomplete' ? (params?.q?.toLowerCase().startsWith('fuci') ? [fucibet] : [])
      : url.endsWith('/regimen-defaults') ? { values: usual, source: 'doctor' } : {},
  ));
});
afterEach(() => jest.useRealTimers());

const drugInputs = () => screen.getAllByPlaceholderText('Search medicine name...').map((input) => (input as HTMLInputElement).value);

it('adds spoken medicines before the blank row, keeps spoken values over usual ones, and undo removes them', async () => {
  localStorage.setItem('rxDraft:voice-rx:standalone', JSON.stringify({ items: [
    { drugName: '', dosage: '', dosageUnit: 'TABLET', frequency: '', duration: '', durationUnit: 'DAYS' },
  ] }));
  renderBuilder();
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(drugInputs()).toEqual(['']);

  let result: VoiceBarApplyResult = { filled: [], undo: null };
  await act(async () => {
    result = await applyVoiceFill({
      diagnosis: 'Impetigo',
      prescriptionItems: [
        { drugName: 'fucibet cream', duration: 7, durationUnit: 'DAYS', applicationSite: 'face' },
        { drugName: 'kojic soap', instructions: 'wash face twice daily' },
      ],
    });
  });

  expect(result.filled.map((f) => f.label)).toEqual(['Diagnosis', '2 medicines']);
  expect(drugInputs()).toEqual(['Fucibet cream', 'kojic soap', '']);
  expect((document.getElementById('rx-row-0-drug') as HTMLInputElement).value).toBe('Fucibet cream');
  const durations = screen.getAllByPlaceholderText('#').map((input) => (input as HTMLInputElement).value);
  expect(durations).toEqual(['7', '', '']);
  const instructions = screen.getAllByPlaceholderText('e.g., Avoid alcohol').map((input) => (input as HTMLInputElement).value);
  expect(instructions).toEqual(['on the rash', 'wash face twice daily', '']);
  expect(get.mock.calls.filter(([url]) => url.endsWith('/regimen-defaults')).map(([url]) => url)).toEqual(['/prescriptions/drugs/fucibet/regimen-defaults']);

  const diagnosis = () => (document.getElementById('visit-diagnosis') as HTMLInputElement).value;
  expect(diagnosis()).toBe('Impetigo');
  act(() => result.undo!());
  expect(drugInputs()).toEqual(['']);
  expect(diagnosis()).toBe('');
});

it('links a spoken stocked medicine by its standard name and keeps an unstocked strength visible in the name', async () => {
  const doxy = { id: 'doxy', inventoryItemId: 'inv-doxy-100', name: 'Cap. Doxycycline 100 mg', dosageForm: 'CAPSULE', knownNames: [], totalStock: 40 };
  get.mockImplementation((url: string, params?: { q?: string }) => Promise.resolve(
    url === '/prescriptions/drugs/autocomplete' ? (params?.q === 'doxycycline' ? [doxy] : [])
      : url === '/pharmacy/prescription-queue/inventory-stock/inv-doxy-100' ? { stockStatus: 'IN_STOCK', totalNonExpiredStock: 40 } : {},
  ));
  renderBuilder();
  await act(async () => { jest.advanceTimersByTime(1000); });

  await act(async () => {
    await applyVoiceFill({ prescriptionItems: [
      { drugName: 'doxycycline', dosage: 100, dosageUnit: 'MG', dosePattern: '1-0-1' },
      { drugName: 'telma', dosage: 40, dosageUnit: 'MG' },
    ] });
  });

  expect(drugInputs()).toEqual(['Cap. Doxycycline 100 mg', 'telma 40 mg', '']);
  const doxyCell = (document.getElementById('rx-row-0-drug') as HTMLInputElement).closest('td')!;
  await act(async () => { fireEvent.mouseEnter(doxyCell); });
  expect(doxyCell).toHaveTextContent('Stock: 40');
});

it('shows stock for a spoken medicine that carries only an inventory item, without hovering the row', async () => {
  const acnosis = { id: undefined, inventoryItemId: 'inv-acnosis', name: 'Tab. Acnosis', knownNames: ['199 | Acnosis Tab'], dosageForm: 'TABLET', totalStock: 12 };
  get.mockImplementation((url: string, params?: { q?: string }) => Promise.resolve(
    url === '/prescriptions/drugs/autocomplete' ? (params?.q?.toLowerCase().startsWith('acnosis') ? [acnosis] : [])
      : url === '/pharmacy/prescription-queue/inventory-stock/inv-acnosis' ? { stockStatus: 'IN_STOCK', totalNonExpiredStock: 12 } : {},
  ));
  renderBuilder({ patientId: 'voice-stock' });
  await act(async () => { jest.advanceTimersByTime(1000); });
  await act(async () => { await applyVoiceFill({ prescriptionItems: [{ drugName: 'acnosis' }] }); });
  await act(async () => { jest.advanceTimersByTime(0); });

  const cell = (document.getElementById('rx-row-0-drug') as HTMLInputElement).closest('td')!;
  expect(cell).toHaveTextContent('Stock: 12');
  expect(get.mock.calls.filter(([url]) => url === '/pharmacy/prescription-queue/inventory-stock/inv-acnosis')).toHaveLength(1);
});

const spoken = {
  diagnosis: 'Impetigo',
  prescriptionItems: [
    { drugName: 'fucibet cream', duration: 7, durationUnit: 'DAYS', applicationSite: 'face' },
    { drugName: 'doxycycline', dosage: 100, dosageUnit: 'MG', dosePattern: '1-0-1' },
    { drugName: '  ', duration: 3 },
  ],
};

describe('visit notes registration', () => {
  beforeEach(async () => {
    renderBuilder();
    await act(async () => { jest.advanceTimersByTime(1000); });
  });

  it('registers the visit form with its label and hint', () => {
    expect([registration().form, registration().label, registration().hint]).toEqual(['visit-consultation', 'Visit notes', 'Say or type the visit notes']);
  });

  it('previews every field and each spoken medicine on its own line, skipping a row with no drug name', () => {
    expect(previewVoiceFill(spoken)).toEqual([
      { id: 'diagnosis', label: 'Diagnosis', value: 'Impetigo', fields: { diagnosis: 'Impetigo' } },
      { id: 'prescriptionItems:0', label: 'Medicine 1', value: 'fucibet cream, 7 days', fields: { prescriptionItems: [spoken.prescriptionItems[0]] } },
      { id: 'prescriptionItems:1', label: 'Medicine 2', value: 'doxycycline, 100 mg, 1-0-1', fields: { prescriptionItems: [spoken.prescriptionItems[1]] } },
    ]);
  });

  it('previews the labels apply reports as filled, and previewing changes nothing in the form', async () => {
    const lines = previewVoiceFill({ ...spoken, chiefComplaints: 'Itchy rash' });
    expect(lines.map((line) => line.label)).toEqual(['Chief complaints', 'Diagnosis', 'Medicine 1', 'Medicine 2']);
    const previewedFields = lines.map((line) => line.label).filter((label) => !label.startsWith('Medicine')).sort();
    expect((document.getElementById('visit-diagnosis') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('visit-chief-complaints') as HTMLTextAreaElement).value).toBe('');
    expect(screen.queryAllByPlaceholderText('Search medicine name...')).toEqual([]);
    expect(get.mock.calls.filter(([url]) => url === '/prescriptions/drugs/autocomplete')).toEqual([]);

    let result: VoiceBarApplyResult = { filled: [], undo: null };
    await act(async () => { result = await applyVoiceFill({ ...spoken, chiefComplaints: 'Itchy rash' }); });
    expect(result.filled.map((f) => f.label).sort()).toEqual([...previewedFields, '2 medicines'].sort());
    expect(typeof result.undo).toBe('function');
  });
});

describe('visit notes scope', () => {
  const scopeOf = async (props: Parameters<typeof renderBuilder>[0]) => {
    const view = renderBuilder(props);
    await act(async () => { jest.advanceTimersByTime(1000); });
    const scope = registration().scope;
    view.unmount();
    return scope;
  };

  it('differs between patients, visits and doctors, and is stable for the same ones', async () => {
    const scopes = [
      await scopeOf({ patientId: 'p1', visitId: 'v1', doctorId: 'd1' }),
      await scopeOf({ patientId: 'p1', visitId: 'v1', doctorId: 'd1' }),
      await scopeOf({ patientId: 'p2', visitId: 'v1', doctorId: 'd1' }),
      await scopeOf({ patientId: 'p1', visitId: 'v2', doctorId: 'd1' }),
      await scopeOf({ patientId: 'p1', visitId: null, doctorId: 'd1' }),
      await scopeOf({ patientId: 'p1', visitId: 'v1', doctorId: 'd2' }),
    ];
    expect(scopes).toEqual(['p1:v1:d1', 'p1:v1:d1', 'p2:v1:d1', 'p1:v2:d1', 'p1:standalone:d1', 'p1:v1:d2']);
  });
});

describe('voice bar end to end', () => {
  it('shows the draft, adds only ticked lines to the form, and Undo restores it', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => '',
      json: async () => ({
        transcript: 'Impetigo, itchy rash, fucibet cream for a week.',
        fields: { diagnosis: 'Impetigo', chiefComplaints: 'Itchy rash', prescriptionItems: [{ drugName: 'fucibet cream', duration: 7, durationUnit: 'DAYS' }] },
      }),
    }) as unknown as typeof fetch;
    renderBuilder();
    await act(async () => { jest.advanceTimersByTime(1000); });

    const box = await screen.findByRole('textbox', { name: 'Say or type a request' });
    fireEvent.change(box, { target: { value: 'impetigo itchy rash fucibet cream for a week' } });
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter', code: 'Enter' }); });

    const draft = within(await screen.findByLabelText('Voice bar'));
    const boxes = await draft.findAllByRole('checkbox');
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Chief complaints: Itchy rash', 'Diagnosis: Impetigo', 'Medicine 1: fucibet cream, 7 days',
    ]);
    expect(global.fetch).toHaveBeenCalledWith('/api/voice-fill/visit-consultation/text', expect.objectContaining({ body: '{"text":"impetigo itchy rash fucibet cream for a week"}' }));
    expect((document.getElementById('visit-diagnosis') as HTMLInputElement).value).toBe('');

    fireEvent.click(draft.getByRole('checkbox', { name: 'Chief complaints: Itchy rash' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add to form' })); });

    expect((document.getElementById('visit-diagnosis') as HTMLInputElement).value).toBe('Impetigo');
    expect((document.getElementById('visit-chief-complaints') as HTMLTextAreaElement).value).toBe('');
    expect(drugInputs()).toEqual(['Fucibet cream', '']);
    expect(screen.getByRole('status')).toHaveTextContent('Added to Visit notes: Diagnosis, 1 medicine.');

    await act(async () => { fireEvent.click(within(screen.getByLabelText('Voice bar')).getByRole('button', { name: 'Undo' })); });

    expect((document.getElementById('visit-diagnosis') as HTMLInputElement).value).toBe('');
    expect(screen.queryAllByPlaceholderText('Search medicine name...')).toEqual([]);
  });
});

describe('typing into the form after a voice fill', () => {
  it('stops offering Undo and keeps the hand-typed text in Chief complaints', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => '',
      json: async () => ({ transcript: 'Itchy rash.', fields: { chiefComplaints: 'Itchy rash' } }),
    }) as unknown as typeof fetch;
    renderBuilder();
    await act(async () => { jest.advanceTimersByTime(1000); });

    const box = await screen.findByRole('textbox', { name: 'Say or type a request' });
    fireEvent.change(box, { target: { value: 'itchy rash' } });
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter', code: 'Enter' }); });
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Add to form' })); });

    const complaints = document.getElementById('visit-chief-complaints') as HTMLTextAreaElement;
    expect(complaints.value).toBe('Itchy rash');
    expect(screen.getByRole('status')).toHaveTextContent('Added to Visit notes: Chief complaints.');
    const bar = within(screen.getByRole('region', { name: 'Voice bar' }));
    expect(bar.getByRole('button', { name: 'Undo' })).toBeEnabled();

    const typist = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await typist.type(complaints, ' for two days');

    expect(complaints.value).toBe('Itchy rash for two days');
    expect(bar.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.queryByText(/Added to Visit notes/)).toBeNull();
  });
});
