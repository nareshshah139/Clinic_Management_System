import React from 'react';
import { render, screen, fireEvent, cleanup, within, waitFor, act } from '@testing-library/react';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';
import type { PendingCarry } from '@/components/visits/LastVisitCarry';

jest.setTimeout(30_000);

const json = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const lastVisit = {
  id: 'last',
  entryType: 'visit',
  encounterDate: '2026-10-10T05:00:00.000Z',
  doctor: { firstName: 'Asha', lastName: 'Rao', name: 'Asha Rao' },
  complaints: [{ complaint: 'Acne on cheeks for 3 months' }],
  diagnosis: [{ diagnosis: 'Acne vulgaris' }],
  history: {
    pastHistory: 'Eczema as a child',
    medicationHistory: 'Isotretinoin in 2024',
    familyHistory: { dm: true, htn: false, others: 'Father: hypertension' },
  },
  prescriptionItems: [
    { drugName: 'Tab Doxycycline 100mg', dosePattern: '1-0-1', frequency: 'TWICE_DAILY', timing: 'AFTER_FOOD', duration: 14, durationUnit: 'DAYS', quantity: 28 },
    { drugName: 'Adapalene 0.1% Gel', frequency: 'ONCE_DAILY', duration: 30, durationUnit: 'DAYS', quantity: 1 },
  ],
};
const olderVisit = {
  id: 'older',
  entryType: 'visit',
  encounterDate: '2026-08-01T05:00:00.000Z',
  complaints: [{ complaint: 'Dandruff' }],
  diagnosis: [{ diagnosis: 'Seborrheic dermatitis' }],
  prescriptionItems: [{ drugName: 'Ketoconazole Shampoo', frequency: 'ONCE_DAILY', duration: 14, durationUnit: 'DAYS' }],
};
const emptyNewerVisit = { id: 'empty', entryType: 'visit', encounterDate: '2026-11-01T05:00:00.000Z', complaints: [], diagnosis: [], prescriptionItems: [] };
const currentVisit = { id: 'current', entryType: 'visit', encounterDate: '2026-11-24T05:00:00.000Z', complaints: [{ complaint: 'Typed today' }], diagnosis: [], prescriptionItems: [] };

let history: unknown[] = [];

beforeEach(() => {
  history = [emptyNewerVisit, lastVisit, olderVisit];
  global.fetch = jest.fn(async (url: string) => {
    if (String(url).includes('/visits/patient/') && String(url).includes('/history')) return json(history);
    if (String(url).includes('/drugs/autocomplete')) return json([]);
    return json({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const renderNewVisit = () => render(<PrescriptionBuilder patientId="p-last" visitId={null} doctorId="d" />);
const field = (name: string) => screen.getByRole('textbox', { name }) as HTMLTextAreaElement | HTMLInputElement;
const offer = () => screen.findByRole('region', { name: 'Last visit' });
const settled = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });

it('offers the last visit with something in it and fills nothing until the doctor asks', async () => {
  renderNewVisit();
  const panel = await offer();
  expect(panel.textContent).toContain('10 Oct 2026');
  expect(panel.textContent).toContain('Acne vulgaris');
  expect(panel.textContent).toContain('2 medicines');
  expect(within(panel).getByRole('button', { name: 'Start from last visit' })).toBeTruthy();
  expect(field('Chief complaints').value).toBe('');
  expect(field('Diagnosis').value).toBe('');
  expect(screen.queryByDisplayValue('Tab Doxycycline 100mg')).toBeNull();
});

it('starts the visit from the last one in one click: complaints, diagnosis, histories and medicines', async () => {
  renderNewVisit();
  fireEvent.click(within(await offer()).getByRole('button', { name: 'Start from last visit' }));

  expect(field('Chief complaints').value).toBe('Acne on cheeks for 3 months');
  expect(field('Diagnosis').value).toBe('Acne vulgaris');
  expect(field('Past history').value).toBe('Eczema as a child');
  expect(field('Medication history').value).toBe('Isotretinoin in 2024');
  expect((screen.getByPlaceholderText('Others') as HTMLInputElement).value).toBe('Father: hypertension');
  expect((screen.getByRole('checkbox', { name: 'Diabetes' }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole('checkbox', { name: 'Hypertension' }) as HTMLInputElement).checked).toBe(false);
  expect(((await screen.findByDisplayValue('Tab Doxycycline 100mg')) as HTMLInputElement).value).toBe('Tab Doxycycline 100mg');
  expect(((await screen.findByDisplayValue('Adapalene 0.1% Gel')) as HTMLInputElement).value).toBe('Adapalene 0.1% Gel');
  expect(screen.queryByDisplayValue('Ketoconazole Shampoo')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Last visit' })).toBeNull();
});

it('does not carry the old quantity of a medicine, which the old builder stamped and no control edits', async () => {
  renderNewVisit();
  fireEvent.click(within(await offer()).getByRole('button', { name: 'Start from last visit' }));
  await screen.findByDisplayValue('Adapalene 0.1% Gel');

  expect(screen.getByText(/Total items: 2/).textContent).toContain('Total qty: 0');
});

it('says what came from the last visit, on the notice and on each section, until the doctor edits it', async () => {
  renderNewVisit();
  fireEvent.click(within(await offer()).getByRole('button', { name: 'Start from last visit' }));

  const notice = await screen.findByRole('region', { name: 'Carried forward' });
  expect(notice.textContent).toContain('10 Oct 2026');
  expect(notice.textContent).toContain('chief complaints, diagnosis, past history, medication history, family history, 2 medicines');
  const marks = () => screen.queryAllByText(/from 10 Oct 2026 visit/i).map((mark) => mark.closest('[id^="consult-"]')?.id);
  expect(marks()).toEqual(['consult-chief-complaints', 'consult-diagnosis', 'consult-histories', 'consult-treatment']);

  fireEvent.change(field('Diagnosis'), { target: { value: 'Acne vulgaris, grade 3' } });
  expect(marks()).toEqual(['consult-chief-complaints', 'consult-histories', 'consult-treatment']);
});

it('undoes only what is still the carried text and keeps the doctor\'s own edits', async () => {
  renderNewVisit();
  fireEvent.click(within(await offer()).getByRole('button', { name: 'Start from last visit' }));
  fireEvent.change(field('Medication history'), { target: { value: 'Isotretinoin in 2024, stopped' } });

  fireEvent.click(within(await screen.findByRole('region', { name: 'Carried forward' })).getByRole('button', { name: 'Undo' }));

  expect(field('Chief complaints').value).toBe('');
  expect(field('Diagnosis').value).toBe('');
  expect(field('Past history').value).toBe('');
  expect((screen.getByRole('checkbox', { name: 'Diabetes' }) as HTMLInputElement).checked).toBe(false);
  expect(field('Medication history').value).toBe('Isotretinoin in 2024, stopped');
  expect(screen.queryByDisplayValue('Tab Doxycycline 100mg')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Carried forward' })).toBeNull();
});

const treatmentBadge = () => document.querySelector('#consult-treatment [data-slot="badge"]')?.textContent ?? '';
const instructionsFor = (drug: string) => screen.getByRole('textbox', { name: `Instructions for ${drug}` }) as HTMLTextAreaElement | HTMLInputElement;

it('keeps a carried medicine the doctor edited, drops its mark, and removes only the untouched ones on Undo', async () => {
  renderNewVisit();
  fireEvent.click(within(await offer()).getByRole('button', { name: 'Start from last visit' }));
  await screen.findByDisplayValue('Adapalene 0.1% Gel');
  await settled();
  expect(treatmentBadge()).toBe('2 medicines from 10 Oct 2026 visit');

  fireEvent.change(instructionsFor('Adapalene 0.1% Gel'), { target: { value: 'Apply on forehead only' } });
  expect(treatmentBadge()).toBe('1 medicine from 10 Oct 2026 visit');

  fireEvent.click(within(await screen.findByRole('region', { name: 'Carried forward' })).getByRole('button', { name: 'Undo' }));
  await settled();
  expect(screen.queryByDisplayValue('Tab Doxycycline 100mg')).toBeNull();
  expect(((await screen.findByDisplayValue('Adapalene 0.1% Gel')) as HTMLInputElement).value).toBe('Adapalene 0.1% Gel');
  expect(instructionsFor('Adapalene 0.1% Gel').value).toBe('Apply on forehead only');
  expect(treatmentBadge()).toBe('');
});

it('keeps a medicine the doctor added alongside the carried ones when Undo is pressed', async () => {
  renderNewVisit();
  fireEvent.click(within(await offer()).getByRole('button', { name: 'Start from last visit' }));
  await screen.findByDisplayValue('Adapalene 0.1% Gel');
  const rows = screen.getAllByPlaceholderText('Search medicine name...');
  fireEvent.change(rows[rows.length - 1], { target: { value: 'Tab Cetirizine 10mg' } });
  expect(treatmentBadge()).toBe('2 medicines from 10 Oct 2026 visit');

  fireEvent.click(within(await screen.findByRole('region', { name: 'Carried forward' })).getByRole('button', { name: 'Undo' }));
  await settled();
  expect(screen.queryByDisplayValue('Tab Doxycycline 100mg')).toBeNull();
  expect(screen.queryByDisplayValue('Adapalene 0.1% Gel')).toBeNull();
  expect(((await screen.findByDisplayValue('Tab Cetirizine 10mg')) as HTMLInputElement).value).toBe('Tab Cetirizine 10mg');
});

it('never sends the carry marker of a medicine row to the server', async () => {
  const onClinicalDataChange = jest.fn();
  render(<PrescriptionBuilder patientId="p-last" visitId={null} doctorId="d" onClinicalDataChange={onClinicalDataChange} />);
  fireEvent.click(within(await offer()).getByRole('button', { name: 'Start from last visit' }));
  await screen.findByDisplayValue('Adapalene 0.1% Gel');
  const plan = onClinicalDataChange.mock.calls.at(-1)?.[0]?.treatmentPlan?.dermatology?.medicationPlan;
  expect(plan.map((row: { drugName: string }) => row.drugName)).toEqual(['Tab Doxycycline 100mg', 'Adapalene 0.1% Gel']);
  expect(JSON.stringify(plan)).not.toContain('carryId');
});

it('swaps the offer for the notice inside one container, which keeps Chrome from collapsing the medicine table', async () => {
  renderNewVisit();
  const panel = await offer();
  const slot = panel.closest('[data-last-visit-slot]');
  expect(slot).not.toBeNull();
  fireEvent.click(within(panel).getByRole('button', { name: 'Start from last visit' }));
  const notice = await screen.findByRole('region', { name: 'Carried forward' });
  expect(notice.closest('[data-last-visit-slot]')).toBe(slot);
});

it('names the doctor of the last visit in the offer and the notice, and does not call it the reader\'s own', async () => {
  renderNewVisit();
  const panel = await offer();
  expect(panel.textContent).toContain('Dr. Asha Rao');
  expect(panel.textContent).not.toMatch(/draft/i);
  fireEvent.click(within(panel).getByRole('button', { name: 'Start from last visit' }));
  const notice = await screen.findByRole('region', { name: 'Carried forward' });
  expect(notice.textContent).toContain('Carried forward from the 10 Oct 2026 visit by Dr. Asha Rao:');
  expect(notice.textContent).not.toMatch(/your|draft/i);
});

it('marks a visit that was never completed as a draft in the offer, the notice and the badges', async () => {
  history = [{ ...savedDraft, status: 'IN_PROGRESS', doctor: { firstName: 'Asha', lastName: 'Rao', name: 'Asha Rao' } }, olderVisit];
  renderNewVisit();
  const panel = await offer();
  expect(panel.textContent).toContain('Draft');
  expect(panel.textContent).toContain('Dr. Asha Rao');
  fireEvent.click(within(panel).getByRole('button', { name: 'Start from last visit' }));
  const notice = await screen.findByRole('region', { name: 'Carried forward' });
  expect(notice.textContent).toContain('Carried forward from the 12 Nov 2026 visit by Dr. Asha Rao (draft, not completed):');
  expect(screen.queryAllByText(/from 12 Nov 2026 draft visit/i).length).toBeGreaterThan(0);
});

it('does not offer itself once the doctor has started this visit', async () => {
  renderNewVisit();
  await offer();
  fireEvent.change(field('Chief complaints'), { target: { value: 'Hair fall' } });
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Last visit' })).toBeNull());
});

it('is absent for a patient with no earlier visit', async () => {
  history = [emptyNewerVisit];
  renderNewVisit();
  await settled();
  expect(screen.queryByRole('region', { name: 'Last visit' })).toBeNull();
});

it('never offers the visit being edited as its own last visit', async () => {
  history = [currentVisit];
  render(<PrescriptionBuilder patientId="p-last" visitId="current" doctorId="d" />);
  await settled();
  expect(screen.queryByRole('region', { name: 'Last visit' })).toBeNull();
});

const savedDraft = {
  id: 'draft',
  entryType: 'visit',
  encounterDate: '2026-11-12T05:00:00.000Z',
  complaints: [{ complaint: 'Hair fall for 2 months' }],
  diagnosis: [{ diagnosis: 'Telogen effluvium' }],
  prescriptionItems: [],
  prescription: null,
  plan: {
    dermatology: {
      medicationPlan: [
        { drugName: 'Minoxidil 5% Solution', frequency: 'TWICE_DAILY', duration: 90, durationUnit: 'DAYS', instructions: 'Apply to scalp' },
        { drugName: 'Biotin 10mg Tablet', frequency: 'ONCE_DAILY', duration: 90, durationUnit: 'DAYS' },
      ],
    },
  },
};

it('carries the medicines of a saved draft from its treatment plan when nothing was issued', async () => {
  history = [savedDraft, olderVisit];
  renderNewVisit();
  const panel = await offer();
  expect(panel.textContent).toContain('Telogen effluvium');
  expect(panel.textContent).toContain('2 medicines');
  fireEvent.click(within(panel).getByRole('button', { name: 'Start from last visit' }));
  expect(((await screen.findByDisplayValue('Minoxidil 5% Solution')) as HTMLInputElement).value).toBe('Minoxidil 5% Solution');
  expect(((await screen.findByDisplayValue('Biotin 10mg Tablet')) as HTMLInputElement).value).toBe('Biotin 10mg Tablet');
  expect(screen.getByDisplayValue('Apply to scalp')).toBeTruthy();
});

const diagnosisOnlyVisit = {
  id: 'acne-last',
  entryType: 'visit',
  encounterDate: '2026-11-12T05:00:00.000Z',
  complaints: [{ complaint: 'Acne flare' }],
  diagnosis: [{ diagnosis: 'Acne vulgaris' }],
  prescriptionItems: [],
};
const olderAcneVisit = {
  id: 'acne-old',
  entryType: 'visit',
  encounterDate: '2026-09-01T05:00:00.000Z',
  createdAt: '2026-09-01T05:00:00.000Z',
  doctorId: 'd',
  diagnosis: [{ diagnosis: 'Acne vulgaris' }],
  prescriptionItems: [{ drugName: 'Adapalene 0.1% Gel', frequency: 'ONCE_DAILY', duration: 30, durationUnit: 'DAYS' }],
  planSummary: { followUpInstructions: 'Review in 4 weeks' },
};
const suggestedTreatment = () => screen.queryByDisplayValue('Adapalene 0.1% Gel');
const suggestedFollowUp = () => screen.queryByDisplayValue('Review in 4 weeks');

it('does not let a carried diagnosis fill treatment from another visit, and keeps the suggestion to apply on request', async () => {
  history = [diagnosisOnlyVisit, olderAcneVisit];
  renderNewVisit();
  fireEvent.click(within(await offer()).getByRole('button', { name: 'Start from last visit' }));
  expect(field('Diagnosis').value).toBe('Acne vulgaris');
  await settled();
  await settled();
  expect(suggestedTreatment()).toBeNull();
  expect(suggestedFollowUp()).toBeNull();

  fireEvent.click(await screen.findByRole('button', { name: /Reapply learned plan/ }));
  expect(((await screen.findByDisplayValue('Adapalene 0.1% Gel')) as HTMLInputElement).value).toBe('Adapalene 0.1% Gel');
});

it('leaves no treatment behind when a diagnosis-only carry is undone', async () => {
  history = [diagnosisOnlyVisit, olderAcneVisit];
  renderNewVisit();
  fireEvent.click(within(await offer()).getByRole('button', { name: 'Start from last visit' }));
  await settled();
  fireEvent.click(within(await screen.findByRole('region', { name: 'Carried forward' })).getByRole('button', { name: 'Undo' }));
  await settled();
  await settled();
  expect(field('Diagnosis').value).toBe('');
  expect(field('Chief complaints').value).toBe('');
  expect(suggestedTreatment()).toBeNull();
  expect(suggestedFollowUp()).toBeNull();
});

it('does not fill treatment from the carried diagnosis when the doctor replaces it with one that has no suggestion', async () => {
  history = [diagnosisOnlyVisit, olderAcneVisit];
  renderNewVisit();
  fireEvent.click(within(await offer()).getByRole('button', { name: 'Start from last visit' }));
  await settled();
  fireEvent.change(field('Diagnosis'), { target: { value: 'Psoriasis' } });
  await settled();
  await settled();
  expect(field('Diagnosis').value).toBe('Psoriasis');
  expect(suggestedTreatment()).toBeNull();
  expect(suggestedFollowUp()).toBeNull();
});

it('still fills treatment for a diagnosis the doctor types over the carried one', async () => {
  history = [diagnosisOnlyVisit, olderAcneVisit];
  renderNewVisit();
  fireEvent.click(within(await offer()).getByRole('button', { name: 'Start from last visit' }));
  await settled();
  expect(suggestedTreatment()).toBeNull();
  fireEvent.change(field('Diagnosis'), { target: { value: 'Acne vulgaris, grade 3' } });
  expect(((await screen.findByDisplayValue('Adapalene 0.1% Gel')) as HTMLInputElement).value).toBe('Adapalene 0.1% Gel');
});

const frequencyOf = (drug: string) => screen.getByRole('combobox', { name: `Frequency for ${drug}` }).textContent;
const planRow = (drugName: string, extra: Record<string, unknown> = {}) => ({ drugName, frequency: '', dosePattern: '', duration: 90, durationUnit: 'DAYS', ...extra });

it('carries a draft medicine that has no frequency as blank instead of once daily, and still reads a dose pattern', async () => {
  history = [{ ...savedDraft, plan: { dermatology: { medicationPlan: [planRow('Minoxidil 5% Solution'), planRow('Biotin 10mg Tablet', { dosePattern: '1-0-1' })] } } }, olderVisit];
  renderNewVisit();
  fireEvent.click(within(await offer()).getByRole('button', { name: 'Start from last visit' }));
  await screen.findByDisplayValue('Minoxidil 5% Solution');
  expect(frequencyOf('Minoxidil 5% Solution')).toBe('Frequency');
  expect(frequencyOf('Biotin 10mg Tablet')).not.toBe('Once daily');
  expect(frequencyOf('Biotin 10mg Tablet')).not.toBe('Frequency');
});

it('keeps the legacy default of once daily for an issued prescription line without a frequency', async () => {
  history = [{ ...savedDraft, prescriptionItems: [{ drugName: 'Tab Legacy 5mg', duration: 10, durationUnit: 'DAYS' }] }];
  renderNewVisit();
  fireEvent.click(within(await offer()).getByRole('button', { name: 'Start from last visit' }));
  await screen.findByDisplayValue('Tab Legacy 5mg');
  expect(frequencyOf('Tab Legacy 5mg')).toBe('Once daily');
});

it('reopens a saved draft with a medicine that has no frequency as blank, not once daily', async () => {
  const draft = { id: 'v-resume', status: 'IN_PROGRESS', version: 1, plan: { dermatology: { medicationPlan: [planRow('Minoxidil 5% Solution')] } } };
  const answer = global.fetch as jest.Mock;
  global.fetch = jest.fn(async (url: string, init?: unknown) => (String(url).match(/\/visits\/v-resume$/) ? json(draft) : answer(url, init))) as unknown as typeof fetch;
  render(<PrescriptionBuilder patientId="p-last" visitId="v-resume" doctorId="d" />);
  await screen.findByDisplayValue('Minoxidil 5% Solution');
  expect(frequencyOf('Minoxidil 5% Solution')).toBe('Frequency');
});

it('prefers the issued prescription over the plan of the same visit', async () => {
  history = [{ ...savedDraft, prescriptionItems: [{ drugName: 'Tab Finasteride 1mg', frequency: 'ONCE_DAILY', duration: 90, durationUnit: 'DAYS' }] }];
  renderNewVisit();
  fireEvent.click(within(await offer()).getByRole('button', { name: 'Start from last visit' }));
  expect(((await screen.findByDisplayValue('Tab Finasteride 1mg')) as HTMLInputElement).value).toBe('Tab Finasteride 1mg');
  expect(screen.queryByDisplayValue('Minoxidil 5% Solution')).toBeNull();
});

it('keeps the carried items pending, and the source named, when the attending doctor is changed', async () => {
  const pending = React.createRef<() => PendingCarry | null>();
  const view = render(<PrescriptionBuilder patientId="p-last" visitId={null} doctorId="d" pendingCarryRef={pending} />);
  fireEvent.click(within(await offer()).getByRole('button', { name: 'Start from last visit' }));
  await screen.findByRole('region', { name: 'Carried forward' });
  await settled();

  view.rerender(<PrescriptionBuilder patientId="p-last" visitId={null} doctorId="d2" pendingCarryRef={pending} />);
  await settled();

  expect((await screen.findByRole('region', { name: 'Carried forward' })).textContent).toContain('10 Oct 2026 visit by Dr. Asha Rao');
  expect(field('Diagnosis').value).toBe('Acne vulgaris');
  const carried = pending.current?.();
  expect(carried?.source).toContain('10 Oct 2026 visit by Dr. Asha Rao');
  expect(carried?.items.map((item) => item.label)).toEqual(['Chief complaints', 'Diagnosis', 'Past history', 'Medication history', 'Family history', '2 medicines']);
});

it('forgets the carried items when the patient is changed', async () => {
  const pending = React.createRef<() => PendingCarry | null>();
  const view = render(<PrescriptionBuilder patientId="p-last" visitId={null} doctorId="d" pendingCarryRef={pending} />);
  fireEvent.click(within(await offer()).getByRole('button', { name: 'Start from last visit' }));
  await screen.findByRole('region', { name: 'Carried forward' });

  view.rerender(<PrescriptionBuilder patientId="p-other" visitId={null} doctorId="d" pendingCarryRef={pending} />);
  await settled();

  expect(screen.queryByRole('region', { name: 'Carried forward' })).toBeNull();
  expect(pending.current?.()).toBeNull();
});

const procedureOnlyVisit = {
  id: 'v-done',
  status: 'COMPLETED',
  version: 3,
  complaints: [{ complaint: 'Acne flare' }],
  diagnosis: [{ diagnosis: 'Acne vulgaris' }],
  plan: { dermatology: { procedurePlanned: 'Chemical peel, 3 sessions' } },
};

it('never fills a locked completed visit with a learned plan, and not once it is amended either', async () => {
  history = [olderAcneVisit];
  const answer = global.fetch as jest.Mock;
  global.fetch = jest.fn(async (url: string, init?: unknown) => (String(url).match(/\/visits\/v-done$/) ? json(procedureOnlyVisit) : answer(url, init))) as unknown as typeof fetch;
  const view = render(<PrescriptionBuilder patientId="p-last" visitId="v-done" doctorId="d" readOnly />);
  await screen.findByDisplayValue('Acne vulgaris');
  await settled();
  await settled();
  expect(screen.queryByDisplayValue('Adapalene 0.1% Gel')).toBeNull();
  expect(screen.queryByDisplayValue('Review in 4 weeks')).toBeNull();

  view.rerender(<PrescriptionBuilder patientId="p-last" visitId="v-done" doctorId="d" />);
  await settled();
  expect(screen.queryByDisplayValue('Adapalene 0.1% Gel')).toBeNull();
  expect(screen.queryByDisplayValue('Review in 4 weeks')).toBeNull();
});
