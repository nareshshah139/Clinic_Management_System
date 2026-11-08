import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PharmacyInvoiceList } from '@/components/pharmacy/PharmacyInvoiceList';
import { apiClient } from '@/lib/api';
import { downloadInvoicePdf } from '@/lib/download-invoice-pdf';

jest.mock('@/lib/api', () => ({ apiClient: { getPharmacyInvoices: jest.fn(), get: jest.fn() } }));
jest.mock('@/lib/download-invoice-pdf', () => ({ downloadInvoicePdf: jest.fn().mockResolvedValue(undefined) }));

it('downloads the fetched invoice without opening a pop-up', async () => {
  const invoice = { id: 'sale-1', invoiceNumber: 'SALE-1', invoiceDate: '2026-11-05T20:00:00Z', createdAt: '2026-11-05T20:00:00Z', status: 'COMPLETED', paymentStatus: 'COMPLETED', paymentMethod: 'CASH', patient: { name: 'Sample Patient <img src=x onerror=alert(1)>' }, billingName: 'Sample Patient', items: [], subtotal: 100, totalAmount: 100, discountAmount: 0, taxAmount: 0 };
  jest.mocked(apiClient.getPharmacyInvoices).mockResolvedValue({ data: [invoice], pagination: { page: 1, limit: 10, total: 1, pages: 1 } } as any);
  jest.mocked(apiClient.get).mockResolvedValue(invoice as any);
  const open = jest.spyOn(window, 'open');
  try {
    render(<PharmacyInvoiceList />);
    fireEvent.click(await screen.findByTitle('Download Invoice'));
    await waitFor(() => expect(downloadInvoicePdf).toHaveBeenCalled());
    const [source, number] = jest.mocked(downloadInvoicePdf).mock.calls[0];
    expect(number).toBe('SALE-1');
    expect(source.body.textContent).toContain('Sample Patient <img src=x onerror=alert(1)>');
    expect(source.body.querySelector('img')).toBeNull();
    expect(open).not.toHaveBeenCalled();
  } finally { open.mockRestore(); }
});
