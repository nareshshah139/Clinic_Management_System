import { act, fireEvent, render, screen } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';

// Replays of verification/state-machines/visit-form-save. The real MedicalVisitForm renders with
// the real PrescriptionBuilder; only fetch is stubbed. The stub server applies a held write when
// the model's "the server applies" step runs, and delivers its reply at the model's reply step.
// Like VisitsService.update, it refuses a write whose version is stale with 409, and the
// prescription POST carries the form's clinical patch with the same version.

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

async function saveDraftAndPrescriptionOnANewVisit() {
  const server = visitServer(false);
  localStorage.setItem('rxDraft:p:standalone', JSON.stringify({ items: [medicine] }));
  render(<MedicalVisitForm patientId="p" doctorId="d" userRole="DOCTOR" />);
  await settle();
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
  await settle();
  expect(held(server, 'POST', '/api/visits')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Create Prescription' }));
  await settle();
  const [saveDraft, prescription] = held(server, 'POST', '/api/visits');
  expect(prescription).toBeDefined();
  saveDraft.apply();
  prescription.apply();
  return server;
}

it.failing('OneVisit: Save Draft and Create Prescription on a new visit create one visit', async () => {
  const server = await saveDraftAndPrescriptionOnANewVisit();
  expect(server.visits).toEqual(['v1']);
});

it('today: OneVisit path creates two visits for one consultation', async () => {
  const server = await saveDraftAndPrescriptionOnANewVisit();
  expect(server.visits).toEqual(['v1', 'v2']);
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
  await settle();
  const [prescription] = held(server, 'POST', '/api/prescriptions');
  expect(prescription.body.clinicalData.version).toBe(1);
  autosave.apply();
  prescription.apply();
  prescription.reply();
  await settle();
  return { server, autosave };
}

it.failing('NoSelfConflict: an autosave and a prescription save from the same form do not raise a conflict', async () => {
  await autosaveRacesThePrescription();
  expect(screen.queryByText(/Autosave is paused/)).toBeNull();
});

it('today: NoSelfConflict path pauses autosave as if someone else changed the visit', async () => {
  const { server } = await autosaveRacesThePrescription();
  expect(server.version).toBe(2);
  expect(screen.getByText(/Autosave is paused/)).toBeInTheDocument();
  expect(indicator()).toHaveTextContent('Save failed');
});

async function staleAutosaveReplyAfterTheConflict() {
  const { autosave } = await autosaveRacesThePrescription();
  autosave.reply();
  await settle();
}

it.failing('LatchAgrees: while the conflict notice shows, the indicator says Save failed', async () => {
  await staleAutosaveReplyAfterTheConflict();
  expect(indicator()).toHaveTextContent('Save failed');
});

it('today: LatchAgrees path shows Saved beside the conflict notice', async () => {
  await staleAutosaveReplyAfterTheConflict();
  expect(screen.getByText(/Autosave is paused/)).toBeInTheDocument();
  expect(indicator()).toHaveTextContent(/^Saved/);
});
