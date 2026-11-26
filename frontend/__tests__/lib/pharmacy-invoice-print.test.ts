import { billPrintFromInvoice, formatRupees, printHtml, renderPharmacyBillHtml, type PharmacyBillPrint } from '@/lib/pharmacy-invoice-print';

const renderStoredBill = (invoice: any) => renderPharmacyBillHtml(billPrintFromInvoice(invoice));
import twoSlabBill from '../fixtures/two-slab-pharmacy-bill.json';

const TWO_SLAB_GST_TABLE =
  '<table><caption>GST summary</caption><thead><tr><th style="text-align:right">GST %</th><th style="text-align:right">Taxable</th><th style="text-align:right">CGST</th><th style="text-align:right">SGST</th><th style="text-align:right">Total tax</th></tr></thead><tbody><tr><td style="text-align:right">5%</td><td style="text-align:right">₹200.00</td><td style="text-align:right">₹5.00</td><td style="text-align:right">₹5.00</td><td style="text-align:right">₹10.00</td></tr><tr><td style="text-align:right">12%</td><td style="text-align:right">₹250.00</td><td style="text-align:right">₹15.00</td><td style="text-align:right">₹15.00</td><td style="text-align:right">₹30.00</td></tr></tbody></table>';

it('formats print amounts with Indian grouping and two decimals', () => {
  expect([formatRupees(4554.64), formatRupees(135234.4), formatRupees(-12.5), formatRupees('n/a')]).toEqual(['₹4,554.64', '₹1,35,234.40', '-₹12.50', '₹0.00']);
});

it('escapes every value it prints and heads the bill with the clinic identity', () => {
  const html = renderPharmacyBillHtml({
    invoice: {
      invoiceNumber: 'PHI-<1>',
      invoiceDate: '2026-11-05T09:00:00.000Z',
      status: 'COMPLETED',
      subtotal: 4554.64,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 4554.64,
      notes: '</div><script>x()</script>',
    },
    branch: { name: 'Skin & Care', address: 'MG Road', phone: '020 4000', drugLicenseNumber: 'DL-20B' },
    patient: { name: '<img src=x onerror=alert(1)>', phone: '98765 43210' },
    lines: [{ name: 'Gel "A" & B', hsnCode: '<b>3004</b>', quantity: 2, unitPrice: 2277.32, discountPercent: 0, taxPercent: 12, totalAmount: 4554.64 }],
  });
  expect(html).not.toContain('<img');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<b>');
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(html).toContain('Gel &quot;A&quot; &amp; B');
  expect(html).toContain('<title>Pharmacy Invoice PHI-&lt;1&gt;</title>');
  expect(html).toContain('<div class="clinic-name">Skin &amp; Care</div><div>MG Road</div><div>Phone: 020 4000</div><div>Drug licence: DL-20B</div>');
  expect(html).toContain('<div class="grand"><strong>Grand Total:</strong> ₹4,554.64</div>');
});

it('prints each line with HSN, batch and expiry, its GST rate, and the CGST and SGST split per rate', () => {
  const html = renderPharmacyBillHtml(twoSlabBill as PharmacyBillPrint);
  expect(html).toContain('<div>GSTIN: 27ABCDE1234F1Z5 · Drug licence: MH-PZ-20B-1234</div>');
  expect(html).toContain(
    '<tr><td style="text-align:left">Tab. Azithral 500</td><td style="text-align:left">30042019</td><td style="text-align:left">AZ-501 (exp 31 Aug 2027)</td><td style="text-align:center">2</td><td style="text-align:right">₹100.00</td><td style="text-align:right">0%</td><td style="text-align:right">5%</td><td style="text-align:right">₹210.00</td></tr>',
  );
  expect(html).toContain(
    '<tr><td style="text-align:left">Cetaphil cream 100 g</td><td style="text-align:left">33049910</td><td style="text-align:left">CP-77 (exp 31 Mar 2027)</td><td style="text-align:center">1</td><td style="text-align:right">₹250.00</td><td style="text-align:right">0%</td><td style="text-align:right">12%</td><td style="text-align:right">₹280.00</td></tr>',
  );
  expect(html).toContain(TWO_SLAB_GST_TABLE);
  expect(html).toContain('<strong>Copy:</strong> Original');
  expect(html).toContain('<div class="words">Four hundred ninety rupees only</div>');
});

it('prints an interstate bill with IGST in place of CGST and SGST', () => {
  const html = renderPharmacyBillHtml({
    ...(twoSlabBill as PharmacyBillPrint),
    gstSummary: [{ taxPercent: 12, taxableAmount: 250, cgst: 0, sgst: 0, igst: 30, totalTax: 30 }],
  });
  expect(html).toContain(
    '<table><caption>GST summary</caption><thead><tr><th style="text-align:right">GST %</th><th style="text-align:right">Taxable</th><th style="text-align:right">IGST</th><th style="text-align:right">Total tax</th></tr></thead><tbody><tr><td style="text-align:right">12%</td><td style="text-align:right">₹250.00</td><td style="text-align:right">₹30.00</td><td style="text-align:right">₹30.00</td></tr></tbody></table>',
  );
});

describe('printHtml frame lifetime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    document.querySelectorAll('iframe').forEach((frame) => frame.remove());
  });

  const printInto = async (html: string) => {
    const done = printHtml(html);
    const frame = document.querySelector('iframe')!;
    const view = frame.contentWindow!;
    view.focus = jest.fn();
    view.print = jest.fn();
    frame.dispatchEvent(new Event('load'));
    await done;
    return { frame, view };
  };

  it('keeps the frame through afterprint and removes it after 60 seconds', async () => {
    const { frame, view } = await printInto('<p>A</p>');
    view.dispatchEvent(new Event('afterprint'));
    jest.advanceTimersByTime(59_999);
    expect(document.contains(frame)).toBe(true);
    jest.advanceTimersByTime(1);
    expect(document.contains(frame)).toBe(false);
  });

  it('replaces the previous frame on the next print', async () => {
    const first = await printInto('<p>A</p>');
    const second = await printInto('<p>B</p>');
    expect(document.contains(first.frame)).toBe(false);
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    expect(second.frame.srcdoc).toBe('<p>B</p>');
  });
});

it('prints a revised bill with its bill discount and marks a draft as not a tax invoice', () => {
  const bill = {
    invoiceNumber: 'PHI-2026-001',
    status: 'CONFIRMED',
    invoiceDate: '2026-11-09T05:00:00.000Z',
    revisedAt: '2026-11-10T06:00:00.000Z',
    items: [],
    subtotal: 330,
    discountAmount: 84.4,
    billDiscountKind: 'PERCENT',
    billDiscountValue: 20,
    billDiscountAmount: 61.4,
    taxAmount: 37.08,
    totalAmount: 282.68,
  };
  const html = renderStoredBill(bill);
  expect(html).toContain('<strong>Revised:</strong> 10 Nov 2026');
  expect(html).toContain('<div><strong>Item discount:</strong> -₹23.00</div>');
  expect(html).toContain('<div><strong>Bill discount (20%):</strong> -₹61.40</div>');
  expect(html).toContain('<div class="grand"><strong>Grand Total:</strong> ₹282.68</div>');
  const draft = renderStoredBill({ ...bill, invoiceNumber: 'DRAFT-9a', status: 'DRAFT', revisedAt: null });
  expect([draft.includes('<title>Draft bill, not a tax invoice</title>'), draft.includes('DRAFT-9a')]).toEqual([true, false]);
});

it('prints a bill line by the stock name the bill carries, not the catalogue name', () => {
  const html = renderStoredBill({
    invoiceNumber: 'PHI-2026-007', invoiceDate: '2026-11-11T09:00:00.000Z', status: 'CONFIRMED', billingName: 'Meera Shah', billingPhone: '9876543210',
    items: [
      { itemType: 'DRUG', name: 'Tab. Flutas 150 mg', drug: { name: 'Flutas 150' }, quantity: 3, unitPrice: 20, discountPercent: 0, taxPercent: 12, totalAmount: 67.2 },
      { itemType: 'DRUG', drug: { name: 'Sotret 10' }, quantity: 1, unitPrice: 20, discountPercent: 0, taxPercent: 12, totalAmount: 22.4 },
    ],
    subtotal: 80, discountAmount: 0, taxAmount: 9.6, totalAmount: 89.6,
  });
  expect([html.includes('Tab. Flutas 150 mg'), html.includes('Flutas 150<'), html.includes('Sotret 10')]).toEqual([true, false, true]);
});

it('prints a bill priced at MRP with its total as the price and the GST that price includes', () => {
  const html = renderPharmacyBillHtml({
    invoice: { invoiceNumber: 'PHI-2026-188', invoiceDate: '2026-11-26T09:00:00.000Z', status: 'COMPLETED', subtotal: 853.13, discountAmount: 0, taxAmount: 40.63, totalAmount: 853.13 },
    lines: [{ name: 'Tacroz Forte 0.1% Oint', quantity: 1, unitPrice: 853.13, discountPercent: 0, taxPercent: 5, totalAmount: 853.13 }],
    gstSummary: [{ taxPercent: 5, taxableAmount: 812.5, cgst: 20.32, sgst: 20.31, igst: 0, totalTax: 40.63 }],
  });
  expect(html).toContain('<div><strong>Subtotal:</strong> ₹853.13</div>');
  expect(html).not.toContain('<strong>GST:</strong>');
  expect(html).toContain('<div class="grand"><strong>Grand Total:</strong> ₹853.13</div>');
  expect(html).toContain('<div class="words">Includes GST ₹40.63</div>');
});

it('prints a bill saved with GST added on top the way it was charged: subtotal, discount, GST, then the total', () => {
  const html = renderPharmacyBillHtml({
    invoice: {
      invoiceNumber: 'PHI-2026-002', invoiceDate: '2026-11-25T09:00:00.000Z', status: 'COMPLETED', subtotal: 1488.13, discountAmount: 148.81,
      billDiscountKind: 'PERCENT', billDiscountValue: 10, billDiscountAmount: 148.81, taxAmount: 141.26, totalAmount: 1480.58,
    },
    lines: [{ name: 'Tacroz Forte 0.1% Oint', quantity: 1, unitPrice: 853.13, discountPercent: 0, taxPercent: 5, totalAmount: 895.79 }],
  });
  expect(html).toContain('<div><strong>Subtotal:</strong> ₹1,488.13</div>');
  expect(html).toContain('<div><strong>Bill discount (10%):</strong> -₹148.81</div>');
  expect(html).toContain('<div><strong>GST:</strong> ₹141.26</div>');
  expect(html).toContain('<div class="grand"><strong>Grand Total:</strong> ₹1,480.58</div>');
  expect(html).not.toContain('Includes GST');
});

it('prints a discounted bill priced at MRP with its total as the price less the discount and the GST it includes', () => {
  const html = renderPharmacyBillHtml({
    invoice: {
      invoiceNumber: 'PHI-2026-003', invoiceDate: '2026-11-26T09:00:00.000Z', status: 'COMPLETED', subtotal: 1488.13, discountAmount: 148.81,
      billDiscountKind: 'PERCENT', billDiscountValue: 10, billDiscountAmount: 148.81, taxAmount: 123.74, totalAmount: 1339.32,
    },
    lines: [{ name: 'Tacroz Forte 0.1% Oint', quantity: 1, unitPrice: 853.13, discountPercent: 0, taxPercent: 5, totalAmount: 767.82 }],
  });
  expect(html).toContain('<div><strong>Bill discount (10%):</strong> -₹148.81</div>');
  expect(html).not.toContain('<strong>GST:</strong>');
  expect(html).toContain('<div class="grand"><strong>Grand Total:</strong> ₹1,339.32</div>');
  expect(html).toContain('<div class="words">Includes GST ₹123.74</div>');
});
