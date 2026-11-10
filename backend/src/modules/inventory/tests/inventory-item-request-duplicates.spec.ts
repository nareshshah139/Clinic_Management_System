import { InventoryItemRequestService } from '../inventory-item-request.service';
import { normalizeItemName } from '../inventory-item-request-duplicates';

const doctor = { id: 'doc-1', branchId: 'b1', role: 'DOCTOR' };
const reception = { id: 'rec-1', branchId: 'b1', role: 'RECEPTION' };

const gel = {
  id: 'item-gel',
  name: 'Adapalene 0.1% Gel 15g',
  manufacturer: 'Galderma',
  unit: 'TUBES',
  packSize: 15,
  packUnit: 'g',
  batchNumber: 'B-1',
  currentStock: 7,
  sku: 'ADA-15',
  barcode: null,
};

const pendingRow = (id: string, itemName: string, first = 'Rita') => ({
  id,
  itemName,
  createdAt: new Date('2026-11-05T10:00:00Z'),
  requestedBy: { firstName: first, lastName: 'Rao' },
});

const requestRow = (id: string, itemName: string, sku?: string) => ({
  id,
  branchId: 'b1',
  status: 'PENDING',
  itemName,
  payload: { name: itemName, ...(sku ? { sku } : {}) },
  requestedBy: { id: 'rec-1', firstName: 'Rita', lastName: 'Rao' },
  reviewedBy: null,
  createdAt: new Date('2026-11-06T10:00:00Z'),
});

function build(opts: { items?: any[]; pending?: any[]; requests?: any[] } = {}) {
  const prisma: any = {
    inventoryItem: { findMany: jest.fn(async () => opts.items ?? []) },
    inventoryItemRequest: {
      findMany: jest.fn(async (args: any) =>
        args.select ? opts.pending ?? [] : opts.requests ?? [],
      ),
      create: jest.fn(async ({ data }: any) => ({
        id: 'req-new',
        status: 'PENDING',
        createdAt: new Date('2026-11-07T10:00:00Z'),
        requestedBy: { id: 'rec-1', firstName: 'Rita', lastName: 'Rao' },
        reviewedBy: null,
        ...data,
      })),
    },
  };
  const inventory: any = { assertItemIdentifiersFree: jest.fn() };
  return { service: new InventoryItemRequestService(prisma, inventory), prisma };
}

describe('normalizeItemName', () => {
  it.each([
    ['Adapalene 0.1% Gel 15g', 'adapalene 0.1% gel 15g'],
    ['  ADAPALENE   0.1%\tGel  15g ', 'adapalene 0.1% gel 15g'],
    ['Cetaphil\nCleanser', 'cetaphil cleanser'],
    ['', ''],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeItemName(input)).toBe(expected);
  });
});

describe('possible duplicates on the review list', () => {
  it('flags an existing item whose name differs only by case and spacing', async () => {
    const { service } = build({
      items: [gel],
      requests: [requestRow('r1', '  adapalene 0.1%   GEL 15g')],
    });
    const [row] = (await service.list(doctor, 'PENDING')) as any[];
    expect(row.possibleDuplicates).toEqual({
      inventory: [
        {
          id: 'item-gel',
          name: 'Adapalene 0.1% Gel 15g',
          manufacturer: 'Galderma',
          unit: 'TUBES',
          packSize: 15,
          packUnit: 'g',
          batchNumber: 'B-1',
          currentStock: 7,
          matchedOn: ['name'],
        },
      ],
      pendingRequests: [],
    });
  });

  it('does not flag a different strength or pack size that merely shares the first word', async () => {
    const { service } = build({
      items: [{ ...gel, name: 'Adapalene 0.3% Gel 15g', sku: null }],
      requests: [requestRow('r1', 'Adapalene 0.1% Gel 15g')],
    });
    const [row] = (await service.list(doctor, 'PENDING')) as any[];
    expect(row.possibleDuplicates).toEqual({ inventory: [], pendingRequests: [] });
  });

  it('flags another pending request with the same name but not the request itself', async () => {
    const { service } = build({
      requests: [requestRow('r1', 'Cetaphil Cleanser 125ml'), requestRow('r2', 'cetaphil  cleanser 125ML')],
      pending: [
        pendingRow('r1', 'Cetaphil Cleanser 125ml', 'Rita'),
        pendingRow('r2', 'cetaphil  cleanser 125ML', 'Sunil'),
        pendingRow('r3', 'Something else'),
      ],
    });
    const rows = (await service.list(doctor, 'PENDING')) as any[];
    expect(rows[0].possibleDuplicates.pendingRequests).toEqual([
      { id: 'r2', requestedBy: 'Sunil Rao', createdAt: new Date('2026-11-05T10:00:00Z') },
    ]);
    expect(rows[1].possibleDuplicates.pendingRequests).toEqual([
      { id: 'r1', requestedBy: 'Rita Rao', createdAt: new Date('2026-11-05T10:00:00Z') },
    ]);
  });

  it('flags an existing item that already holds the requested SKU under another name', async () => {
    const { service } = build({
      items: [gel],
      requests: [requestRow('r1', 'Differin Gel 15g', 'ADA-15')],
    });
    const [row] = (await service.list(doctor, 'PENDING')) as any[];
    expect(row.possibleDuplicates.inventory.map((i: any) => [i.id, i.matchedOn])).toEqual([
      ['item-gel', ['sku']],
    ]);
  });

  it('flags a barcode collision', async () => {
    const { service, prisma } = build({
      items: [{ ...gel, name: 'Other', sku: null, barcode: '8901' }],
      requests: [{ ...requestRow('r1', 'Differin Gel'), payload: { name: 'Differin Gel', barcode: '8901' } }],
    });
    const [row] = (await service.list(doctor, 'PENDING')) as any[];
    expect(row.possibleDuplicates.inventory.map((i: any) => i.matchedOn)).toEqual([['barcode']]);
    expect(prisma.inventoryItem.findMany.mock.calls[0][0].where.OR).toContainEqual({
      barcode: { in: ['8901'] },
    });
  });

  it('scopes both lookups to the actor branch', async () => {
    const { service, prisma } = build({ requests: [requestRow('r1', 'X Item')] });
    await service.list(doctor, 'PENDING');
    expect(prisma.inventoryItem.findMany.mock.calls[0][0].where.branchId).toBe('b1');
    expect(prisma.inventoryItemRequest.findMany.mock.calls[1][0].where).toEqual({
      branchId: 'b1',
      status: 'PENDING',
    });
  });

  it('uses one inventory query and one pending query for a page of requests', async () => {
    const { service, prisma } = build({
      requests: [requestRow('r1', 'Alpha 10mg'), requestRow('r2', 'Beta 5mg'), requestRow('r3', 'Gamma Gel')],
    });
    await service.list(doctor, 'PENDING');
    expect(prisma.inventoryItem.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryItemRequest.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.inventoryItem.findMany.mock.calls[0][0].where.OR).toEqual([
      { name: { contains: 'alpha', mode: 'insensitive' } },
      { name: { contains: 'beta', mode: 'insensitive' } },
      { name: { contains: 'gamma', mode: 'insensitive' } },
    ]);
  });

  it('skips duplicate lookups when no request is pending', async () => {
    const { service, prisma } = build({
      requests: [{ ...requestRow('r1', 'Alpha'), status: 'APPROVED' }],
    });
    const [row] = (await service.list(doctor)) as any[];
    expect(row.possibleDuplicates).toBeNull();
    expect(prisma.inventoryItem.findMany).not.toHaveBeenCalled();
  });

  it('does not expose other users requests or inventory matches to staff on the list', async () => {
    const { service, prisma } = build({ requests: [requestRow('r1', 'Alpha')] });
    const [row] = (await service.list(reception, 'PENDING')) as any[];
    expect(row.possibleDuplicates).toBeNull();
    expect(prisma.inventoryItem.findMany).not.toHaveBeenCalled();
  });
});

describe('possible duplicates on a staff submission', () => {
  it('returns the existing inventory match with the queued request', async () => {
    const { service } = build({ items: [{ ...gel, name: 'Adapalene 0.1% gel' }] });
    const outcome: any = await service.createOrRequest(
      { name: 'ADAPALENE 0.1% Gel  15g', brandName: 'ADAPALENE  0.1%', form: 'GEL', type: 'MEDICINE', unit: 'TUBES' } as any,
      reception,
    );
    expect(outcome.created).toBe(false);
    expect(outcome.request.possibleDuplicates.inventory.map((i: any) => i.id)).toEqual(['item-gel']);
  });

  it('returns empty duplicates for a genuinely new name', async () => {
    const { service } = build();
    const outcome: any = await service.createOrRequest(
      { name: 'Brand New Serum', form: 'SERUM', type: 'MEDICINE', unit: 'BOTTLES' } as any,
      reception,
    );
    expect(outcome.request.possibleDuplicates).toEqual({ inventory: [], pendingRequests: [] });
  });
});
