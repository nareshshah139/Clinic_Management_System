import { describeItemRequestPayload, isPendingApproval } from './inventory-item-requests';

describe('inventory item request helpers', () => {
  it('recognises only the pending-approval envelope', () => {
    expect(isPendingApproval({ status: 'PENDING_APPROVAL', request: {} })).toBe(true);
    expect(isPendingApproval({ id: 'i1', status: 'ACTIVE' })).toBe(false);
    expect(isPendingApproval(null)).toBe(false);
  });

  it('lists the proposed details a doctor reviews, skipping blanks and false flags', () => {
    expect(
      describeItemRequestPayload({
        name: 'X',
        manufacturer: 'Galderma',
        packSize: 10,
        packUnit: '',
        expiryDate: '2027-03-31T00:00:00.000Z',
        mrp: 160,
        requiresPrescription: true,
        isControlled: false,
      }),
    ).toEqual([
      { label: 'Manufacturer', value: 'Galderma' },
      { label: 'Pack size', value: '10' },
      { label: 'Expiry', value: '2027-03-31' },
      { label: 'MRP', value: '160' },
      { label: 'Prescription only', value: 'Yes' },
    ]);
  });
});
