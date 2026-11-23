import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';

jest.setTimeout(60_000);

const mockPdfPages: string[] = [];
jest.mock('@/lib/pdf-export', () => ({
  waitForSignatureImages: async () => undefined,
  renderPrescriptionPages: async (wrapper: HTMLElement) => {
    mockPdfPages.push(wrapper.textContent || '');
    return new Blob(['pdf']);
  },
}));
jest.mock('pagedjs', () => ({
  Previewer: class {
    async preview(content: string, _css: unknown, container: HTMLElement) {
      container.innerHTML = `<div class="pagedjs_page"><div class="pagedjs_page_content">${content}</div></div>`;
      return { pages: 1 };
    }
  },
}));

const medicine = { drugName: 'Doxycycline 100', dosage: 1, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: 30, durationUnit: 'DAYS' };

function clinicServer(status: 'COMPLETED' | 'IN_PROGRESS') {
  const calls: string[] = [];
  const reply = (code: number, body: unknown) => ({ ok: code < 400, status: code, headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) }, json: async () => body, text: async () => JSON.stringify(body) });
  const visit = {
    id: 'v1', version: 4, status, patientId: 'p', doctorId: 'd',
    patient: { id: 'p', name: 'Synthetic Patient', phone: '+91 90000 00000', email: 'patient@example.test' },
    doctor: { id: 'd', firstName: 'Priya', lastName: 'Menon' },
    complaints: [{ complaint: 'Acne' }], diagnosis: [{ diagnosis: 'Acne vulgaris' }], history: {}, exam: {},
    plan: { dermatology: { medicationPlan: [medicine] } },
    prescription: { id: 'rx1', items: [medicine] },
  };
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method || 'GET').toUpperCase();
    if (method === 'GET') return url === '/api/visits/v1' ? reply(200, visit) : reply(200, []);
    if (url === '/api/prescriptions/interactions/preview') return reply(200, { interactions: [] });
    calls.push(`${method} ${url}`);
    if (url === '/api/visits/v1') return reply(200, { ...visit, version: visit.version + 1 });
    if (url === '/api/prescriptions/rx1') return reply(200, { id: 'rx1' });
    return reply(201, {});
  }) as unknown as typeof fetch;
  return calls;
}

const opened: string[] = [];
const downloads: string[] = [];
let printed: string[] = [];
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mockPdfPages.length = 0;
  opened.length = 0;
  downloads.length = 0;
  printed = [];
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, left: 0, bottom: 900, right: 1200, width: 1200, height: 900, toJSON: () => ({}) });
  jest.spyOn(window, 'print').mockImplementation(() => { printed.push(document.getElementById('prescription-print-host')?.textContent || ''); });
  jest.spyOn(window, 'open').mockImplementation((url) => { opened.push(String(url)); return null; });
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
  URL.createObjectURL = () => 'blob:prescription';
  URL.revokeObjectURL = () => {};
});
afterEach(() => jest.restoreAllMocks());

async function openSavedPrescriptionPreview() {
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v1" userRole="DOCTOR" />);
  await screen.findByDisplayValue(medicine.drugName, {}, { timeout: 20_000 });
  fireEvent.click(screen.getByRole('button', { name: 'Print Preview' }));
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(document.querySelector('#pagedjs-container .pagedjs_page')).toHaveTextContent(medicine.drugName), { timeout: 20_000 });
  return dialog;
}

const press = async (dialog: HTMLElement, name: string) => {
  const button = within(dialog).getByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled(), { timeout: 10_000 });
  await act(async () => { fireEvent.click(button); });
};

it('prints, downloads, emails and sends by WhatsApp the saved prescription of a locked completed visit without writing to it', async () => {
  const calls = clinicServer('COMPLETED');
  const dialog = await openSavedPrescriptionPreview();

  await press(dialog, 'Print');
  await waitFor(() => expect(printed).toHaveLength(1), { timeout: 10_000 });
  expect(printed[0]).toContain(medicine.drugName);
  act(() => { window.dispatchEvent(new Event('afterprint')); });

  await press(dialog, 'Download PDF');
  await waitFor(() => expect(downloads).toEqual(['prescription-rx1.pdf']), { timeout: 10_000 });

  await press(dialog, 'PDF via WhatsApp');
  await waitFor(() => expect(opened).toEqual(['https://wa.me/919000000000?text=Hi%2C%20please%20find%20your%20prescription%20attached.']), { timeout: 10_000 });

  await press(dialog, 'Email');
  await waitFor(() => expect(calls).toContain('POST /api/prescriptions/rx1/share-preview'), { timeout: 10_000 });

  expect(mockPdfPages).toHaveLength(3);
  mockPdfPages.forEach((page) => expect(page).toContain(medicine.drugName));
  expect(calls).toEqual([
    'POST /api/prescriptions/rx1/print-events',
    'POST /api/prescriptions/rx1/print-events',
    'POST /api/prescriptions/rx1/share-preview',
  ]);
});

it('offers no prescription editing on a locked completed visit', async () => {
  clinicServer('COMPLETED');
  const dialog = await openSavedPrescriptionPreview();
  expect(within(dialog).queryByRole('button', { name: 'Save Prescription' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Create Prescription', hidden: true })).toBeNull();
  expect(screen.getByDisplayValue(medicine.drugName)).toBeDisabled();
});

it('unlocks prescription editing on a completed visit after Edit visit', async () => {
  clinicServer('COMPLETED');
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v1" userRole="DOCTOR" />);
  expect(await screen.findByDisplayValue(medicine.drugName, {}, { timeout: 20_000 })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Edit visit' }));
  expect(screen.getByDisplayValue(medicine.drugName)).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Create Prescription', hidden: true })).toBeEnabled();
});

it('still saves the visit and the prescription before printing an open visit', async () => {
  const calls = clinicServer('IN_PROGRESS');
  const dialog = await openSavedPrescriptionPreview();
  await press(dialog, 'Print');
  await waitFor(() => expect(printed).toHaveLength(1), { timeout: 10_000 });
  expect(printed[0]).toContain(medicine.drugName);
  expect(calls).toEqual(['PATCH /api/visits/v1', 'PATCH /api/prescriptions/rx1']);
  expect(within(dialog).getByRole('button', { name: 'Save Prescription' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Create Prescription', hidden: true })).toBeEnabled();
  expect(screen.getByDisplayValue(medicine.drugName)).toBeEnabled();
});
