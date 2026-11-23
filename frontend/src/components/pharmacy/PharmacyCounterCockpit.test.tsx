import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PharmacyCounterCockpit } from './PharmacyCounterCockpit';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

const OPEN = ['QUEUED', 'IN_REVIEW', 'PARTIALLY_FILLED', 'PAUSED', 'READY_TO_BILL', 'CANCELLED'];

const entry = (id: string, name: string, status: string, dispenseStatus: string, allowedStatuses: string[]) => ({
  prescriptionId: id,
  dispenseTaskId: `task-${id}`,
  dispensingEligible: true,
  patient: { id: `patient-${id}`, name },
  doctor: { id: 'doctor', name: 'Synthetic Doctor' },
  createdAt: '2026-11-20T09:00:00Z',
  pendingHours: 1,
  isOverTwoHours: false,
  medications: [{ lineId: `line-${id}`, drugName: 'Synthetic Cream', prescribedQuantity: 1, dispensedQuantity: 0, action: 'pending' }],
  linkedInvoiceIds: [],
  status,
  dispenseStatus,
  allowedStatuses,
});

const queue = [
  entry('rx-open', 'Asha Open', 'pending', 'IN_REVIEW', OPEN),
  entry('rx-partial', 'Bina Partial', 'partial', 'PARTIALLY_FILLED', [...OPEN, 'PAID']),
  entry('rx-cancelled', 'Chitra Cancelled', 'expired', 'CANCELLED', ['CANCELLED']),
  entry('rx-dispensed', 'Devi Dispensed', 'dispensed', 'DISPENSED', []),
];

beforeEach(() => {
  jest.clearAllMocks();
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) =>
    url.endsWith('/stock-check')
      ? { items: [] }
      : { data: queue, pagination: { total: queue.length }, counts: {} },
  );
});

async function statusMenuFor(name: string) {
  const row = (await screen.findAllByRole('listitem')).find(item => item.textContent?.includes(name))!;
  await userEvent.click(within(row).getAllByRole('button')[0]);
  await screen.findByRole('heading', { name });
  const more = screen.queryByRole('button', { name: 'More status actions' });
  if (!more) return [];
  await waitFor(() => expect(more).toBeEnabled());
  await userEvent.click(more);
  const items = (await screen.findAllByRole('menuitem')).map(item => item.textContent);
  await userEvent.keyboard('{Escape}');
  return items;
}

it('offers only the status moves the server allows for each task', async () => {
  render(<PharmacyCounterCockpit />);
  expect([
    await statusMenuFor('Asha Open'),
    await statusMenuFor('Bina Partial'),
    await statusMenuFor('Chitra Cancelled'),
    await statusMenuFor('Devi Dispensed'),
  ]).toEqual([['Pause'], ['Pause', 'Mark paid'], [], []]);
  expect(apiClient.patch).not.toHaveBeenCalled();
}, 30000);
