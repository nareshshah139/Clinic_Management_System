import { render, screen, within } from '@testing-library/react';
import { PrescriptionDispensingQueue } from './PrescriptionDispensingQueue';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));

const entry = {
  prescriptionId: 'rx-1',
  visitId: 'visit-1',
  dispensingEligible: true,
  patient: { id: 'patient-1', name: 'Pooja Menon', patientCode: 'P-0001' },
  doctor: { id: 'doctor-1', name: 'Dr. Synthetic' },
  createdAt: '2026-11-12T04:00:00.000Z',
  pendingHours: 2.4,
  isOverTwoHours: true,
  medications: [
    { drugName: '13 74 | Flutas 150Mg(Pc)', prescribedQuantity: 10, dispensedQuantity: 0, coverageStatus: 'not_started' },
    { drugName: 'Cream Unlisted 2%', prescribedQuantity: 1, dispensedQuantity: 0, coverageStatus: 'not_started' },
  ],
  linkedInvoiceIds: [],
  status: 'pending',
};
const stockItems = [
  {
    drugName: '13 74 | Flutas 150Mg(Pc)', stockName: 'Tab. Flutas 150 mg', inventoryItemId: 'inv-1', matchedDrug: { id: 'drug-1', name: 'Flutas 150' },
    unit: 'STRIPS', stockStatus: 'IN_STOCK', totalNonExpiredStock: 18, lowStock: false, nearExpiry: false, alternatives: [], suggestions: [],
  },
  {
    drugName: 'Cream Unlisted 2%', inventoryItemId: null, matchedDrug: null,
    stockStatus: 'UNMATCHED', totalNonExpiredStock: 0, lowStock: false, nearExpiry: false, alternatives: [], suggestions: [],
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) =>
    url.endsWith('/stock-check')
      ? { prescriptionId: 'rx-1', items: stockItems }
      : { data: [entry], pagination: { page: 1, limit: 20, total: 1, pages: 1 } },
  );
});

it('names the stock in the Stock cell the way the loaded bill line does, and keeps the prescribed name under Medication', async () => {
  render(<PrescriptionDispensingQueue onOpenBilling={jest.fn()} openActionLabel="Load" />);
  const row = (await screen.findByText('Pooja Menon')).closest('tr')!;
  const [, , medication, status, stock] = within(row).getAllByRole('cell');

  await within(stock).findByText('Tab. Flutas 150 mg (18 strips)');
  expect([...stock.querySelectorAll('[data-stock-name]')].map((el) => el.getAttribute('data-stock-name'))).toEqual([
    'Tab. Flutas 150 mg',
    'Cream Unlisted 2%',
  ]);
  expect([...stock.querySelectorAll('[data-stock-name]')].map((el) => el.textContent)).toEqual([
    'Tab. Flutas 150 mg (18 strips)',
    'Cream Unlisted 2% (—)',
  ]);
  expect(stock).not.toHaveTextContent('13 74 | Flutas 150Mg(Pc)');
  expect(medication).toHaveTextContent('13 74 | Flutas 150Mg(Pc)0/10');
  expect(medication).not.toHaveTextContent('Tab. Flutas 150 mg');

  const badges = [...status.querySelectorAll('[data-slot="badge"]')];
  expect(badges.map((badge) => badge.textContent)).toEqual(['Pending', 'Over 2h']);
  for (const badge of badges) expect(badge).toHaveClass('whitespace-nowrap');
});
