import { PrismaClient } from '@prisma/client';
import { localDatabase } from '../../../shared/testing/local-database';
import { InventoryWorkspaceService } from '../inventory-workspace.service';
import { applyMedicineNamePlan, backfillItemSelect, planMedicineNames, planReviewFiles } from '../medicine-name-backfill';
import { searchPrescriptionDrugs } from '../../prescriptions/prescription-drug-search';
import { resolvePrescriptionInventory } from '../../pharmacy/pharmacy-stock-identity';

const databaseTests = process.env.INVENTORY_READ_TEST_DATABASE_URL ? describe : describe.skip;

databaseTests('Standard medicine names backfill with PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let db: PrismaClient;
  let branchId: string, actorId: string;
  const ids: Record<string, string> = {};
  const recorded: [string, string, Record<string, unknown>][] = [
    ['flutas', '13 74 | Flutas 150Mg(Pc)', {}],
    ['zimba', '244 | Zimba Cream', { unit: 'TUBES' }],
    ['bact', '1-Bact Oin', { unit: 'TUBES' }],
    ['cwin', '293 | Cwin Lotion 30Ml', { unit: 'BOTTLES' }],
    ['sotret', '242 | Sotret 10Mg Cap', {}],
    ['antoxid', '1 Antoxid-Hc Capsules 30S (loose capsules)', { genericName: 'Beta carotene + Ascorbic acid + Zinc' }],
    ['acnosis', '199 | Acnosis Tab (loose tablets)', {}],
    ['teczine', '1100 | Teczine Syrup 2.5Mg/5Ml 60Ml', { unit: 'BOTTLES' }],
    ['augmentin', 'Augmentin 500mg 125mg Tab', {}],
    ['cotton', 'Cotton roll', { type: 'CONSUMABLE', unit: 'PACKS' }],
    ['thyronorm', 'Thyronorm 50 Tab', {}],
    ['omega', 'Cap. Omega 3', {}],
    ['uprise', 'Uprise D3 60000 Cap', {}],
    ['sucralfate', 'Sucralfate 1g Tab', {}],
    ['gel', 'Ultrasound Gel 250ml', { type: 'EQUIPMENT', unit: 'BOTTLES' }],
  ];
  const sorted = <T>(rows: T[]) => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const items = () => db.inventoryItem.findMany({ where: { branchId }, select: backfillItemSelect, orderBy: { id: 'asc' } });
  const byKey = async (key: string) => db.inventoryItem.findUniqueOrThrow({ where: { id: ids[key] } });

  beforeAll(async () => {
    fixture = await localDatabase(process.env.INVENTORY_READ_TEST_DATABASE_URL!);
    db = fixture.prisma;
    branchId = (await db.branch.create({ data: { name: 'Synthetic naming clinic', address: 'test' } })).id;
    actorId = (await db.user.create({ data: { branchId, firstName: 'Test', lastName: 'Pharmacist', email: 'names@example.invalid', password: 'no-login', role: 'PHARMACIST' } })).id;
    const flutasDrug = await db.drug.create({ data: { branchId, name: 'Flutas 150', dosageForm: 'Tablet', manufacturerName: 'Synthetic', packSizeLabel: '1 tablet', price: 30 } });
    for (const [key, name, extra] of recorded)
      ids[key] = (await db.inventoryItem.create({
        data: {
          branchId, name, type: 'MEDICINE', unit: 'STRIPS', costPrice: 10, sellingPrice: 20, currentStock: 7, heldStock: 1, packSize: 10, ...extra,
          ...(key === 'flutas' ? { drugs: { connect: { id: flutasDrug.id } } } : {}),
        } as any,
      })).id;
    ids.ready = (await db.inventoryItem.create({ data: { branchId, name: 'Tab. Telma 40 mg', brandName: 'Telma', form: 'TABLET', strength: '40 mg', type: 'MEDICINE', unit: 'STRIPS', costPrice: 10, sellingPrice: 20 } })).id;
  }, 60000);
  afterAll(async () => {
    await fixture?.cleanup();
  });

  it('plans the clinic examples, lists what it cannot read and what lacks a strength', async () => {
    const plan = planMedicineNames((await items()) as any, branchId, actorId);
    const names = Object.fromEntries(plan.changes.map((c) => [c.expected.name, c.next.name]));
    expect(names).toEqual({
      '13 74 | Flutas 150Mg(Pc)': 'Tab. Flutas 150 mg',
      '244 | Zimba Cream': 'Zimba cream',
      '1-Bact Oin': '1-Bact ointment',
      '293 | Cwin Lotion 30Ml': 'Cwin lotion',
      '242 | Sotret 10Mg Cap': 'Cap. Sotret 10 mg',
      '1 Antoxid-Hc Capsules 30S (loose capsules)': 'Cap. Antoxid-HC',
      '199 | Acnosis Tab (loose tablets)': 'Tab. Acnosis',
      '1100 | Teczine Syrup 2.5Mg/5Ml 60Ml': 'Syp. Teczine 2.5mg/5ml',
      'Thyronorm 50 Tab': 'Tab. Thyronorm 50',
      'Cap. Omega 3': 'Cap. Omega 3',
      'Uprise D3 60000 Cap': 'Cap. Uprise D3 60000',
      'Sucralfate 1g Tab': 'Tab. Sucralfate 1 g',
    });
    expect(plan.changes.find((c) => c.id === ids.sucralfate)?.next).toMatchObject({ brandName: 'Sucralfate', strength: '1 g' });
    expect(plan.changes.find((c) => c.id === ids.thyronorm)?.next).toMatchObject({ brandName: 'Thyronorm 50', strength: null });
    expect(plan.unparsed.map((u) => [u.name, u.reason]).sort()).toEqual([['Augmentin 500mg 125mg Tab', 'strength']]);
    expect(plan.notMedicine).toBe(2);
    expect(sorted(plan.missingStrength.map((m) => [m.name, m.recordedName]))).toEqual([
      ['Cap. Omega 3', 'Cap. Omega 3'],
      ['Cap. Uprise D3 60000', 'Uprise D3 60000 Cap'],
      ['Tab. Acnosis', '199 | Acnosis Tab (loose tablets)'],
      ['Tab. Thyronorm 50', 'Thyronorm 50 Tab'],
    ]);
    expect(sorted(plan.needsUnit.map((m) => [m.name, m.recordedName]))).toEqual([
      ['Cap. Uprise D3 60000', 'Uprise D3 60000 Cap'],
      ['Tab. Thyronorm 50', 'Thyronorm 50 Tab'],
    ]);
    expect(plan.changes.some((c) => / mg$/.test(c.next.name) && !/mg/i.test(c.expected.name))).toBe(false);
    expect(plan.alreadyStandard).toBe(1);
  });

  it('writes every rename and the needs-unit list for review before apply', async () => {
    const files = planReviewFiles(planMedicineNames((await items()) as any, branchId, actorId));
    const changes = files['changes.csv'].trim().split('\n');
    expect(changes[0]).toBe('id,recordedName,newName,form,strength,strengthSource');
    expect(changes).toHaveLength(13);
    expect(changes).toContain(`"${ids.thyronorm}","Thyronorm 50 Tab","Tab. Thyronorm 50","TABLET","","none: number without a unit (needs-unit.csv)"`);
    expect(changes).toContain(`"${ids.sucralfate}","Sucralfate 1g Tab","Tab. Sucralfate 1 g","TABLET","1 g","unit stated in recorded name"`);
    expect(changes).toContain(`"${ids.omega}","Cap. Omega 3","Cap. Omega 3","CAPSULE","","none in recorded name"`);
    expect(changes).toContain(`"${ids.antoxid}","1 Antoxid-Hc Capsules 30S (loose capsules)","Cap. Antoxid-HC","CAPSULE","","combination: none printed"`);
    expect(files['needs-unit.csv'].trim().split('\n').slice(1).sort()).toEqual(
      [`"${ids.thyronorm}","Tab. Thyronorm 50","Thyronorm 50 Tab"`, `"${ids.uprise}","Cap. Uprise D3 60000","Uprise D3 60000 Cap"`].sort(),
    );
  });

  it('applies once with an audit per item, then re-applying and re-planning change nothing', async () => {
    const plan = planMedicineNames((await items()) as any, branchId, actorId);
    const rehearsal = await applyMedicineNamePlan(db, plan, { rollback: true });
    expect(rehearsal).toMatchObject({ updated: 12, alreadyApplied: 0, auditEntries: 12, rolledBack: true });
    expect((await byKey('flutas')).name).toBe('13 74 | Flutas 150Mg(Pc)');

    expect(await applyMedicineNamePlan(db, plan)).toMatchObject({ updated: 12, alreadyApplied: 0, auditEntries: 12 });
    expect(await byKey('thyronorm')).toMatchObject({ name: 'Tab. Thyronorm 50', brandName: 'Thyronorm 50', strength: null });
    expect(await byKey('gel')).toMatchObject({ name: 'Ultrasound Gel 250ml', form: null });
    const flutas = await byKey('flutas');
    expect(flutas).toMatchObject({ name: 'Tab. Flutas 150 mg', brandName: 'Flutas', form: 'TABLET', strength: '150 mg', isCombination: false, itemCode: '13 74', currentStock: 7, heldStock: 1, packSize: 10 });
    expect(JSON.parse(flutas.metadata!).nameNormalization).toMatchObject({ aliases: ['13 74 | Flutas 150Mg(Pc)'], recordedName: '13 74 | Flutas 150Mg(Pc)' });
    expect(await byKey('antoxid')).toMatchObject({ name: 'Cap. Antoxid-HC', isCombination: true, itemCode: '1' });
    const after = JSON.stringify(await items());

    expect(await applyMedicineNamePlan(db, plan)).toMatchObject({ updated: 0, alreadyApplied: 12, auditEntries: 12 });
    expect(JSON.stringify(await items())).toBe(after);
    const replan = planMedicineNames((await items()) as any, branchId, actorId);
    expect(replan.changes).toEqual([]);
    expect(replan.alreadyStandard).toBe(13);
    expect(replan.missingStrength.map((m) => m.name).sort()).toEqual(['Cap. Omega 3', 'Cap. Uprise D3 60000', 'Tab. Acnosis', 'Tab. Thyronorm 50']);
    expect(replan.needsUnit.map((m) => m.name).sort()).toEqual(['Cap. Uprise D3 60000', 'Tab. Thyronorm 50']);
  });

  it('rolls back a stale plan without changing anything', async () => {
    const extra = await db.inventoryItem.create({ data: { branchId, name: 'Ketomac Shampoo 60 ml', type: 'MEDICINE', unit: 'BOTTLES', costPrice: 1, sellingPrice: 2 } });
    const plan = planMedicineNames((await items()) as any, branchId, actorId);
    await db.inventoryItem.update({ where: { id: extra.id }, data: { storageLocation: 'B-2' } });
    const before = JSON.stringify(await items());
    await expect(applyMedicineNamePlan(db, plan)).rejects.toThrow('changed after the plan was made');
    expect(JSON.stringify(await items())).toBe(before);
    await db.inventoryItem.delete({ where: { id: extra.id } });
  });

  it('lists exactly the medicines missing a strength in the stock view', async () => {
    const stock = new InventoryWorkspaceService(db as any, { permissions: async () => new Set(['inventory:item:read']) } as any, {} as any);
    const page: any = await stock.stock({ id: actorId, branchId } as any, { missing: 'Strength missing' });
    expect(sorted(page.rows.map((r: any) => [r.productName, r.recordedName, r.strengthMissing]))).toEqual([
      ['Cap. Omega 3', null, true],
      ['Cap. Uprise D3 60000', 'Uprise D3 60000 Cap', true],
      ['Tab. Acnosis', '199 | Acnosis Tab (loose tablets)', true],
      ['Tab. Thyronorm 50', 'Thyronorm 50 Tab', true],
    ]);
    expect(page.quality['Strength missing']).toBe(4);
  });

  it('finds items in the prescription picker by the standard and the recorded name', async () => {
    for (const query of ['Tab. Flutas', '13 74 | Flutas 150Mg(Pc)', 'flutas 150'])
      expect((await searchPrescriptionDrugs(db as any, query, 30, branchId)).map((r: any) => r.name)).toEqual(['Tab. Flutas 150 mg']);
    expect((await searchPrescriptionDrugs(db as any, 'acnosis', 30, branchId)).map((r: any) => [r.name, r.strengthMissing])).toEqual([['Tab. Acnosis', true]]);
    const old = await resolvePrescriptionInventory(db, { drugName: '242 | Sotret 10Mg Cap' }, branchId);
    expect(old?.anchor.id).toBe(ids.sotret);
  });
});
