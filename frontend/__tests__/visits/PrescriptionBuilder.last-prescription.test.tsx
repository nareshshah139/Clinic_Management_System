import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';

jest.setTimeout(30_000);

const json = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const history = [
  {
    id: 'current',
    encounterDate: '2026-11-24T05:00:00.000Z',
    prescriptionItems: [{ drugName: 'Tab Cetirizine 10mg', dosePattern: '0-0-1', frequency: 'ONCE_DAILY', duration: 5, durationUnit: 'DAYS' }],
  },
  {
    id: 'older',
    encounterDate: '2026-10-10T05:00:00.000Z',
    doctor: { firstName: 'Asha', lastName: 'Rao', name: 'Asha Rao' },
    prescriptionItems: [
      { drugName: 'Tab Doxycycline 100mg', dosePattern: '1-0-1', frequency: 'TWICE_DAILY', timing: 'AFTER_FOOD', duration: 14, durationUnit: 'DAYS', instructions: 'Avoid sun exposure' },
    ],
  },
];

beforeEach(() => {
  global.fetch = jest.fn(async (url: string) => {
    if (String(url).includes('/visits/patient/')) return json(history);
    return json({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const renderVisit = () => render(<PrescriptionBuilder patientId="p-last" visitId="current" doctorId="d" />);

it('shows the last saved prescription read-only while the medicines table stays empty', async () => {
  renderVisit();
  const panel = await screen.findByRole('region', { name: 'Last prescription' });
  expect(panel.textContent).toBe(
    'Last prescription10 Oct 2026 • Asha RaoCopy to this prescriptionTab Doxycycline 100mg • 1-0-1 • after food • 14 days • Avoid sun exposure',
  );
  expect(screen.queryByDisplayValue('Tab Doxycycline 100mg')).toBeNull();
  expect(within(panel).queryByText(/Cetirizine/)).toBeNull();
});

it('copies the last prescription into the medicines table', async () => {
  renderVisit();
  fireEvent.click(await screen.findByRole('button', { name: 'Copy to this prescription' }));
  expect(await screen.findByDisplayValue('Tab Doxycycline 100mg')).toBeTruthy();
});
