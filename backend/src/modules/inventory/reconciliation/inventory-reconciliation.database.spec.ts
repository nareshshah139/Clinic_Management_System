import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { InventoryWorkflowService } from '../inventory-workflow.service';
import { InventoryReconciliationService } from './inventory-reconciliation.service';
import { InventoryWorkspaceService } from '../inventory-workspace.service';

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
    const [count] = await openCounts('anil');
    expect(await reconciliation.todayCards(anil)).toEqual({ due: { counts: 1, items: 2, documentId: count.id }, approvals: null, behind: null });
    const signed = await signAll(anil, count, (line) => (line.inventoryId === 'item-c' ? 7 : 10), 'Three strips of Clobetasol missing');
    expect(signed.status).toBe('AWAITING_APPROVAL');
    expect(await reconciliation.todayCards(anil)).toEqual({ due: null, approvals: null, behind: null });
    expect((await reconciliation.todayCards(doctor))?.approvals).toEqual({ count: 1, netValue: -37.5, shortValue: -37.5, extraValue: 0 });
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
    const approved = page.rows.find((row) => row.state === 'APPROVED')!;
    expect([approved.shortUnits, approved.shortValue, approved.extraUnits, approved.extraValue, approved.selfApproval]).toEqual([-3, -37.5, 2, 25, false]);
    expect(page.totals).toEqual({ counts: 2, differences: 2, approvedValue: -12.5, awaitingValue: 0, rejected: 0 });
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
    expect((await reconciliation.todayCards(doctor))?.approvals).toEqual({ count: 0, netValue: 0, shortValue: 0, extraValue: 0 });
    expect((await reconciliation.todayCards(admin))?.approvals).toEqual({ count: 1, netValue: -50, shortValue: -50, extraValue: 0 });
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

  describe('one open count per batch', () => {
    const onDemand = (who: typeof anil, ids: string[]) =>
      workflow.saveDocument(who, { kind: 'COUNT', reference: 'On-demand count', requestKey: randomUUID(), payload: { reason: 'On-demand stock count', lines: ids.map((inventoryId) => ({ inventoryId, quantity: 0 })) } });
    const fresh = (id: string) => db.inventoryWorkflowDocument.findUniqueOrThrow({ where: { id } });
    const enter = async (who: typeof anil, id: string, counted: (line: any) => number) => {
      const doc = await fresh(id);
      return workflow.saveCountProgress(who, id, { version: doc.version, lines: doc.payload.lines.map((line: any) => ({ id: line.id, physicalStock: counted(line) })) });
    };
    const signSaved = async (who: typeof anil, id: string, note: string) => signAll(who, await fresh(id), (line) => line.physicalStock, note);

    it('applies only the first of two signed counts of one batch: stock 100, shelf 90, stays 90', async () => {
      at('2026-11-02T05:00:00Z');
      await db.inventoryItem.update({ where: { id: 'item-a' }, data: { currentStock: 100 } });
      const first = await onDemand(anil, ['item-a']);
      await enter(anil, first.id, () => 90);
      await signSaved(anil, first.id, 'Ten strips missing');
      const signed = await fresh(first.id);
      const { id: _id, createdAt: _c, updatedAt: _u, ...copy } = signed as any;
      const twin = await db.inventoryWorkflowDocument.create({
        data: {
          ...copy,
          requestKey: 'left-by-the-old-code',
          reference: 'Stock count 02/11/2026 · Meera Kulkarni',
          createdBy: 'meera',
          payload: { ...copy.payload, assigneeId: 'meera', lines: copy.payload.lines.map((line: any) => ({ ...line, id: `${line.id}-twin` })), signOff: { ...copy.payload.signOff, by: 'meera', requestKey: 'twin-sign' } },
        },
      });
      at('2026-11-02T07:00:00Z');
      await reconciliation.decide(doctor, first.id, 'APPROVE', { version: signed.version, requestKey: 'approve-first', reason: 'Physical count signed by Anil Deshmukh on 02/11/2026' });
      expect(await stock('item-a')).toBe(90);
      await expect(reconciliation.decide(admin, twin.id, 'APPROVE', { version: twin.version, requestKey: 'approve-twin', reason: 'Physical count signed by Meera Kulkarni on 02/11/2026' })).rejects.toMatchObject({
        status: 409,
        response: {
          code: 'COUNT_SUPERSEDED',
          message: 'Adapalene Gel 15g, batch B-1, was counted again after this count and that count is already in the stock. Approving this one would apply the difference twice. Reject it instead.',
        },
      });
      expect([await stock('item-a'), (await fresh(twin.id)).status]).toEqual([90, 'AWAITING_APPROVAL']);
    });

    it('does not deal a batch again at the cycle boundary while a count of it is signed or still open', async () => {
      at('2026-11-10T05:00:00Z');
      await reconciliation.ensureToday(branchId, 'scheduler');
      const [mine] = await openCounts('anil');
      await signAll(anil, mine, () => 9, 'One short each');
      at('2026-11-11T05:00:00Z');
      await reconciliation.ensureToday(branchId, 'scheduler');
      const dealt = (await db.inventoryWorkflowDocument.findMany({ where: { branchId, kind: 'COUNT', requestKey: { startsWith: 'cycle:2026-11-11:' } } })).flatMap(batchesOf).sort();
      expect(dealt).toEqual(['item-e', 'item-f']);
    });

    it('does not deal open batches again after a settings change restarts the cycle mid-day', async () => {
      at('2026-11-02T05:00:00Z');
      await reconciliation.ensureToday(branchId, 'scheduler');
      const settings = await workflow.settings(admin);
      await workflow.saveSettings(admin, { version: settings.version, reconciliation: { cycleDays: 7 } });
      await reconciliation.ensureToday(branchId, 'scheduler');
      const dealt = (await db.inventoryWorkflowDocument.findMany({ where: { branchId, kind: 'COUNT', status: 'DRAFT' } })).flatMap(batchesOf).sort();
      expect(dealt).toEqual(['item-a', 'item-b', 'item-c', 'item-d']);
    });

    it('refuses an on-demand count of a batch already on an open count, naming that count', async () => {
      at('2026-11-02T05:00:00Z');
      await reconciliation.ensureToday(branchId, 'scheduler');
      await expect(onDemand(meera, ['item-e', 'item-a'])).rejects.toMatchObject({
        status: 409,
        response: {
          code: 'COUNT_BATCH_OPEN',
          message: "Adapalene Gel 15g, batch B-1, is already on Anil Deshmukh's count of 02/11/2026, not signed yet. Count it there, or ask Anil Deshmukh to sign it off first.",
        },
      });
      await expect(onDemand(anil, ['item-a'])).rejects.toMatchObject({
        response: { message: 'Adapalene Gel 15g, batch B-1, is already on your count of 02/11/2026, not signed yet. Count it there.' },
      });
      const [mine] = await openCounts('anil');
      await signAll(anil, mine, () => 9, 'One short each');
      await expect(onDemand(meera, ['item-a', 'item-c'])).rejects.toMatchObject({
        response: { message: "Adapalene Gel 15g, batch B-1, and 1 more batch are already on Anil Deshmukh's count of 02/11/2026, signed and waiting for approval. Approve or reject that count first." },
      });
      expect((await onDemand(meera, ['item-e'])).status).toBe('DRAFT');
    });

    it('refuses to recount a signed count that is still waiting for approval', async () => {
      at('2026-11-02T05:00:00Z');
      await reconciliation.ensureToday(branchId, 'scheduler');
      const [mine] = await openCounts('anil');
      const signed = await signAll(anil, mine, () => 9, 'One short each');
      await expect(workflow.transition(doctor, mine.id, { action: 'RECOUNT', version: signed.version })).rejects.toMatchObject({ response: { code: 'COUNT_BATCH_OPEN' } });
      expect(await db.inventoryWorkflowDocument.count({ where: { branchId, kind: 'COUNT' } })).toBe(2);
    });

    it('refuses the second sign-off when an older duplicate draft of the batch was signed first', async () => {
      at('2026-11-02T05:00:00Z');
      const first = await onDemand(anil, ['item-a']);
      const { id: _id, createdAt: _c, updatedAt: _u, ...copy } = (await fresh(first.id)) as any;
      const twin = await db.inventoryWorkflowDocument.create({
        data: { ...copy, requestKey: 'old-duplicate', createdBy: 'meera', payload: { ...copy.payload, assigneeId: 'meera', lines: copy.payload.lines.map((line: any) => ({ ...line, id: `${line.id}-twin` })) } },
      });
      await enter(anil, first.id, () => 8);
      await enter(meera, twin.id, () => 8);
      await signSaved(anil, first.id, 'Two short');
      await expect(signSaved(meera, twin.id, 'Two short')).rejects.toMatchObject({ status: 409, response: { code: 'COUNT_BATCH_OPEN' } });
    });

    it('asks to type a count again when the batch was counted and posted after it was entered', async () => {
      at('2026-11-02T05:00:00Z');
      const first = await onDemand(anil, ['item-a']);
      const { id: _id, createdAt: _c, updatedAt: _u, ...copy } = (await fresh(first.id)) as any;
      const twin = await db.inventoryWorkflowDocument.create({
        data: { ...copy, requestKey: 'old-duplicate', createdBy: 'meera', payload: { ...copy.payload, assigneeId: 'meera', lines: copy.payload.lines.map((line: any) => ({ ...line, id: `${line.id}-twin` })) } },
      });
      await enter(meera, twin.id, () => 10);
      at('2026-11-02T06:00:00Z');
      await enter(anil, first.id, () => 10);
      await signSaved(anil, first.id, '');
      at('2026-11-02T07:00:00Z');
      await expect(signSaved(meera, twin.id, '')).rejects.toMatchObject({
        response: { code: 'COUNT_RETYPE', message: 'Type these counts again before signing off: Adapalene Gel 15g. The system quantity they were compared with is out of date.' },
      });
      const detail = await reconciliation.detail(meera, twin.id);
      expect(detail.lines.map((line) => [line.name, line.retype])).toEqual([['Adapalene Gel 15g', true]]);
      expect((await reconciliation.summary(meera)).mine.filter((count) => count.id === twin.id).map((count) => [count.items, count.counted, count.retype])).toEqual([[1, 0, 1]]);
      await enter(meera, twin.id, () => 10);
      expect((await signSaved(meera, twin.id, '')).status).toBe('POSTED');
    });
  });

  it('lists a shelf with whose open count each batch is on, and counts a found box at zero stock', async () => {
    at('2026-11-02T05:00:00Z');
    const workspace = new InventoryWorkspaceService(db as any, workflow, undefined as any);
    for (const [id, place] of [['item-a', 'Rack A2'], ['item-b', 'rack a2'], ['item-c', 'Rack A2'], ['item-d', 'Rack B1'], ['item-g', 'Rack A2']])
      await db.inventoryItem.update({ where: { id }, data: { storageLocation: place } });
    try {
      await reconciliation.ensureToday(branchId, 'scheduler');
      const shelf = await workspace.countPicker(meera, { location: 'RACK A2' });
      expect(shelf.batches.map((b) => [b.name, b.currentStock, b.openCount && [b.openCount.person, b.openCount.day, b.openCount.signed]])).toEqual([
        ['Adapalene Gel 15g', 10, ['Anil Deshmukh', '2026-11-02', false]],
        ['Benzoyl Peroxide 2.5%', 10, [null, '2026-11-02', false]],
        ['Clobetasol Cream 15g', 10, ['Anil Deshmukh', '2026-11-02', false]],
      ]);
      expect([shelf.total, shelf.locations]).toEqual([3, [{ name: 'Rack A2', batches: 3 }, { name: 'Rack B1', batches: 1 }]]);
      const found = await workspace.createCount(meera, { itemIds: ['item-g'], requestKey: 'found-box' });
      expect([found.status, found.payload.lines.map((l: any) => [l.inventoryId, l.systemStock])]).toEqual(['DRAFT', [['item-g', 0]]]);
      await expect(workspace.createCount(meera, { itemIds: ['item-b', 'item-a'], requestKey: 'shelf' })).rejects.toMatchObject({ response: { code: 'COUNT_BATCH_OPEN' } });
    } finally {
      await db.inventoryItem.updateMany({ data: { storageLocation: null } });
    }
  });

  describe('planning', () => {
    it('plans once per IST day and settings revision, and a planning failure still returns the overview', async () => {
      at('2026-11-02T05:00:00Z');
      const staffLookups = jest.spyOn(workflow, 'countStaff');
      await reconciliation.todayCards(anil);
      expect(staffLookups).toHaveBeenCalledTimes(1);
      await reconciliation.todayCards(anil);
      await reconciliation.todayCards(meera);
      expect(staffLookups).toHaveBeenCalledTimes(1);
      const settings = await workflow.settings(admin);
      await workflow.saveSettings(admin, { version: settings.version, reconciliation: { itemsPerPersonPerDay: 3 } });
      staffLookups.mockClear();
      await reconciliation.todayCards(anil);
      expect(staffLookups).toHaveBeenCalledTimes(1);
      expect((await openCounts('anil')).flatMap(batchesOf)).toEqual(['item-a', 'item-c']);
      staffLookups.mockRestore();
      const [count] = await openCounts('anil');
      const failing = jest.spyOn(reconciliation, 'ensureToday').mockRejectedValueOnce(Object.assign(new Error('planner down'), { code: 'P1001' }));
      const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      try {
        expect(await reconciliation.todayCards(anil)).toEqual({ due: { counts: 1, items: 2, documentId: count.id }, approvals: null, behind: null });
        const logged = write.mock.calls.map(([line]) => JSON.parse(String(line)));
        expect(logged.map((line) => [line.event, line.operation, line.outcome, line.databaseCode])).toEqual([['inventory.automation', 'stock_count', 'failed', 'P1001']]);
      } finally {
        write.mockRestore();
        failing.mockRestore();
      }
    });

    it("counts each person's unsigned cycle lines against today's limit", async () => {
      at('2026-11-02T05:00:00Z');
      await reconciliation.ensureToday(branchId, 'scheduler');
      for (const doc of await openCounts('meera')) await signAll(meera, doc, (line) => line.systemStock);
      at('2026-11-03T05:00:00Z');
      await reconciliation.ensureToday(branchId, 'scheduler');
      expect([(await openCounts('anil')).map(batchesOf), (await openCounts('meera')).map(batchesOf)]).toEqual([[['item-a', 'item-c']], [['item-e', 'item-f']]]);
      await configure({ enabled: true, cycleDays: 10, itemsPerPersonPerDay: 3, assigneeIds: ['anil', 'meera'], cycleStart: '2026-11-01' });
      await reconciliation.ensureToday(branchId, 'scheduler');
      expect((await openCounts('anil')).map(batchesOf)).toEqual([['item-a', 'item-c']]);
    });

    it('releases unsigned counts held by someone who can no longer count, and forecasts without them', async () => {
      at('2026-11-02T05:00:00Z');
      await reconciliation.ensureToday(branchId, 'scheduler');
      for (const doc of await openCounts('anil')) await signAll(anil, doc, (line) => line.systemStock);
      const [hers] = await openCounts('meera');
      await db.user.update({ where: { id: 'meera' }, data: { isActive: false } });
      try {
        at('2026-11-03T05:00:00Z');
        await reconciliation.ensureToday(branchId, 'scheduler');
        const released = await db.inventoryWorkflowDocument.findUniqueOrThrow({ where: { id: hers.id }, include: { events: { orderBy: { version: 'asc' } } } });
        expect([released.status, released.events.at(-1)?.action, (released.events.at(-1)?.detail as any).reason]).toEqual([
          'CANCELLED', 'CANCEL', 'Meera Kulkarni can no longer count stock, so these batches went back to the cycle.',
        ]);
        expect((await openCounts('anil')).map(batchesOf)).toEqual([['item-b', 'item-d']]);
        const summary = await reconciliation.summary(admin);
        expect(summary.forecast.message).toBe('At 2 per person per day with 1 person, a 10-day cycle covers all 6 batches in stock.');
      } finally {
        await db.user.update({ where: { id: 'meera' }, data: { isActive: true } });
      }
    });

    it('deals the batch whose last accepted count was signed longest ago first', async () => {
      at('2026-11-02T05:00:00Z');
      await configure({ enabled: true, cycleDays: 10, itemsPerPersonPerDay: 3, assigneeIds: ['anil', 'meera'], cycleStart: '2026-11-01' });
      await db.inventoryItem.update({ where: { id: 'item-a' }, data: { metadata: JSON.stringify({ lastCountAt: '2026-10-30T10:00:00.000Z', lastSignedCountAt: '2026-10-20T10:00:00.000Z', ledgerCheckpoint: { coveredMovementIds: ['m1'] } }) } });
      await db.inventoryItem.update({ where: { id: 'item-b' }, data: { metadata: JSON.stringify({ lastCountAt: '2026-10-25T10:00:00.000Z' }) } });
      await reconciliation.ensureToday(branchId, 'scheduler');
      expect([(await openCounts('anil')).map(batchesOf), (await openCounts('meera')).map(batchesOf)]).toEqual([[['item-c', 'item-e', 'item-a']], [['item-d', 'item-f', 'item-b']]]);
    });

    it('keeps "cycle:" request keys for planned counts', async () => {
      await expect(
        workflow.saveDocument(anil, { kind: 'COUNT', reference: 'Mine', requestKey: 'cycle:2026-11-01:2026-11-02:anil', payload: { reason: 'On-demand stock count', lines: [{ inventoryId: 'item-a', quantity: 0 }] } }),
      ).rejects.toThrow('Request keys starting with "cycle:" are reserved for planned stock counts');
    });
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
