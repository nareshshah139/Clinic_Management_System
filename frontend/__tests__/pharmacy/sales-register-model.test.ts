import {
  displayMobile,
  editDiscountAction,
  excludedNote,
  localMobile,
  openHref,
  salesTabHref,
  whatsappAction,
  whatsappMessage,
  type SalesRegisterRow,
} from '@/components/pharmacy/sales/sales-register-model';
import { shortName } from '@/components/register/RegisterGrid';

const row = (overrides: Partial<SalesRegisterRow> = {}): SalesRegisterRow => ({
  id: 'PHARMACY_BILL:1',
  source: 'PHARMACY_BILL',
  recordId: '1',
  billNo: 'PHI-2026-014',
  reservedNo: null,
  state: 'FINAL',
  entryAt: '2026-11-05T09:00:00.000Z',
  billDate: '2026-11-05',
  entryBy: null,
  patientName: 'Meera Shah',
  mobile: '9876543210',
  amount: 4554.64,
  paymentModes: [],
  due: 0,
  refundDue: 0,
  refunded: 0,
  revisedAt: null,
  linkedBillNos: [],
  ...overrides,
});

it('reduces every way staff type an Indian mobile to its ten digits', () => {
  expect(['+91 98765 43210', '0091 98765 43210', '09876543210', '919876543210', '98765-43210'].map(localMobile)).toEqual(
    Array(5).fill('9876543210'),
  );
  expect([localMobile('12345'), localMobile('5876543210'), localMobile(null)]).toEqual([null, null, null]);
  expect(displayMobile('+91-9822012345')).toBe('98220 12345');
  expect(displayMobile('12345')).toBe('12345');
  expect(displayMobile(null)).toBe('—');
});

it('writes a sale message without modes when nothing was paid and with the balance due', () => {
  expect(whatsappMessage(row({ due: 4554.64 }), 'Skin Care Clinic')).toBe(
    'Dear Meera Shah, thank you for visiting Skin Care Clinic. Your pharmacy bill PHI-2026-014 dated 05/11/2026 is ₹4,554.64. Balance due ₹4,554.64.',
  );
});

it('writes a refund message against the original bills', () => {
  const refund = row({ source: 'SALES_RETURN', billNo: 'SR-3', amount: 120, linkedBillNos: ['PHI-2026-007', 'PHI-2026-009'], patientName: null });
  expect(whatsappMessage(refund, 'Skin Care Clinic')).toBe(
    'Dear Customer, Skin Care Clinic has processed a refund of ₹120.00 against bill PHI-2026-007, PHI-2026-009 on 05/11/2026.',
  );
  expect(whatsappMessage({ ...refund, linkedBillNos: [] }, '')).toBe('Dear Customer, our pharmacy has processed a refund of ₹120.00 for return SR-3 on 05/11/2026.');
});

it('refuses WhatsApp for drafts, cancelled bills and unusable numbers', () => {
  expect(whatsappAction(row({ state: 'DRAFT' }), 'C')).toEqual({ reason: 'Finish this draft bill first' });
  expect(whatsappAction(row({ state: 'CANCELLED', source: 'SALES_RETURN' }), 'C')).toEqual({ reason: 'This return is cancelled' });
  expect(whatsappAction(row({ mobile: '12345' }), 'C')).toEqual({ reason: 'Mobile number is not a valid 10-digit number' });
});

it('reopens drafts as Sales bills, opens finished bills in Sales and workspace documents with a way back', () => {
  expect(openHref(row({ state: 'DRAFT', billNo: null, reservedNo: 'PHI-2026-075', recordId: 'inv 7' }), '/x')).toBe('/dashboard/pharmacy/sales/bill?draft=inv+7');
  expect(openHref(row({ recordId: 'inv 8' }), '/x')).toBe('/dashboard/pharmacy/sales/bill?bill=inv+8');
  expect(openHref(row({ source: 'COUNTER_SALE', recordId: 'cs 1' }), salesTabHref('sales', 'q=a&tab=returns'))).toBe(
    '/dashboard/inventory?area=sales&view=COUNTER_SALE&document=cs%201&return=%2Fdashboard%2Fpharmacy%2Fsales%3Fq%3Da',
  );
});

it('says what the total leaves out and shortens staff names', () => {
  expect(excludedNote({ drafts: 1, cancelled: 0 })).toBe('1 draft not included');
  expect(excludedNote({ drafts: 3, cancelled: 1 })).toBe('3 drafts and 1 cancelled not included');
  expect(excludedNote({ drafts: 0, cancelled: 0 })).toBe('');
  expect([shortName('Anil Deshmukh'), shortName(' Priya  Lakshmi Menon '), shortName('Ravi')]).toEqual(['Anil D.', 'Priya M.', 'Ravi']);
});

it('offers Edit discount only on finished pharmacy bills and says why elsewhere', () => {
  expect(
    [
      row({ recordId: 'inv 8' }),
      row({ state: 'DRAFT', billNo: null }),
      row({ state: 'CANCELLED' }),
      row({ source: 'COUNTER_SALE' }),
      row({ source: 'SALES_RETURN' }),
    ].map(editDiscountAction),
  ).toEqual([
    { href: '/dashboard/pharmacy/sales/bill?bill=inv+8&edit=discount' },
    { reason: 'Open the draft to change its discount' },
    { reason: 'Cancelled bills cannot change' },
    { reason: 'Counter sales are corrected in Inventory' },
    { reason: 'Returns have no discount to edit' },
  ]);
});
