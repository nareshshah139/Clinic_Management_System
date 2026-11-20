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
});

let padAnswers: Array<ReturnType<typeof json>> = [];
const padKeys: string[] = [];

beforeEach(() => {
  padAnswers = [];
  padKeys.length = 0;
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/prescriptions/pad')) {
      padKeys.push((init?.headers as Record<string, string>)['Idempotency-Key']);
      return padAnswers.shift() ?? json({ message: 'unexpected pad save' }, 500);
    }
    return json({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

async function saveDraft() {
  localStorage.setItem('rxDraft:pad-patient:standalone', draft);
  render(<PrescriptionBuilder patientId="pad-patient" visitId={null} doctorId="doctor" standalone standaloneReason="Monthly repeat" />);
  const button = await screen.findByRole('button', { name: 'Create Prescription' });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

it('keeps one key across presses of Save for one pad draft, and gives the same prescription written again later a new key', async () => {
  padAnswers.push(json({ message: 'Rejected once' }, 400), json({ id: 'rx-1' }, 201));
  const button = await saveDraft();
  fireEvent.click(button);
  await waitFor(() => expect(padKeys).toHaveLength(1));
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() => expect(padKeys).toHaveLength(2));
  expect(padKeys[1]).toBe(padKeys[0]);
  cleanup();

  padAnswers.push(json({ id: 'rx-2' }, 201));
  fireEvent.click(await saveDraft());
  await waitFor(() => expect(padKeys).toHaveLength(3));
  expect(padKeys[0]).toMatch(/^cms:POST:prescriptions:pad:/);
  expect(padKeys[2]).not.toBe(padKeys[0]);
});
