import { InventoryWorkflowService } from '../inventory-workflow.service';

const actor = { id: 'operator', branchId: 'branch', role: 'OWNER' };

describe('Inventory workflow business dates', () => {
  let saved: any[];
  let service: InventoryWorkflowService;

  beforeEach(() => {
    saved = [];
    const tx: any = {
      inventoryWorkflowDocument: {
        findUnique: async () => null,
        create: async ({ data }: any) => {
          const doc = {
            id: `doc-${saved.length}`,
            version: 1,
            status: 'DRAFT',
            ...data,
          };
          saved.push(doc);
          return doc;
        },
      },
      inventoryWorkflowEvent: { create: async () => ({}) },
      inventoryItem: { findMany: async () => [] },
      stockTransaction: { findMany: async () => [] },
    };
    tx.$transaction = (run: any) => run(tx);
    service = new InventoryWorkflowService(tx);
    jest.spyOn(service, 'permissions').mockResolvedValue(new Set(['*']));
    jest.useFakeTimers({
      now: new Date('2026-10-24T20:00:00.000Z'),
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'queueMicrotask',
      ],
    });
  });

  afterEach(() => jest.useRealTimers());

  const save = (date?: unknown) =>
    service.saveDocument(actor, {
      kind: 'COUNTER_SALE',
      reference: `CS-${saved.length}`,
      requestKey: `request-${String(date)}`,
      payload: { lines: [], ...(date === undefined ? {} : { date }) },
    } as any);

  it('stores the clinic day, defaulting to today in Asia/Kolkata and reading timestamps in clinic time', async () => {
    for (const date of [
      undefined,
      '',
      ' 2026-10-24 ',
      '2026-10-24T19:00:00.000Z',
      '2026-10-24T10:00:00',
    ])
      await save(date);
    expect(saved.map((doc) => doc.payload.date)).toEqual([
      '2026-10-25',
      '2026-10-25',
      '2026-10-24',
      '2026-10-25',
      '2026-10-24',
    ]);
  });

  it.each(['2026-02-30', '24/10/2026', '2026-02-30T10:00:00'])(
    'rejects %s without saving it',
    async (date) => {
      await expect(save(date)).rejects.toThrow(
        'Document date must be a calendar day such as 2026-04-01',
      );
      expect(saved.length).toBe(0);
    },
  );
});
