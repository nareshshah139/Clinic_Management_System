import { formatRupees, printHtml, renderPharmacyInvoiceHtml } from '@/lib/pharmacy-invoice-print';

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
  const html = renderPharmacyInvoiceHtml(bill);
  expect(html).toContain('<strong>Revised:</strong> 10 Nov 2026');
  expect(html).toContain('<div><strong>Item discount:</strong> -₹23.00</div>');
  expect(html).toContain('<div><strong>Bill discount (20%):</strong> -₹61.40</div>');
  expect(html).toContain('<div class="grand"><strong>Grand Total:</strong> ₹282.68</div>');
  const draft = renderPharmacyInvoiceHtml({ ...bill, invoiceNumber: 'DRAFT-9a', status: 'DRAFT', revisedAt: null });
  expect([draft.includes('<title>Draft bill, not a tax invoice</title>'), draft.includes('DRAFT-9a')]).toEqual([true, false]);
});
