import { formatRupees, renderPharmacyInvoiceHtml } from '@/lib/pharmacy-invoice-print';

it('formats print amounts with Indian grouping and two decimals', () => {
  expect([formatRupees(4554.64), formatRupees(135234.4), formatRupees(-12.5), formatRupees('n/a')]).toEqual(['₹4,554.64', '₹1,35,234.40', '-₹12.50', '₹0.00']);
});

it('escapes every value it prints and heads the bill with the clinic identity', () => {
  const html = renderPharmacyInvoiceHtml(
    {
      invoiceNumber: 'PHI-<1>',
      invoiceDate: '2026-11-05T09:00:00.000Z',
      status: 'COMPLETED',
      billingName: '<img src=x onerror=alert(1)>',
      billingPhone: '98765 43210',
      items: [{ itemType: 'DRUG', drug: { name: 'Gel "A" & B' }, quantity: 2, unitPrice: 2277.32, discountPercent: 0, taxPercent: 12, totalAmount: 4554.64 }],
      subtotal: 4554.64,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 4554.64,
      notes: '</div><script>x()</script>',
    },
    { name: 'Skin & Care', address: 'MG Road', phone: '020 4000', drugLicence: 'DL-20B' },
  );
  expect(html).not.toContain('<img');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(html).toContain('Gel &quot;A&quot; &amp; B');
  expect(html).toContain('<title>Pharmacy Invoice PHI-&lt;1&gt;</title>');
  expect(html).toContain('<div class="clinic-name">Skin &amp; Care</div><div>MG Road</div><div>Phone: 020 4000</div><div>Drug licence: DL-20B</div>');
  expect(html).toContain('<div class="grand"><strong>Grand Total:</strong> ₹4,554.64</div>');
});
