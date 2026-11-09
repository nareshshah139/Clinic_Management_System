import { render, screen } from '@testing-library/react';
import { PharmacyInvoiceList } from '@/components/pharmacy/PharmacyInvoiceList';
import { apiClient } from '@/lib/api';

let mockQuery = '';
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mockQuery) }));
jest.mock('@/lib/api', () => ({ apiClient: { getPharmacyInvoices: jest.fn(), get: jest.fn() } }));

const older = {
  id: 'draft-1', invoiceNumber: 'PHI-2026-075', invoiceDate: '2026-10-02T04:00:00.000Z',
  createdAt: '2026-10-02T04:00:00.000Z', status: 'DRAFT', paymentStatus: 'PENDING',
  paymentMethod: 'CASH', patient: { name: 'Meera Shah' }, billingName: 'Meera Shah',
  billingPhone: '', items: [], subtotal: 100, totalAmount: 100, discountAmount: 0, taxAmount: 0,
};
const calls = () => (apiClient.getPharmacyInvoices as jest.Mock).mock.calls.map(([params]) => params);

beforeEach(() => {
  jest.clearAllMocks();
  (apiClient.getPharmacyInvoices as jest.Mock).mockResolvedValue({ data: [older], pagination: { page: 1, limit: 20, total: 1, pages: 1 } });
});
afterEach(() => { mockQuery = ''; });

it('opened with ?search=, shows that text in the box and lists the bill from any date', async () => {
  mockQuery = 'search=PHI-2026-075';
  render(<PharmacyInvoiceList />);
  expect(await screen.findByText('PHI-2026-075')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Invoice number, patient...')).toHaveValue('PHI-2026-075');
  expect(calls()[0]).toMatchObject({ search: 'PHI-2026-075' });
  expect(calls()[0]).not.toHaveProperty('startDate');
});

it('opened without a search, still starts from today', async () => {
  render(<PharmacyInvoiceList />);
  await screen.findByText('PHI-2026-075');
  expect(calls()[0]).toHaveProperty('startDate');
  expect(calls()[0]).not.toHaveProperty('search');
});
