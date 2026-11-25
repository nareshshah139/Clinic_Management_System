import { downloadClinicReceipt, renderClinicReceiptHtml } from '@/components/billing/clinic-receipt';
import type { ClinicReceipt } from '@/components/billing/clinic-bill-model';

const mockSet = jest.fn();
jest.mock('html2pdf.js', () => ({ __esModule: true, default: () => ({ set: mockSet }) }));

const receipt = (over: Partial<ClinicReceipt['bill']> = {}): ClinicReceipt => ({
  bill: {
    id: 'cb2',
    billNo: 'INV-20261125-002',
    billedAt: '2026-11-25T04:30:00.000Z',
    patient: { id: 'p2', name: 'Ravi <Kumar>', phone: '9000000002' },
    doctor: { id: 'd1', name: 'Priya Menon' },
    kind: 'PROCEDURE',
    amount: 2500,
    paid: 800,
    due: 1700,
    refunded: 200,
    status: 'PARTIALLY_PAID',
    voidReason: null,
    ...over,
  },
  clinic: { name: 'Lakshmi Family Clinic', address: '12 MG Road, Hyderabad', phone: '040 2345 6789', gstin: '36ABCDE1234F1Z5' },
  notes: null,
  items: [
    { id: 'i1', name: 'Procedure: Chemical peel', qty: 1, unitPrice: 2000, discount: 0, gstRate: 0, total: 2000 },
    { id: 'i2', name: 'Dressing', qty: 2, unitPrice: 250, discount: 0, gstRate: 0, total: 500 },
  ],
  payments: [
    { id: 'pay1', amount: 1000, mode: 'UPI', reference: null, paidAt: '2026-11-25T05:00:00.000Z' },
    { id: 'pay2', amount: -200, mode: 'UPI', reference: 'REFUND: Goodwill', paidAt: '2026-11-25T06:00:00.000Z' },
  ],
});

const text = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent!.replace(/\s+/g, ' ');

it('prints the clinic, patient, doctor, every line and payment, and what is paid and still due', () => {
  const page = text(renderClinicReceiptHtml(receipt()));
  expect(page).toContain('Lakshmi Family Clinic12 MG Road, HyderabadPhone: 040 2345 6789GSTIN: 36ABCDE1234F1Z5');
  expect(page).toContain('ReceiptPart paid');
  expect(page).toContain('Bill NoINV-20261125-002Date25 Nov 2026DoctorPriya MenonForProcedure');
  expect(page).toContain('PatientRavi <Kumar>Mobile9000000002');
  expect(page).toContain('Procedure: Chemical peel1₹2,000.00₹2,000.00Dressing2₹250.00₹500.00');
  expect(page).toContain('Total₹2,500.00 Paid₹800.00 Refunded₹200.00 Balance due₹1,700.00');
  expect(page).toContain('25 Nov 2026, 10:30 amUPI₹1,000.00');
  expect(page).toContain('Refund · UPIREFUND: Goodwill-₹200.00');
});

it('escapes stored text instead of running it', () => {
  const html = renderClinicReceiptHtml(receipt({ patient: { id: 'p', name: '<img src=x onerror=alert(1)>', phone: null } }));
  expect(html).not.toContain('<img src=x');
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
});

it('says a void bill is void and why, with nothing due', () => {
  const page = text(renderClinicReceiptHtml(receipt({ status: 'CANCELLED', paid: 0, due: 0, refunded: 0, voidReason: 'Booked twice' })));
  expect(page).toContain('ReceiptVoid');
  expect(page).toContain('Balance due₹0.00');
  expect(page).toContain('This bill is void. Reason: Booked twice');
});

it('saves the PDF under a clinic receipt name, not a pharmacy invoice name', async () => {
  const save = jest.fn().mockResolvedValue(undefined);
  mockSet.mockReturnValue({ from: () => ({ save }) });
  await downloadClinicReceipt(receipt({ patient: { id: 'p2', name: 'Ravi Kumar', phone: null } }));
  expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ filename: 'Clinic receipt INV-20261125-002 - Ravi Kumar - 2026-11-25.pdf' }));
  expect(save).toHaveBeenCalledTimes(1);
});
