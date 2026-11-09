import { billHref, billPayload, draftProblem, legacyBillingRedirect, type BillFields } from '@/components/pharmacy/sales/sales-bill-model';

const query = (search: string) => new URLSearchParams(search);

it('sends every old Pharmacy Billing address to a Sales bill with the same prefill', () => {
  expect([
    legacyBillingRedirect('/dashboard/pharmacy', query('section=billing&patientId=p-1&prescriptionId=rx 1&doctorId=d-1&visitId=v-1')),
    legacyBillingRedirect('/dashboard/pharmacy', query('section=billing')),
    legacyBillingRedirect('/dashboard/pharmacy', query('tab=invoices')),
    legacyBillingRedirect('/dashboard/pharmacy', query('patientId=p-1&visitId=v-1')),
    legacyBillingRedirect('/dashboard/pharmacy', query('section=counter&prescriptionId=rx-2')),
  ]).toEqual([
    '/dashboard/pharmacy/sales/bill?patientId=p-1&prescriptionId=rx+1&doctorId=d-1&visitId=v-1',
    '/dashboard/pharmacy/sales/bill',
    '/dashboard/pharmacy/sales/bill',
    '/dashboard/pharmacy/sales/bill?patientId=p-1&visitId=v-1',
    '/dashboard/pharmacy/sales/bill?prescriptionId=rx-2',
  ]);
});

it('leaves Desk, Counter and other pages where they are', () => {
  expect([
    legacyBillingRedirect('/dashboard/pharmacy', query('')),
    legacyBillingRedirect('/dashboard/pharmacy', query('section=desk')),
    legacyBillingRedirect('/dashboard/pharmacy', query('section=counter')),
    legacyBillingRedirect('/dashboard/pharmacy/sales', query('patientId=p-1')),
  ]).toEqual([null, null, null, null]);
});

it('links a draft by id alone, ignoring prefill', () => {
  expect(billHref({ draft: 'inv 9', prefill: { patientId: 'p-1' } })).toBe('/dashboard/pharmacy/sales/bill?draft=inv+9');
});

const fields: BillFields = {
  patientId: 'p-1', doctorId: '', prescriptionId: '', paymentMethod: 'CASH', billingName: 'Meera Shah', billingPhone: '9876543210',
  billingAddress: '', billingCity: '', billingState: '', billingPincode: '', notes: '',
};
const line = { itemType: 'DRUG' as const, drugId: 'drug-1', quantity: 2, unitPrice: 50, discountPercent: 10, taxPercent: 12 as number | null, drug: { name: 'Synthetic Cream' } };

it('says what stops a draft from being saved, one problem at a time', () => {
  expect([
    draftProblem({ ...fields, patientId: '' }, [line]),
    draftProblem(fields, []),
    draftProblem(fields, [{ ...line, drugId: 'temp_rx_0', drug: { name: 'Unmatched cream' } }]),
    draftProblem(fields, [{ ...line, taxPercent: null }]),
    draftProblem(fields, [line]),
  ]).toEqual([
    'Select a patient before saving the draft.',
    'Add at least one medicine before saving the draft.',
    'Choose a stocked product for Unmatched cream or remove it before saving the draft.',
    'Enter Tax % for Synthetic Cream before saving the draft.',
    null,
  ]);
});

it('sends only the bill fields and line values the server stores', () => {
  expect(billPayload(fields, [{ ...line, inventoryItemId: 'batch-1', dosage: 'thin layer' }]).items).toEqual([
    {
      drugId: 'drug-1', inventoryItemId: 'batch-1', packageId: undefined, itemType: 'DRUG', quantity: 2, unitPrice: 50, discountPercent: 10,
      taxPercent: 12, dosage: 'thin layer', frequency: undefined, duration: undefined, instructions: undefined,
    },
  ]);
});
