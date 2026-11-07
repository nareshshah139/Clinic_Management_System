import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { InventoryWorkflowService } from '../inventory-workflow.service';
import { InventoryReconciliationService } from './inventory-reconciliation.service';

const databaseTests = process.env.RECONCILIATION_TEST_DATABASE_URL ? describe : describe.skip;

databaseTests('Stock reconciliation on PostgreSQL', () => {
  const schema = `reconciliation_${randomUUID().replaceAll('-', '')}`;
  const branchId = 'branch';
  const anil = { id: 'anil', branchId, role: 'PHARMACIST' };
  const meera = { id: 'meera', branchId, role: 'PHARMACIST' };
  const doctor = { id: 'priya', branchId, role: 'DOCTOR' };
  const admin = { id: 'asha', branchId, role: 'ADMIN' };
  const reception = { id: 'sunita', branchId, role: 'RECEPTION' };
  let root: PrismaClient;
  let db: PrismaClient;
  let created = false;
  let workflow: InventoryWorkflowService;
  let reconciliation: InventoryReconciliationService;

  const at = (instant: string) => jest.setSystemTime(new Date(instant));
  const stock = async (id: string) => (await db.inventoryItem.findUniqueOrThrow({ where: { id } })).currentStock;
  const openCounts = (assigneeId: string) =>
    db.inventoryWorkflowDocument.findMany({ where: { branchId, kind: 'COUNT', status: 'DRAFT', payload: { path: ['assigneeId'], equals: assigneeId } }, orderBy: { reference: 'asc' } });
  const batchesOf = (doc: { payload: any }) => doc.payload.lines.map((line: any) => line.inventoryId);
  const configure = (reconciliation: Record<string, unknown>) =>
    db.inventoryWorkflowSettings.upsert({
      where: { branchId },
      create: { branchId, settings: { reconciliation } as any, updatedBy: 'asha' },
      update: { settings: { reconciliation } as any, version: { increment: 1 } },
    });
  async function signAll(who: typeof anil, doc: { id: string; version: number; payload: any }, counted: (line: any) => number, note = '') {
    return workflow.signOffCount(who, doc.id, {
      version: doc.version,
      requestKey: randomUUID(),
      note,
      lines: doc.payload.lines.map((line: any) => ({ id: line.id, physicalStock: counted(line) })),
    });
  }
  async function reset() {
    await db.inventoryAudit.deleteMany();
    await db.stockTransaction.deleteMany();
    await db.inventoryWorkflowEffect.deleteMany();
    await db.inventoryWorkflowEvent.deleteMany();
    await db.inventoryWorkflowDocument.deleteMany();
    await db.inventoryItem.updateMany({ data: { currentStock: 10, heldStock: 0, metadata: '{}' } });
    await db.inventoryItem.update({ where: { id: 'item-g' }, data: { currentStock: 0 } });
  }

  beforeAll(async () => {
    const url = new URL(process.env.RECONCILIATION_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Database tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    root = new PrismaClient({ datasourceUrl: url.toString() });
    await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', path.resolve('prisma/schema.prisma')], {
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: url.toString(), PRISMA_GENERATE_SKIP_AUTOINSTALL: '1' },
    });
    db = new PrismaClient({ datasourceUrl: url.toString() });
    await db.branch.create({ data: { id: branchId, name: 'Skin Care Clinic', address: 'Synthetic' } });
    for (const [id, firstName, lastName, role] of [
      ['anil', 'Anil', 'Deshmukh', 'PHARMACIST'],
      ['meera', 'Meera', 'Kulkarni', 'PHARMACIST'],
      ['priya', 'Priya', 'Menon', 'DOCTOR'],
      ['asha', 'Asha', 'Rao', 'ADMIN'],
      ['sunita', 'Sunita', 'Patil', 'RECEPTION'],
    ])
      await db.user.create({ data: { id, firstName, lastName, role: role as any, email: `${id}@example.test`, password: 'x', branchId, permissions: '[]' } });
    for (const [index, name] of ['Adapalene Gel 15g', 'Benzoyl Peroxide 2.5%', 'Clobetasol Cream 15g', 'Doxycycline 100mg', 'Erythromycin Gel', 'Fluconazole 150mg', 'Glycolic Wash'].entries())
      await db.inventoryItem.create({
        data: {
          id: `item-${'abcdefg'[index]}`, branchId, name, type: 'MEDICINE', costPrice: 12.5, sellingPrice: 20, unit: 'STRIPS', currentStock: 10,
          batchNumber: `B-${index + 1}`, expiryDate: new Date('2027-06-30T00:00:00Z'), stockStatus: 'IN_STOCK',
        },
      });
    workflow = new InventoryWorkflowService(db as any);
    reconciliation = new InventoryReconciliationService(db as any, workflow);
    jest.useFakeTimers({
      doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    });
  }, 120000);

  beforeEach(async () => {
    await reset();
    await configure({ enabled: true, cycleDays: 10, itemsPerPersonPerDay: 2, assigneeIds: ['anil', 'meera'], cycleStart: '2026-11-01' });
  });

  afterAll(async () => {
    jest.useRealTimers();
    await db?.$disconnect();
    if (created) await root.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await root?.$disconnect();
  });

  it('deals in-stock batches round-robin by IST day and adds nothing on reruns, even concurrent ones', async () => {
    at('2026-11-01T20:00:00Z');
    expect(await reconciliation.ensureToday(branchId, 'scheduler')).toBe(2);
    await Promise.all([reconciliation.ensureToday(branchId, 'scheduler'), reconciliation.ensureToday(branchId, 'anil'), reconciliation.summary(anil)]);
    const [mine, hers] = [await openCounts('anil'), await openCounts('meera')];
    expect(mine.map((doc) => [doc.requestKey, doc.reference, batchesOf(doc)])).toEqual([['cycle:2026-11-01:2026-11-02:anil', 'Stock count 02/11/2026 · Anil Deshmukh', ['item-a', 'item-c']]]);
    expect(hers.map((doc) => [doc.requestKey, batchesOf(doc)])).toEqual([['cycle:2026-11-01:2026-11-02:meera', ['item-b', 'item-d']]]);
    expect(mine[0].payload).toMatchObject({ origin: 'CYCLE', assigneeId: 'anil', cycle: { start: '2026-11-01', day: '2026-11-02' }, date: '2026-11-02' });
    expect(mine[0].payload.lines.map((line: any) => [line.name, line.systemStock, line.physicalStock])).toEqual([
      ['Adapalene Gel 15g', 10, undefined],
      ['Clobetasol Cream 15g', 10, undefined],
    ]);
  });

  it('covers every in-stock batch over the cycle and starts again on day 11', async () => {
    const dealt: string[][] = [];
    for (const day of ['2026-11-02', '2026-11-03', '2026-11-04']) {
      at(`${day}T05:00:00Z`);
      await reconciliation.ensureToday(branchId, 'scheduler');
      const ids: string[] = [];
      for (const who of [anil, meera])
        for (const doc of await openCounts(who.id)) {
          ids.push(...batchesOf(doc));
          await signAll(who, doc, (line) => line.systemStock);
        }
      dealt.push(ids.sort());
    }
    expect(dealt).toEqual([['item-a', 'item-b', 'item-c', 'item-d'], ['item-e', 'item-f'], []]);
    const summary = await reconciliation.summary(admin);
    expect([summary.cycle, summary.forecast.covered, summary.forecast.remaining]).toEqual([{ start: '2026-11-01', end: '2026-11-10', day: 4, days: 10, daysLeft: 7 }, 6, 0]);
    at('2026-11-11T05:00:00Z');
    expect(await reconciliation.ensureToday(branchId, 'scheduler')).toBe(2);
    expect((await openCounts('anil')).map((doc) => [doc.requestKey, batchesOf(doc)])).toEqual([['cycle:2026-11-11:2026-11-11:anil', ['item-a', 'item-c']]]);
  });

  it('signs a count with no difference straight to posted, and one with a difference to the approval queue', async () => {
    at('2026-11-02T05:00:00Z');
    await reconciliation.ensureToday(branchId, 'scheduler');
    expect(await reconciliation.todayCards(anil)).toEqual({ due: { counts: 1, items: 2 }, approvals: null, behind: null });
    const [count] = await openCounts('anil');
    const signed = await signAll(anil, count, (line) => (line.inventoryId === 'item-c' ? 7 : 10), 'Three strips of Clobetasol missing');
    expect(signed.status).toBe('AWAITING_APPROVAL');
    expect(await reconciliation.todayCards(anil)).toEqual({ due: null, approvals: null, behind: null });
    expect(await reconciliation.todayCards(doctor)).toMatchObject({ approvals: { count: 1, netValue: -37.5 } });
    const detail = await reconciliation.detail(doctor, count.id);
    expect([detail.state, detail.signedBy, detail.signOffNote, detail.differences, detail.netUnits, detail.netValue, detail.can]).toEqual([
      'AWAITING_APPROVAL', { id: 'anil', name: 'Anil Deshmukh' }, 'Three strips of Clobetasol missing', 1, -3, -37.5, { count: false, decide: true, decideOwn: false },
    ]);
    expect([await stock('item-a'), await stock('item-c')]).toEqual([10, 10]);
    const [other] = await openCounts('meera');
    const clean = await signAll(meera, other, (line) => line.systemStock);
    expect(clean.status).toBe('POSTED');
    expect(await db.inventoryAudit.count({ where: { notes: { contains: other.id } } })).toBe(2);
  });

  it('approves as a delta against current stock when a sale happened after the count', async () => {
    at('2026-11-02T05:00:00Z');
    await reconciliation.ensureToday(branchId, 'scheduler');
    const [count] = await openCounts('anil');
    await signAll(anil, count, (line) => (line.inventoryId === 'item-c' ? 7 : 12), 'Clobetasol short, Adapalene over');
    await db.inventoryItem.update({ where: { id: 'item-c' }, data: { currentStock: 6 } });
    const signed = await db.inventoryWorkflowDocument.findUniqueOrThrow({ where: { id: count.id } });
    await reconciliation.decide(doctor, count.id, 'APPROVE', { version: signed.version, requestKey: 'approve-1', reason: 'Physical count signed by Anil Deshmukh on 02/11/2026' });
    expect([await stock('item-a'), await stock('item-c')]).toEqual([12, 3]);
    const movements = await db.stockTransaction.findMany({ where: { branchId }, orderBy: { itemId: 'asc' }, select: { itemId: true, quantityDelta: true, userId: true, reason: true } });
    expect(movements).toEqual([
      { itemId: 'item-a', quantityDelta: 2, userId: 'priya', reason: 'Stock count approved: Physical count signed by Anil Deshmukh on 02/11/2026' },
      { itemId: 'item-c', quantityDelta: -3, userId: 'priya', reason: 'Stock count approved: Physical count signed by Anil Deshmukh on 02/11/2026' },
    ]);
    const page = await reconciliation.register(admin, { from: '2026-04-01', to: '2027-03-31' });
    expect(page.rows.map((row) => [row.reference, row.state, row.signedBy?.name, row.decidedBy?.name, row.differences, row.netUnits, row.netValue])).toEqual([
      ['Stock count 02/11/2026 · Meera Kulkarni', 'ASSIGNED', undefined, undefined, 0, 0, 0],
      ['Stock count 02/11/2026 · Anil Deshmukh', 'APPROVED', 'Anil Deshmukh', 'Priya Menon', 2, -1, -12.5],
    ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  });

  it('rejects without touching stock, and the rejected batches are dealt again the next day', async () => {
    at('2026-11-02T05:00:00Z');
    await reconciliation.ensureToday(branchId, 'scheduler');
    const [count] = await openCounts('anil');
    const signed = await signAll(anil, count, () => 9, 'One strip short on both');
    await reconciliation.decide(admin, count.id, 'REJECT', { version: signed.version, requestKey: 'reject-1', reason: 'Recount the top shelf' });
    expect([await stock('item-a'), await stock('item-c'), await db.stockTransaction.count()]).toEqual([10, 10, 0]);
    for (const doc of await openCounts('meera')) await signAll(meera, doc, (line) => line.systemStock);
    at('2026-11-03T05:00:00Z');
    await reconciliation.ensureToday(branchId, 'scheduler');
    const dealt = [...(await openCounts('anil')), ...(await openCounts('meera'))].flatMap(batchesOf).sort();
    expect(dealt).toEqual(['item-a', 'item-c', 'item-e', 'item-f']);
  });

  it('lets only approvers decide, keeps signers off their own counts, and lists staff who may count', async () => {
    at('2026-11-02T05:00:00Z');
    await configure({ enabled: true, cycleDays: 10, itemsPerPersonPerDay: 2, assigneeIds: ['priya'], cycleStart: '2026-11-01' });
    await reconciliation.ensureToday(branchId, 'scheduler');
    const [count] = await openCounts('priya');
    const signed = await signAll(doctor, count, () => 8, 'Two short each');
    await expect(reconciliation.decide(doctor, count.id, 'APPROVE', { version: signed.version, requestKey: 'own', reason: 'Fine' })).rejects.toMatchObject({
      response: { code: 'COUNT_SEPARATION_OF_DUTIES', message: 'You signed this count, so someone else decides it. Ask Asha Rao.' },
    });
    await expect(reconciliation.decide(anil, count.id, 'APPROVE', { version: signed.version, requestKey: 'pharmacist', reason: 'Fine' })).rejects.toThrow('A doctor or an administrator decides stock count differences');
    expect((await reconciliation.todayCards(doctor))?.approvals).toEqual({ count: 0, netValue: 0 });
    expect((await reconciliation.todayCards(admin))?.approvals).toEqual({ count: 1, netValue: -50 });
    expect((await workflow.countStaff(branchId)).map((person) => person.name)).toEqual(['Anil Deshmukh', 'Asha Rao', 'Meera Kulkarni', 'Priya Menon']);
    await expect(reconciliation.todayCards(reception)).resolves.toBeNull();
  });

  it('reads the old daily-count settings as the cycle settings and drops them on the next save', async () => {
    at('2026-11-06T05:00:00Z');
    await db.inventoryWorkflowSettings.update({ where: { branchId }, data: { settings: { auditEnabled: true, auditDailyCount: 15, auditAdjustmentMode: 'THRESHOLD', approvalValue: 900, negativeCountNeedsApproval: true, ownerId: 'anil' } } });
    const settings = await workflow.settings(admin);
    expect(settings.reconciliation).toMatchObject({ enabled: true, cycleDays: 10, itemsPerPersonPerDay: 15, assigneeIds: ['anil'] });
    expect(['auditEnabled', 'auditDailyCount', 'auditAdjustmentMode', 'approvalValue', 'negativeCountNeedsApproval'].filter((key) => key in settings)).toEqual([]);
    await workflow.saveSettings(admin, { version: settings.version, reconciliation: { itemsPerPersonPerDay: 20, assigneeIds: ['anil', 'meera'] } });
    const stored = (await db.inventoryWorkflowSettings.findUniqueOrThrow({ where: { branchId } })).settings as any;
    expect(Object.keys(stored).filter((key) => key.startsWith('audit') || key === 'approvalValue' || key === 'negativeCountNeedsApproval')).toEqual([]);
    expect(stored.reconciliation).toMatchObject({ enabled: true, cycleDays: 10, itemsPerPersonPerDay: 20, assigneeIds: ['anil', 'meera'] });
    await expect(workflow.saveSettings(admin, { version: settings.version + 1, reconciliation: { assigneeIds: ['sunita'] } })).rejects.toThrow(
      'Each person who counts must be an active member of this branch with stock reconciliation access',
    );
  });

  it('forecasts a short cycle in plain words for whoever configures it', async () => {
    at('2026-11-02T05:00:00Z');
    await configure({ enabled: true, cycleDays: 2, itemsPerPersonPerDay: 1, assigneeIds: ['anil'], cycleStart: '2026-11-02' });
    const summary = await reconciliation.summary(admin);
    expect(summary.forecast.message).toBe('At 1 per person per day with 1 person, a 2-day cycle covers 2 of 6 batches in stock. Raise items per day to 3 or add 2 people.');
    expect((await reconciliation.todayCards(admin))?.behind).toEqual({ remaining: 6, message: summary.forecast.message });
    expect((await reconciliation.todayCards(anil))?.behind).toBeNull();
  });
});
