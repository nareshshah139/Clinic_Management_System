import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PharmacyInvoiceList } from '@/components/pharmacy/PharmacyInvoiceList';
import { Toaster } from '@/components/ui/toaster';
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
  const deleteDraft = async () => {
    fireEvent.click(await screen.findByTitle('Delete Invoice'));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete the draft for Sample Patient?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete invoice' }));
  };
  render(<><PharmacyInvoiceList /><Toaster /></>);
  fireEvent.click(await screen.findByTitle('Delete Invoice'));
  fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(apiClient.delete).not.toHaveBeenCalled();

  await deleteDraft();
  expect(await screen.findByText('Deleted the draft for Sample Patient')).toBeInTheDocument();
  expect((apiClient.delete as jest.Mock).mock.calls).toEqual([['/pharmacy/invoices/draft-1?version=2']]);

  const message = 'This draft was changed after you opened it. Reload it before discarding.';
  (apiClient.delete as jest.Mock).mockRejectedValueOnce(Object.assign(new Error(message), { status: 409, body: { message } }));
  await deleteDraft();
  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(screen.getByText('Could not delete the draft for Sample Patient')).toBeInTheDocument();
});

it('offers no view, download or payment for a cancelled draft, which never got a bill number', async () => {
  const cancelled = { ...draft, id: 'draft-2', invoiceNumber: 'DRAFT-4b1d2c3e-0000-4000-8000-000000000000', status: 'CANCELLED' };
  (apiClient.getPharmacyInvoices as jest.Mock).mockResolvedValue({ data: [cancelled], pagination: { page: 1, limit: 10, total: 1, pages: 1 } });
  render(<PharmacyInvoiceList />);
  expect(await screen.findByRole('heading', { name: 'Cancelled draft', level: 3 })).toBeInTheDocument();
  expect([
    screen.queryByTitle('View Invoice'),
    screen.queryByTitle('Download Invoice'),
    screen.queryByTitle('Mark as Paid'),
    screen.queryByText(/DRAFT-4b1d/),
  ]).toEqual([null, null, null, null]);
});
