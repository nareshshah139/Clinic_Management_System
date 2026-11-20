import { act, fireEvent, render, screen } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';

// Replays of verification/state-machines/visit-form-save. The real MedicalVisitForm renders with
// the real PrescriptionBuilder; only fetch is stubbed. The stub server applies a held write when
// the model's "the server applies" step runs, and delivers its reply at the model's reply step.
// Like VisitsService.update, it refuses a write whose version is stale with 409, and the
// prescription POST carries the form's clinical patch with the same version.

const CLINICAL_WORKFLOW_COMPLETION_TIMEOUT_MS = 15_000;
jest.setTimeout(CLINICAL_WORKFLOW_COMPLETION_TIMEOUT_MS);

type Held = { method: string; url: string; body: any; apply: () => void; reply: () => void };

const medicine = { drugName: 'Synthetic medicine', dosage: 10, dosageUnit: 'MG', frequency: 'ONCE_DAILY', duration: 7, durationUnit: 'DAYS' };

function visitServer(existingVisit: boolean) {
  const server = { version: 1, visits: existingVisit ? ['v1'] : ([] as string[]), held: [] as Held[] };
  const reply = (status: number, body: unknown) => ({ ok: status < 400, status, headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) }, json: async () => body, text: async () => JSON.stringify(body) });
  const visit = (id: string) => ({ id, version: server.version, status: 'IN_PROGRESS', patientId: 'p', doctorId: 'd', complaints: [], history: {}, plan: {}, exam: {} });
  const conflict = () => reply(409, { message: 'Visit changed elsewhere' });
  const handle = (method: string, url: string, body: any) => {
    if (method === 'POST' && url === '/api/visits') {
      const id = `v${server.visits.length + 1}`;
      server.visits.push(id);
      return reply(201, { ...visit(id), version: 1 });
    }
    if (method === 'PATCH' && url === '/api/visits/v1') {
      if (body.version !== server.version) return conflict();
      server.version += 1;
      return reply(200, visit('v1'));
    }
    if (method === 'POST' && url === '/api/prescriptions') {
      if (body.clinicalData?.version !== server.version) return conflict();
      server.version += 1;
      return reply(201, { id: 'rx1', visit: visit(body.visitId) });
    }
    return null;
  };
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method || 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (method !== 'GET' && ['/api/visits', '/api/visits/v1', '/api/prescriptions'].includes(url)) {
      return new Promise((resolve) => {
        let response: unknown;
        const entry: Held = { method, url, body, apply: () => { response = handle(method, url, body); }, reply: () => resolve(response) };
        server.held.push(entry);
      });
    }
    if (url === '/api/visits/v1') return Promise.resolve(reply(200, visit('v1')));
    return Promise.resolve(reply(200, []));
  }) as unknown as typeof fetch;
  return server;
}

const settle = async (ms = 0) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
};
const indicator = () => document.querySelector('[data-visit-bar] [role="status"]')!;
const held = (server: ReturnType<typeof visitServer>, method: string, url: string) => server.held.filter((h) => h.method === method && h.url === url);

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  jest.useRealTimers();
});

// Applies every write the form has sent, in arrival order, then delivers the replies newest first,
// so a later write's reply lands before an earlier one's, as in the model's counterexamples.
// Repeats until the form sends nothing more.
const served = new WeakSet<Held>();
async function serveHeldWrites(server: ReturnType<typeof visitServer>) {
  for (let round = 0; round < 8; round++) {
    await settle();
    const pending = server.held.filter((h) => !served.has(h));
    pending.forEach((h) => { h.apply(); served.add(h); });
    for (const h of pending.reverse()) { h.reply(); await settle(); }
  }
}

it('OneVisit: Save Draft and Create Prescription on a new visit create one visit', async () => {
  const server = visitServer(false);
  localStorage.setItem('rxDraft:p:standalone', JSON.stringify({ items: [medicine] }));
  render(<MedicalVisitForm patientId="p" doctorId="d" userRole="DOCTOR" />);
  await settle();
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
  await settle();
  fireEvent.click(screen.getByRole('button', { name: 'Create Prescription' }));
  await settle();
  server.held.forEach((h) => { h.apply(); served.add(h); });
  expect(server.visits).toEqual(['v1']);
  server.held.forEach((h) => h.reply());
  await serveHeldWrites(server);
  fireEvent.click(screen.getByRole('button', { name: 'Create Prescription' }));
  await serveHeldWrites(server);
  expect(server.visits).toEqual(['v1']);
  expect(held(server, 'POST', '/api/prescriptions').map((h) => h.body.visitId)).toEqual(['v1']);
});

async function autosaveRacesThePrescription() {
  const server = visitServer(true);
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v1" userRole="DOCTOR" />);
  await settle();
  expect(indicator()).toHaveTextContent('Saved');
  if (!screen.queryAllByPlaceholderText('Search medicine name...').length) fireEvent.click(screen.getByRole('button', { name: 'Add Row' }));
  fireEvent.change(screen.getAllByPlaceholderText('Search medicine name...')[0], { target: { value: medicine.drugName } });
  await settle();
  expect(indicator()).toHaveTextContent('Unsaved changes');
  await settle(8100);
  const [autosave] = held(server, 'PATCH', '/api/visits/v1');
  expect(autosave.body.version).toBe(1);
  expect(indicator()).toHaveTextContent('Auto-saving…');
  fireEvent.click(screen.getByRole('button', { name: 'Create Prescription' }));
  await serveHeldWrites(server);
  return server;
}

it('NoSelfConflict: an autosave and a prescription save from the same form do not raise a conflict', async () => {
  const server = await autosaveRacesThePrescription();
  expect(screen.queryByText(/Autosave is paused/)).toBeNull();
  expect(held(server, 'POST', '/api/prescriptions').map((h) => h.body.clinicalData.version)).toEqual([2]);
  expect(server.version).toBe(3);
});

it('LatchAgrees: the indicator agrees with the conflict notice', async () => {
  await autosaveRacesThePrescription();
  const latched = screen.queryByText(/Autosave is paused/) !== null;
  expect(indicator()).toHaveTextContent(latched ? 'Save failed' : /^Saved/);
});
