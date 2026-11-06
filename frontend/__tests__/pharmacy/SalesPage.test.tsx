import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SalesPage from '@/app/dashboard/pharmacy/sales/page';
import { apiClient } from '@/lib/api';
import type { SalesRegisterResponse, SalesRegisterRow } from '@/components/pharmacy/sales/sales-register-model';

let mockQuery = '';
const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockQuery),
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn() } }));

const row = (overrides: Partial<SalesRegisterRow>): SalesRegisterRow => ({
  id: 'PHARMACY_BILL:inv-14',
  source: 'PHARMACY_BILL',
  recordId: 'inv-14',
  billNo: 'PHI-2026-014',
  state: 'FINAL',
  entryAt: '2026-11-05T09:00:00.000Z',
  billDate: '2026-11-05',
  entryBy: { id: 'user-asha', name: 'Asha Rao' },
  patientName: 'Meera Shah',
  mobile: '+91 98765 43210',
  amount: 1234.5,
  paymentModes: ['UPI'],
  linkedBillNo: null,
  ...overrides,
});

const response = (overrides: Partial<SalesRegisterResponse> = {}): SalesRegisterResponse => ({
  rows: [row({})],
  total: 1,
  page: 1,
  limit: 50,
  totals: { amount: 1234.5, count: 1, excluded: { drafts: 0, cancelled: 0 } },
  entryByOptions: [
    { id: 'user-asha', name: 'Asha Rao' },
    { id: 'user-ravi', name: 'Ravi Kumar' },
  ],
  clinicName: 'Skin Care Clinic',
  ...overrides,
});

const get = jest.mocked(apiClient.get);
const lastRequest = () => get.mock.calls[get.mock.calls.length - 1][1] as Record<string, unknown>;

beforeAll(() => {
  jest.useFakeTimers({ now: new Date('2026-11-06T06:00:00.000Z'), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'nextTick', 'queueMicrotask'] });
});
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  mockQuery = '';
  jest.clearAllMocks();
  get.mockResolvedValue(response());
});

it('asks for this financial year, newest entries first, by default', async () => {
  render(<SalesPage />);
  await screen.findByText('PHI-2026-014');
  expect(get).toHaveBeenCalledWith('/pharmacy/sales-register', {
    register: 'sales',
    from: '2026-04-01',
    to: '2027-03-31',
    paymentMode: undefined,
    state: undefined,
    source: undefined,
    entryById: undefined,
    sortBy: 'entryAt',
    sortDir: 'desc',
    page: 1,
    limit: 50,
  });
});

it('sorts from the column header and reports the direction', async () => {
  render(<SalesPage />);
  await screen.findByText('PHI-2026-014');
  const header = screen.getByRole('columnheader', { name: /Bill No/ });
  expect(header).toHaveAttribute('aria-sort', 'none');

  fireEvent.click(within(header).getByRole('button', { name: 'Bill No' }));
  await waitFor(() => expect(lastRequest()).toMatchObject({ sortBy: 'billNo', sortDir: 'asc' }));
  expect(header).toHaveAttribute('aria-sort', 'ascending');

  fireEvent.click(within(header).getByRole('button', { name: 'Bill No' }));
  await waitFor(() => expect(lastRequest()).toMatchObject({ sortBy: 'billNo', sortDir: 'desc' }));
  expect(header).toHaveAttribute('aria-sort', 'descending');
  expect(screen.getByRole('columnheader', { name: /Entry Date/ })).toHaveAttribute('aria-sort', 'none');
});

it('combines search, payment type and more filters, and counts the hidden ones', async () => {
  render(<SalesPage />);
  await screen.findByText('PHI-2026-014');

  fireEvent.change(screen.getByLabelText('Search by'), { target: { value: 'patient' } });
  fireEvent.change(screen.getByPlaceholderText('Search patient name'), { target: { value: 'meera' } });
  fireEvent.change(screen.getByLabelText('Payment type'), { target: { value: 'UPI' } });
  fireEvent.click(screen.getByRole('button', { name: 'More filters' }));
  fireEvent.change(screen.getByLabelText('State'), { target: { value: 'FINAL' } });
  fireEvent.change(screen.getByLabelText('Entry by'), { target: { value: 'user-asha' } });

  await waitFor(() =>
    expect(lastRequest()).toMatchObject({ field: 'patient', q: 'meera', paymentMode: 'UPI', state: 'FINAL', entryById: 'user-asha', page: 1 }),
  );
  expect(screen.getByRole('button', { name: 'More filters 2 active' })).toHaveAttribute('aria-expanded', 'true');
  expect(mockReplace).toHaveBeenLastCalledWith(
    '/dashboard/pharmacy/sales?field=patient&q=meera&pay=UPI&state=FINAL&by=user-asha',
    { scroll: false },
  );
});

it('marks an unsaved bill as Draft in place of its number', async () => {
  get.mockResolvedValue(response({ rows: [row({ id: 'PHARMACY_BILL:d', recordId: 'd', billNo: null, state: 'DRAFT' })] }));
  render(<SalesPage />);
  const open = await screen.findByRole('button', { name: 'Open draft bill for Meera Shah' });
  expect(open).toHaveTextContent('Draft');
});

it('links WhatsApp to the patient mobile with the bill details', async () => {
  render(<SalesPage />);
  const link = await screen.findByRole('link', { name: 'Send PHI-2026-014 on WhatsApp' });
  expect(link).toHaveAttribute(
    'href',
    'https://wa.me/919876543210?text=Skin%20Care%20Clinic%0ABill%20No%3A%20PHI-2026-014%0ABill%20Date%3A%2005%20Nov%202026%0AAmount%3A%20%E2%82%B91%2C234.50',
  );
  expect(link).toHaveAttribute('target', '_blank');
});

it('disables WhatsApp when the bill has no mobile number', async () => {
  get.mockResolvedValue(response({ rows: [row({ billNo: 'PHI-2026-015', mobile: null })] }));
  render(<SalesPage />);
  const button = await screen.findByRole('button', { name: 'Send PHI-2026-015 on WhatsApp' });
  expect(button).toHaveAttribute('aria-disabled', 'true');
  expect(screen.queryByRole('link', { name: 'Send PHI-2026-015 on WhatsApp' })).not.toBeInTheDocument();
});

it('explains an empty result and clears the filters from there', async () => {
  get.mockResolvedValue(response({ rows: [], total: 0, totals: { amount: 0, count: 0, excluded: { drafts: 0, cancelled: 0 } } }));
  render(<SalesPage />);
  await screen.findByText('No sales match your search');
  fireEvent.change(screen.getByPlaceholderText('Search bill number'), { target: { value: 'PHI-9' } });
  await waitFor(() => expect(lastRequest()).toMatchObject({ field: 'billNo', q: 'PHI-9' }));

  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

  await waitFor(() => expect(lastRequest()).not.toHaveProperty('q'));
  expect(screen.getByPlaceholderText('Search bill number')).toHaveValue('');
  expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'New sale' })).toHaveLength(2);
});

it('opens the Returns tab from the link and lists returns with refund modes', async () => {
  mockQuery = 'tab=returns';
  get.mockResolvedValue(
    response({ rows: [row({ id: 'SALES_RETURN:r', source: 'SALES_RETURN', recordId: 'r', billNo: 'SR-1', linkedBillNo: 'PHI-2026-007', paymentModes: ['CASH'] })] }),
  );
  render(<SalesPage />);
  expect(await screen.findByText('Against PHI-2026-007')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Returns' })).toHaveAttribute('aria-selected', 'true');
  expect(lastRequest()).toMatchObject({ register: 'returns', from: '2026-04-01', to: '2027-03-31' });
  expect(screen.getByRole('columnheader', { name: 'Refund' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open SR-1' })).toHaveAttribute('href', '/dashboard/inventory?area=sales&view=SALES_RETURN&document=r');
  fireEvent.click(screen.getByRole('button', { name: 'New return' }));
  expect(mockPush.mock.calls[0][0]).toMatch(/^\/dashboard\/inventory\?area=sales&view=SALES_RETURN&new=[0-9a-f]{32}$/);
});

it('pins the total of every matching final bill with what it leaves out', async () => {
  get.mockResolvedValue(response({ total: 136, totals: { amount: 47891, count: 132, excluded: { drafts: 3, cancelled: 1 } } }));
  render(<SalesPage />);
  const total = await screen.findByText(/^Total Amount/);
  expect(total).toHaveTextContent('Total Amount ₹47,891.00 · 132 bills');
  expect(screen.getByText('Excludes 3 drafts and 1 cancelled')).toBeInTheDocument();
  expect(screen.getByText('1–50 of 136')).toBeInTheDocument();
});
