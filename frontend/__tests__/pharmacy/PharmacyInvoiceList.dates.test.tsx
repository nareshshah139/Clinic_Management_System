import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PharmacyInvoiceList } from '@/components/pharmacy/PharmacyInvoiceList';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { getPharmacyInvoices: jest.fn(), get: jest.fn() } }));

it('shows the clinic issue day in the sales list and printed invoice across UTC midnight', async () => {
  const invoice = {
    id: 'sale-1', invoiceNumber: 'SALE-1', invoiceDate: '2026-11-05T20:00:00.000Z',
    createdAt: '2026-11-05T20:00:00.000Z', status: 'COMPLETED', paymentStatus: 'COMPLETED',
    paymentMethod: 'CASH', patient: { name: 'Sample Patient' }, billingName: 'Sample Patient',
    billingPhone: '', items: [], subtotal: 100, totalAmount: 100, discountAmount: 0, taxAmount: 0,
  };
  (apiClient.getPharmacyInvoices as jest.Mock).mockResolvedValue({ data: [invoice], pagination: { page: 1, limit: 10, total: 1, pages: 1 } });
  (apiClient.get as jest.Mock).mockResolvedValue(invoice);
  const write = jest.fn();
  const open = jest.spyOn(window, 'open').mockReturnValue({ document: { open: jest.fn(), write, close: jest.fn() } } as unknown as Window);
  try {
    render(<PharmacyInvoiceList />);
    expect(await screen.findByText('06 Nov 2026', { exact: false })).toHaveTextContent('Date: 06 Nov 2026');
    fireEvent.click(screen.getByTitle('View Invoice'));
    await waitFor(() => expect(write).toHaveBeenCalled());
    const printed = new DOMParser().parseFromString(write.mock.calls[0][0], 'text/html');
    expect(printed.body.textContent).toContain('06 Nov 2026');
    expect(printed.body.textContent).not.toContain('05 Nov 2026');
  } finally {
    open.mockRestore();
  }
});
