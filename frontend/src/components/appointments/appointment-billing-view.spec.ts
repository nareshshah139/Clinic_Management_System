import { billingChip } from './appointment-billing-view';

const invoice = (id: string, total: number, received: number) => ({ id, invoiceNo: id, total, received, due: total - received });

describe('the bill chip on an appointment row', () => {
  it('names the amount to collect on a desktop row and adds the total and bill count as the row widens', () => {
    const chip = billingChip(
      { state: 'DUE', total: 1700, received: 1500, due: 200, attention: true, invoices: [invoice('INV-2', 500, 500), invoice('INV-3', 1200, 1000)] },
      'REVIEW',
    );
    expect(chip).toEqual({
      steps: [
        { from: 'phone', text: '₹!' },
        { from: 'narrow', text: '₹200 due' },
        { from: 'wide', text: '₹1,700 · ₹200 due' },
        { from: 'full', text: '₹1,700 · ₹200 due · 2 bills' },
      ],
      text: '₹1,700 · ₹200 due · 2 bills',
      tone: 'due',
      label: 'Review bill: ₹1,700 in 2 bills, ₹200 due',
    });
  });

  it('names a bill with nothing received by its amount due alone, never the same sum twice', () => {
    expect(billingChip({ state: 'DUE', total: 1700, received: 0, due: 1700, attention: true, invoices: [invoice('INV-4', 1700, 0)] }, 'FIRST_CONSULTATION').steps).toEqual([
      { from: 'phone', text: '₹!' },
      { from: 'narrow', text: '₹1,700 due' },
    ]);
  });

  it('shows the paid amount from a desktop row on', () => {
    expect(billingChip({ state: 'PAID', total: 500, received: 500, due: 0, attention: false, invoices: [invoice('INV-1', 500, 500)] }, 'FIRST_CONSULTATION').steps).toEqual([
      { from: 'phone', text: '₹✓' },
      { from: 'narrow', text: 'Paid' },
      { from: 'desk', text: '₹500 · Paid' },
    ]);
  });

  it('says Not billed at every width but a phone, where only a finished visit is flagged', () => {
    expect([
      billingChip({ state: 'NOT_BILLED', total: 0, received: 0, due: 0, attention: true, invoices: [] }, 'PROCEDURE'),
      billingChip({ state: 'NOT_BILLED', total: 0, received: 0, due: 0, attention: false, invoices: [] }),
    ].map((c) => [c.steps, c.tone, c.label])).toEqual([
      [[{ from: 'phone', text: '₹!' }, { from: 'narrow', text: 'Not billed' }], 'unbilled', 'Procedure bill: not billed yet, visit finished'],
      [[{ from: 'phone', text: '' }, { from: 'narrow', text: 'Not billed' }], 'quiet', 'Bill: not billed yet'],
    ]);
  });
});
