import { describePossibleDuplicates, describeItemRequestPayload, hasPossibleDuplicates, isPendingApproval } from './inventory-item-requests';

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

describe('describePossibleDuplicates', () => {
  it('summarises inventory matches and other pending requests', () => {
    const lines = describePossibleDuplicates(
      {
        inventory: [
          { id: 'i1', name: 'Adapalene 0.1% Gel 15g', manufacturer: 'Galderma', unit: 'TUBES', packSize: 15, packUnit: 'g', batchNumber: 'B-1', currentStock: 7, matchedOn: ['name', 'sku'] },
          { id: 'i2', name: 'Adapalene 0.1% Gel 15g', manufacturer: null, unit: 'TUBES', packSize: null, packUnit: null, batchNumber: null, currentStock: 0, matchedOn: ['name'] },
        ],
        pendingRequests: [{ id: 'r2', requestedBy: 'Sunil Rao', createdAt: '2026-11-05T10:00:00Z' }],
      },
      iso => iso.slice(0, 10),
    );
    expect(lines).toEqual({
      inventoryHeading: 'Already in inventory (2 batches)',
      inventory: [
        'Adapalene 0.1% Gel 15g · Galderma · 15 g pack · batch B-1 · 7 in stock · same name, same SKU',
        'Adapalene 0.1% Gel 15g · 0 in stock · same name',
      ],
      pending: ['Also requested by Sunil Rao on 2026-11-05'],
    });
  });

  it('reports no duplicates for empty or missing data', () => {
    expect(hasPossibleDuplicates(null)).toBe(false);
    expect(hasPossibleDuplicates({ inventory: [], pendingRequests: [] })).toBe(false);
  });
});
