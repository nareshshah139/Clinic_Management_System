import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';

jest.setTimeout(30_000);

const json = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const draft = JSON.stringify({
  items: [{ drugName: 'Doxycycline 100', dosage: 1, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: 30, durationUnit: 'DAYS' }],
  diagnosis: 'Acne vulgaris',
});

beforeEach(() => {
  global.fetch = jest.fn(async (url: string) => {
    if (String(url).endsWith('/prescriptions/pad')) return json({ id: 'rx-1' }, 201);
    return json({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it('moves a new visit draft to the visit once it exists, so the next new visit for the patient starts empty', async () => {
  localStorage.setItem('rxDraft:p:standalone', draft);
  const view = render(<PrescriptionBuilder patientId="p" visitId={null} doctorId="d" />);
  await screen.findByDisplayValue('Doxycycline 100');

  view.rerender(<PrescriptionBuilder patientId="p" visitId="v1" doctorId="d" />);
  await waitFor(() => expect(localStorage.getItem('rxDraft:p:standalone')).toBeNull());
  expect(JSON.parse(localStorage.getItem('rxDraft:p:v1')!).items[0].drugName).toBe('Doxycycline 100');
  cleanup();

  render(<PrescriptionBuilder patientId="p" visitId={null} doctorId="d" />);
  await screen.findByRole('button', { name: 'Save visit first' });
  expect(screen.queryByDisplayValue('Doxycycline 100')).toBeNull();
});

it('forgets a saved pad prescription, even after the builder closes', async () => {
  localStorage.setItem('rxDraft:pad:standalone', draft);
  render(<PrescriptionBuilder patientId="pad" visitId={null} doctorId="d" standalone standaloneReason="Monthly repeat" />);
  const save = await screen.findByRole('button', { name: 'Create Prescription' });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
  await waitFor(() => expect(localStorage.getItem('rxDraft:pad:standalone')).toBeNull());
  cleanup();
  expect(localStorage.getItem('rxDraft:pad:standalone')).toBeNull();
});
