import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { Toaster } from '@/components/ui/toaster';

// The real visit form and prescription builder, with fetch stubbed as a stateful API that keeps
// the prescription record the pharmacy reads. Like VisitsService.update, it refuses every
// clinical write to a completed visit. Paged.js and the canvas PDF renderer cannot lay out pages
// in jsdom, so they stand in as leaf renderers that keep the page text.

jest.setTimeout(60_000);

jest.mock('@/lib/pdf-export', () => ({
  waitForSignatureImages: async () => undefined,
  renderPrescriptionPages: async () => new Blob(['pdf']),
}));
jest.mock('pagedjs', () => ({
  Previewer: class {
    async preview(content: string, _css: unknown, container: HTMLElement) {
      container.innerHTML = `<div class="pagedjs_page"><div class="pagedjs_page_content">${content}</div></div>`;
      return { pages: 1 };
    }
  },
}));

const doxycycline = { drugName: 'Doxycycline 100', dosage: 1, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: 30, durationUnit: 'DAYS' };
const MINOCYCLINE = 'Minocycline 50';
const COMPLETED_REFUSAL = 'This visit is completed, so its notes can no longer be changed.';

function clinicServer(initialStatus: 'COMPLETED' | 'IN_PROGRESS', { prescriptionRefusal = '', saved = true } = {}) {
  const server = { status: initialStatus, version: 4, saved, record: [doxycycline] as Array<{ drugName: string }>, writes: [] as string[] };
  const reply = (code: number, body: unknown) => ({ ok: code < 400, status: code, headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) }, json: async () => body, text: async () => JSON.stringify(body) });
  const visit = () => ({
    id: 'v1', version: server.version, status: server.status, patientId: 'p', doctorId: 'd',
    patient: { id: 'p', name: 'Synthetic Patient', phone: '+91 90000 00000' },
    doctor: { id: 'd', firstName: 'Priya', lastName: 'Menon' },
    complaints: [{ complaint: 'Acne' }], diagnosis: [{ diagnosis: 'Acne vulgaris' }], history: {}, exam: {},
    plan: { dermatology: { medicationPlan: server.record } },
    prescription: server.saved ? { id: 'rx1', items: server.record } : null,
  });
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method || 'GET').toUpperCase();
    if (method === 'GET') return url === '/api/visits/v1' ? reply(200, visit()) : reply(200, []);
    if (url === '/api/prescriptions/interactions/preview') return reply(200, { interactions: [] });
    server.writes.push(`${method} ${url}`);
    const clinicalWrite = url === '/api/visits/v1' || url === '/api/prescriptions' || url === '/api/prescriptions/rx1' || url === '/api/visits/v1/complete';
    if (clinicalWrite && server.status === 'COMPLETED') return reply(400, { message: COMPLETED_REFUSAL });
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url === '/api/visits/v1') { server.version += 1; return reply(200, visit()); }
    if (url === '/api/prescriptions/rx1' || url === '/api/prescriptions') {
      if (prescriptionRefusal) return reply(409, { message: prescriptionRefusal });
      server.saved = true;
      server.record = body.items;
      server.version += 1;
      return reply(200, { id: 'rx1', items: server.record, visit: visit() });
    }
    if (url === '/api/visits/v1/complete') { server.status = 'COMPLETED'; server.version += 1; return reply(200, visit()); }
    return reply(201, {});
  }) as unknown as typeof fetch;
  return server;
}

let printed: string[] = [];
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  printed = [];
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, left: 0, bottom: 900, right: 1200, width: 1200, height: 900, toJSON: () => ({}) });
  jest.spyOn(window, 'print').mockImplementation(() => { printed.push(document.getElementById('prescription-print-host')?.textContent || ''); });
  URL.createObjectURL = () => 'blob:prescription';
  URL.revokeObjectURL = () => {};
});
afterEach(() => jest.restoreAllMocks());

async function printPrescription() {
  fireEvent.click(screen.getByRole('button', { name: 'Print Preview' }));
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(document.querySelector('#pagedjs-container .pagedjs_page')).not.toBeNull(), { timeout: 20_000 });
  const print = within(dialog).getByRole('button', { name: 'Print' });
  await waitFor(() => expect(print).toBeEnabled(), { timeout: 10_000 });
  await act(async () => { fireEvent.click(print); });
  await waitFor(() => expect(printed).toHaveLength(1), { timeout: 10_000 });
  return printed[0];
}

it('completing a visit saves a changed medicine into the prescription record, and the printout matches the record', async () => {
  const server = clinicServer('IN_PROGRESS');
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v1" userRole="DOCTOR" />);
  await screen.findByDisplayValue(doxycycline.drugName, {}, { timeout: 20_000 });

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create Prescription' })); });
  await waitFor(() => expect(server.writes).toContain('PATCH /api/prescriptions/rx1'), { timeout: 10_000 });
  fireEvent.click(await screen.findByRole('button', { name: 'Stay Here' }));

  fireEvent.change(screen.getByDisplayValue(doxycycline.drugName), { target: { value: MINOCYCLINE } });
  await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Complete Visit' })[0]); });
  await waitFor(() => expect(server.status).toBe('COMPLETED'), { timeout: 10_000 });

  const page = await printPrescription();
  expect(server.record.map((item) => item.drugName)).toEqual([MINOCYCLINE]);
  expect(page).toContain(MINOCYCLINE);
  expect(page).not.toContain(doxycycline.drugName);
});

it('prints the saved prescription record of a completed visit, not a stale local draft', async () => {
  const server = clinicServer('COMPLETED');
  localStorage.setItem('rxDraft:p:v1', JSON.stringify({
    dosageSchemaVersion: 1,
    dirtyClinicalFields: ['items'],
    items: [{ ...doxycycline, drugName: MINOCYCLINE, instructions: '', route: '', notes: '', timing: '', dosePattern: '', quantity: '' }],
  }));
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v1" userRole="DOCTOR" />);
  await screen.findByDisplayValue('Acne vulgaris', {}, { timeout: 20_000 });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Create Prescription', hidden: true })).toBeNull(), { timeout: 20_000 });

  const page = await printPrescription();
  expect(server.record.map((item) => item.drugName)).toEqual([doxycycline.drugName]);
  expect(page).toContain(doxycycline.drugName);
  expect(page).not.toContain(MINOCYCLINE);
});

const completeVisit = async () => {
  await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Complete Visit' })[0]); });
};

it('completes a visit without writing a prescription whose medicines are unchanged', async () => {
  const server = clinicServer('IN_PROGRESS');
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v1" userRole="DOCTOR" />);
  await screen.findByDisplayValue(doxycycline.drugName, {}, { timeout: 20_000 });
  await completeVisit();
  await waitFor(() => expect(server.status).toBe('COMPLETED'), { timeout: 10_000 });
  expect(server.writes).toEqual(['PATCH /api/visits/v1', 'POST /api/visits/v1/complete']);
});

it('leaves the visit open and says why when the changed prescription cannot be saved', async () => {
  const INVOICED = 'This prescription has a pharmacy invoice and its medicines cannot be changed. Start a new visit for a new prescription.';
  const server = clinicServer('IN_PROGRESS', { prescriptionRefusal: INVOICED });
  render(<><MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v1" userRole="DOCTOR" /><Toaster /></>);
  fireEvent.change(await screen.findByDisplayValue(doxycycline.drugName, {}, { timeout: 20_000 }), { target: { value: MINOCYCLINE } });
  await completeVisit();
  expect(await screen.findByText(INVOICED, {}, { timeout: 10_000 })).toBeInTheDocument();
  expect(screen.getByText('Visit not completed')).toBeInTheDocument();
  expect(server.status).toBe('IN_PROGRESS');
  expect(server.record.map((item) => item.drugName)).toEqual([doxycycline.drugName]);
  expect(server.writes).toEqual(['PATCH /api/visits/v1', 'PATCH /api/prescriptions/rx1']);
});

it('creates the prescription record when a visit with medicines but no saved prescription is completed', async () => {
  const server = clinicServer('IN_PROGRESS', { saved: false });
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v1" userRole="DOCTOR" />);
  await screen.findByDisplayValue(doxycycline.drugName, {}, { timeout: 20_000 });
  await completeVisit();
  await waitFor(() => expect(server.status).toBe('COMPLETED'), { timeout: 10_000 });
  expect(server.writes).toEqual(['PATCH /api/visits/v1', 'POST /api/prescriptions', 'POST /api/visits/v1/complete']);
  expect(server.record.map((item) => item.drugName)).toEqual([doxycycline.drugName]);
});
