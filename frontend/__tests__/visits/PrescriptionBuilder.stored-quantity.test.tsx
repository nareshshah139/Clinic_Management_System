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

const stamped = { dosage: 1, dosageUnit: 'TABLET', frequency: 'TWICE_DAILY', duration: 30, durationUnit: 'DAYS', quantity: 5 };

const history = [
  { id: 'current', encounterDate: '2026-11-24T05:00:00.000Z', prescriptionItems: [] },
  { id: 'older', encounterDate: '2026-10-10T05:00:00.000Z', prescriptionItems: [{ drugName: 'Cetaphil Gentle Cleanser', ...stamped }] },
];
const template = { id: 'tpl-1', name: 'Eczema regimen', items: [{ drugName: 'Xemose Cream', ...stamped }], metadata: {} };

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  global.fetch = jest.fn(async (url: string) => {
    if (String(url).includes('/visits/patient/')) return json(history);
    if (String(url).includes('/prescriptions/templates')) return json({ templates: [template] });
    return json({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const renderVisit = () => render(<PrescriptionBuilder patientId="p-stamped" visitId="current" doctorId="d" />);
const totalQty = () => screen.getByText(/Total qty:/).textContent;

it('copies the last prescription without the quantity the old builder stamped on it', async () => {
  renderVisit();
  const panel = await screen.findByRole('region', { name: 'Last prescription' });
  fireEvent.click(within(panel).getByRole('button', { name: 'Copy to this prescription' }));
  await screen.findByDisplayValue('Cetaphil Gentle Cleanser');

  expect(totalQty()).toContain('Total qty: 0');
});

it('applies a saved template without the quantity the old builder stamped on it', async () => {
  renderVisit();
  const trigger = await screen.findByRole('button', { name: /Prescription template/ });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('menuitem', { name: /Eczema regimen/ }));
  await screen.findByDisplayValue('Xemose Cream');

  expect(totalQty()).toContain('Total qty: 0');
});
