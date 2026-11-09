import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PharmacyInvoiceList } from '@/components/pharmacy/PharmacyInvoiceList';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { getPharmacyInvoices: jest.fn(), get: jest.fn(), delete: jest.fn() } }));

const draft = {
  id: 'draft-1', invoiceNumber: 'SALE-9', invoiceDate: '2026-11-05T06:00:00.000Z', mutationVersion: 2,
  createdAt: '2026-11-05T06:00:00.000Z', status: 'DRAFT', paymentStatus: 'PENDING',
  paymentMethod: 'CASH', patient: { name: 'Sample Patient' }, billingName: 'Sample Patient',
  billingPhone: '', items: [], subtotal: 100, totalAmount: 100, discountAmount: 0, taxAmount: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  (apiClient.getPharmacyInvoices as jest.Mock).mockResolvedValue({ data: [draft], pagination: { page: 1, limit: 10, total: 1, pages: 1 } });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  jest.spyOn(window, 'alert').mockImplementation(() => undefined);
});

it('sends a draft sale to Sales to finish, without confirming or taking payment from the list', async () => {
  render(<PharmacyInvoiceList />);
  expect(await screen.findByRole('link', { name: 'Continue the draft for Sample Patient in Sales' })).toHaveAttribute('href', '/dashboard/pharmacy/sales/bill?draft=draft-1');
  expect(screen.getByTitle('Delete Invoice')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Draft', level: 3 })).toBeInTheDocument();
  expect([
    screen.queryByTitle('Confirm Invoice'),
    screen.queryByTitle('Mark as Paid'),
    screen.queryByTitle('View Invoice'),
    screen.queryByTitle('Download Invoice'),
    screen.queryByText('SALE-9'),
  ]).toEqual([null, null, null, null, null]);
});

it('deletes a draft only at the version the list showed, and shows the plain refusal when it changed', async () => {
  (apiClient.delete as jest.Mock).mockResolvedValueOnce({ message: 'Invoice deleted successfully' });
  render(<PharmacyInvoiceList />);
  fireEvent.click(await screen.findByTitle('Delete Invoice'));
  await waitFor(() => expect(window.alert).toHaveBeenLastCalledWith('Invoice deleted successfully'));
  expect((apiClient.delete as jest.Mock).mock.calls).toEqual([['/pharmacy/invoices/draft-1?version=2']]);

  const message = 'This draft was changed after you opened it. Reload it before discarding.';
  (apiClient.delete as jest.Mock).mockRejectedValueOnce(Object.assign(new Error(message), { status: 409, body: { message } }));
  fireEvent.click(screen.getByTitle('Delete Invoice'));
  await waitFor(() => expect(window.alert).toHaveBeenLastCalledWith(message));
});
