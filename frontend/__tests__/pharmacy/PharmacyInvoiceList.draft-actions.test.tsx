import { render, screen } from '@testing-library/react';
import { PharmacyInvoiceList } from '@/components/pharmacy/PharmacyInvoiceList';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { getPharmacyInvoices: jest.fn(), get: jest.fn() } }));

it('sends a draft sale to Sales to finish, without confirming or taking payment from the list', async () => {
  const draft = {
    id: 'draft-1', invoiceNumber: 'SALE-9', invoiceDate: '2026-11-05T06:00:00.000Z',
    createdAt: '2026-11-05T06:00:00.000Z', status: 'DRAFT', paymentStatus: 'PENDING',
    paymentMethod: 'CASH', patient: { name: 'Sample Patient' }, billingName: 'Sample Patient',
    billingPhone: '', items: [], subtotal: 100, totalAmount: 100, discountAmount: 0, taxAmount: 0,
  };
  (apiClient.getPharmacyInvoices as jest.Mock).mockResolvedValue({ data: [draft], pagination: { page: 1, limit: 10, total: 1, pages: 1 } });
  render(<PharmacyInvoiceList />);
  expect(await screen.findByRole('link', { name: 'Continue draft SALE-9 in Sales' })).toHaveAttribute('href', '/dashboard/pharmacy/sales/bill?draft=draft-1');
  expect(screen.getByTitle('Delete Invoice')).toBeInTheDocument();
  expect([screen.queryByTitle('Confirm Invoice'), screen.queryByTitle('Mark as Paid')]).toEqual([null, null]);
});
