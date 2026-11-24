import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { Toaster } from '@/components/ui/toaster';

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

function clinicServer(initialStatus: 'COMPLETED' | 'IN_PROGRESS', { prescriptionRefusal = '', saved = true, record = [doxycycline] as Array<{ drugName: string }> } = {}) {
  const server = { status: initialStatus, version: 4, saved, record, writes: [] as string[] };
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
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url === '/api/visits/v1') { server.version += 1; return reply(200, visit()); }
    if (url === '/api/prescriptions/rx1' || url === '/api/prescriptions') {
      if (prescriptionRefusal) return reply(409, { message: prescriptionRefusal });
      const undated = body.items.findIndex((item: { duration: number }) => !(item.duration >= 1));
      if (undated >= 0) return reply(400, { message: [`items.${undated}.duration must not be less than 1`] });
      server.saved = true;
      server.record = body.items;
      server.version += 1;
      return reply(200, { id: 'rx1', items: server.record, visit: visit() });
    }
    if (url === '/api/visits/v1/complete') {
      if (server.status !== 'COMPLETED') { server.status = 'COMPLETED'; server.version += 1; }
      return reply(200, visit());
    }
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

const lockedMedicine = async () => {
  const field = await screen.findByDisplayValue(doxycycline.drugName, {}, { timeout: 20_000 });
  expect(field).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Save Draft' })).toBeNull();
  return field;
};

it('edits a completed visit through Edit visit, saves the visit, the prescription record and completion in order, and locks it again', async () => {
  const server = clinicServer('COMPLETED');
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v1" userRole="DOCTOR" />);
  await lockedMedicine();
  expect(screen.getByText('Completed. Read only.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Edit visit' }));
  expect(screen.getByText(/^Editing a completed visit\./)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save Draft' })).toBeEnabled();
  fireEvent.change(screen.getByDisplayValue(doxycycline.drugName), { target: { value: MINOCYCLINE } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save changes' })); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit visit' })).toBeInTheDocument(), { timeout: 10_000 });

  expect(server.writes).toEqual(['PATCH /api/visits/v1', 'PATCH /api/prescriptions/rx1', 'POST /api/visits/v1/complete']);
  expect(server.status).toBe('COMPLETED');
  expect(server.record.map((item) => item.drugName)).toEqual([MINOCYCLINE]);
  expect(screen.getByDisplayValue(MINOCYCLINE)).toBeDisabled();
  expect(screen.getByText('Completed. Read only.')).toBeInTheDocument();

  const page = await printPrescription();
  expect(page).toContain(MINOCYCLINE);
  expect(page).not.toContain(doxycycline.drugName);
  expect(server.writes).toEqual(['PATCH /api/visits/v1', 'PATCH /api/prescriptions/rx1', 'POST /api/visits/v1/complete']);
});

it('prints a completed visit being edited only after saving the visit and the prescription record', async () => {
  const server = clinicServer('COMPLETED');
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v1" userRole="DOCTOR" />);
  await lockedMedicine();
  fireEvent.click(screen.getByRole('button', { name: 'Edit visit' }));
  fireEvent.change(screen.getByDisplayValue(doxycycline.drugName), { target: { value: MINOCYCLINE } });

  const page = await printPrescription();
  expect(server.writes).toEqual(['PATCH /api/visits/v1', 'PATCH /api/prescriptions/rx1']);
  expect(server.record.map((item) => item.drugName)).toEqual([MINOCYCLINE]);
  expect(page).toContain(MINOCYCLINE);
  expect(page).not.toContain(doxycycline.drugName);
  expect(server.status).toBe('COMPLETED');
});

it('opens a completed visit locked again after it is reloaded mid-edit', async () => {
  clinicServer('COMPLETED');
  const { unmount } = render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v1" userRole="DOCTOR" />);
  await lockedMedicine();
  fireEvent.click(screen.getByRole('button', { name: 'Edit visit' }));
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  unmount();
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v1" userRole="DOCTOR" />);
  await lockedMedicine();
  expect(screen.getByRole('button', { name: 'Edit visit' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
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
  expect(server.writes).toEqual([]);
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

const clearDuration = () => fireEvent.change(screen.getByLabelText(`Duration for ${doxycycline.drugName}`), { target: { value: '' } });

it('names the medicine missing a duration and leaves the visit open with no prescription written', async () => {
  const server = clinicServer('IN_PROGRESS', { saved: false });
  render(<><MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v1" userRole="DOCTOR" /><Toaster /></>);
  await screen.findByDisplayValue(doxycycline.drugName, {}, { timeout: 20_000 });
  clearDuration();
  await completeVisit();
  expect(await screen.findByText('Add a duration for Doxycycline 100.', {}, { timeout: 10_000 })).toBeInTheDocument();
  expect(screen.getByText('Visit not completed')).toBeInTheDocument();
  expect(server.status).toBe('IN_PROGRESS');
  expect(server.saved).toBe(false);
  expect(server.writes).toEqual(['PATCH /api/visits/v1']);
});

it('names the medicine missing a duration on Create Prescription and writes nothing', async () => {
  const server = clinicServer('IN_PROGRESS', { saved: false });
  render(<><MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v1" userRole="DOCTOR" /><Toaster /></>);
  await screen.findByDisplayValue(doxycycline.drugName, {}, { timeout: 20_000 });
  clearDuration();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create Prescription' })); });
  expect(await screen.findByText('Add a duration for Doxycycline 100.', {}, { timeout: 10_000 })).toBeInTheDocument();
  expect(screen.getByText('Cannot create prescription')).toBeInTheDocument();
  expect(server.writes).toEqual([]);
});

it('names the medicine missing a duration on Save changes and keeps the completed visit and its record unchanged', async () => {
  const server = clinicServer('COMPLETED');
  render(<><MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v1" userRole="DOCTOR" /><Toaster /></>);
  await lockedMedicine();
  fireEvent.click(screen.getByRole('button', { name: 'Edit visit' }));
  clearDuration();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save changes' })); });
  expect(await screen.findByText('Add a duration for Doxycycline 100.', {}, { timeout: 10_000 })).toBeInTheDocument();
  expect(screen.getByText('Changes not saved')).toBeInTheDocument();
  expect(server.record).toEqual([doxycycline]);
  expect(server.writes).toEqual(['PATCH /api/visits/v1']);
});

it('unlocks a completed visit with Edit visit as saved, and marks it unsaved only once the doctor edits', async () => {
  const server = clinicServer('COMPLETED');
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v1" userRole="DOCTOR" />);
  await lockedMedicine();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 500)); });
  fireEvent.click(screen.getByRole('button', { name: 'Edit visit' }));
  expect(screen.getByRole('status')).toHaveTextContent(/^Editing a completed visit\. Saved$/);
  fireEvent.change(screen.getByDisplayValue(doxycycline.drugName), { target: { value: MINOCYCLINE } });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^Editing a completed visit\. Unsaved changes$/));
  expect(server.writes).toEqual([]);
});

it('reopens a visit completed in this browser and unlocks it with Edit visit as saved', async () => {
  const server = clinicServer('IN_PROGRESS', { saved: false, record: [] });
  const first = render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v1" userRole="DOCTOR" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add Row' }, { timeout: 20_000 }));
  fireEvent.change(screen.getAllByPlaceholderText('Search medicine name...')[0], { target: { value: MINOCYCLINE } });
  fireEvent.change(screen.getByLabelText(`Duration for ${MINOCYCLINE}`), { target: { value: '5' } });
  await completeVisit();
  await waitFor(() => expect(server.status).toBe('COMPLETED'), { timeout: 10_000 });
  first.unmount();
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v1" userRole="DOCTOR" />);
  await screen.findByRole('button', { name: 'Edit visit' }, { timeout: 20_000 });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 500)); });
  fireEvent.click(screen.getByRole('button', { name: 'Edit visit' }));
  expect(screen.getByRole('status')).toHaveTextContent(/^Editing a completed visit\. Saved$/);
});

it('still shows an unsaved edit to a completed visit as unsaved after the page is reloaded mid-edit', async () => {
  clinicServer('COMPLETED');
  const first = render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v1" userRole="DOCTOR" />);
  await lockedMedicine();
  fireEvent.click(screen.getByRole('button', { name: 'Edit visit' }));
  fireEvent.change(screen.getByLabelText('Follow-up instructions'), { target: { value: 'Review in 6 weeks' } });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Unsaved changes$/));
  first.unmount();
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v1" userRole="DOCTOR" />);
  await screen.findByDisplayValue('Review in 6 weeks', {}, { timeout: 20_000 });
  await lockedMedicine();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 500)); });
  fireEvent.click(screen.getByRole('button', { name: 'Edit visit' }));
  expect(screen.getByRole('status')).toHaveTextContent(/^Editing a completed visit\. Unsaved changes$/);
});
