import React from 'react';
import { render, screen, fireEvent, cleanup, within, waitFor, act } from '@testing-library/react';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';

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
