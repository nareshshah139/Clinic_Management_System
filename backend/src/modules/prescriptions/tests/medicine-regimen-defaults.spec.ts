import { medicineRegimenDefaults } from '../medicine-regimen-defaults';
import { PrescriptionsController } from '../prescriptions.controller';

const now = new Date('2026-09-27T12:00:00Z');
const name = 'Fucibet cream';
const item = (values = {}) => ({ drugName: name, duration: 10, durationUnit: 'DAYS', frequency: 'TWICE_DAILY', dosePattern: '1-0-1', timing: 'AM/PM', instructions: 'on the rash', ...values });
const rx = (id: string, values = {}, doctorId = 'doctor', date = '2026-09-01') => ({ id, items: JSON.stringify([item(values)]), createdAt: new Date(date), visit: { doctorId } });
function db(records: any[] = [], inventoryItems: any[] = []) {
  return {
    drug: { findFirst: jest.fn().mockResolvedValue({ id: 'fucibet', name, inventoryItems }) },
    prescription: { findMany: jest.fn().mockResolvedValue(records) },
  };
}
const get = (prisma: ReturnType<typeof db>, doctor = 'doctor') => medicineRegimenDefaults(prisma as any, 'fucibet', 'clinic', doctor, 'current-visit', now);

it('uses each field’s mode in the doctor’s history once three prescriptions exist', async () => {
  const prisma = db([
    rx('1', { duration: 3, durationUnit: 'WEEKS', instructions: 'other' }),
    rx('2', { frequency: 'ONCE_DAILY', dosePattern: '0-0-1', timing: 'PM' }), rx('3'),
    ...Array.from({ length: 7 }, (_, i) => rx(`other-${i}`, { duration: 99, instructions: 'clinic' }, 'other-doctor')),
  ]);
  expect(await get(prisma)).toEqual({ source: 'doctor', prescriptionCount: 3, values: {
    duration: 10, durationUnit: 'DAYS', frequency: 'TWICE_DAILY', dosePattern: '1-0-1', timing: 'AM/PM', instructions: 'on the rash',
  } });
});

it('uses clinic-wide history below the three-prescription threshold', async () => {
  const prisma = db([rx('1', { duration: 3 }), rx('2', { duration: 3 }), ...[3, 4, 5].map(i => rx(String(i), {}, 'other'))]);
  expect(await get(prisma)).toMatchObject({ source: 'clinic', prescriptionCount: 5, values: { duration: 10 } });
});

it('breaks ties per field with the most recent prescription, keeping duration units paired', async () => {
  const prisma = db([rx('1', { duration: 2, durationUnit: 'WEEKS' }, 'doctor', '2026-08-01'), rx('2', { duration: 10, instructions: 'new instruction' }, 'doctor', '2026-09-01')]);
  expect(await get(prisma)).toMatchObject({ values: { duration: 10, durationUnit: 'DAYS', instructions: 'new instruction' } });
});

it('scopes catalog, history, date window and current-visit exclusion on the server', async () => {
  const prisma = db(); await get(prisma);
  expect(prisma.drug.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'fucibet', branchId: 'clinic' } }));
  expect(prisma.prescription.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
    status: { not: 'CANCELLED' },
    createdAt: { gte: new Date('2025-09-27T12:00:00Z'), lte: now },
    visit: { deletedAt: null, patient: { branchId: 'clinic' }, id: { not: 'current-visit' } },
  } }));
});

it('clamps a leap-day anniversary to 12 calendar months', async () => {
  const prisma = db();
  await medicineRegimenDefaults(prisma as any, 'fucibet', 'clinic', 'doctor', undefined, new Date('2024-02-29T10:00:00Z'));
  expect(prisma.prescription.findMany.mock.calls[0][0].where.createdAt.gte.toISOString()).toBe('2023-02-28T10:00:00.000Z');
});

it('matches catalog IDs first and exact legacy names without borrowing another strength or medicine', async () => {
  const prisma = db([rx('different-name', { drugName: 'Fucibet cream 20mg' }), rx('different-id', { drugId: 'other' }),
    rx('legacy', { drugName: '  FUCIBET   cream ' }), rx('renamed', { drugId: 'fucibet', drugName: 'old product label' }),
    { ...rx('bad-json'), items: '{malformed' }, { ...rx('wrong-shape'), items: '{}' }]);
  expect(await get(prisma)).toMatchObject({ prescriptionCount: 2, values: { duration: 10 } });
});

it('does not count duplicate rows as multiple prescriptions or learn missing fields as blank modes', async () => {
  const duplicated = rx('1'); duplicated.items = JSON.stringify([item(), item(), item()]);
  const prisma = db([duplicated, rx('2', { instructions: '', duration: '', dosePattern: '', frequency: '', timing: '' })]);
  expect(await get(prisma)).toMatchObject({ source: 'clinic', prescriptionCount: 2, values: { instructions: 'on the rash', duration: 10 } });
});

it('streams beyond 500 prescriptions rather than sampling a recent subset', async () => {
  const prisma = db();
  prisma.prescription.findMany.mockResolvedValueOnce(Array.from({ length: 500 }, (_, i) => rx(String(i)))).mockResolvedValueOnce([rx('501')]);
  expect(await get(prisma)).toMatchObject({ prescriptionCount: 501 });
  expect(prisma.prescription.findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: '499' }, skip: 1 });
});

it('uses optional inventory defaults only when there is no medicine history', async () => {
  const defaults = { name, defaultDuration: 3, defaultDurationUnit: 'WEEKS', defaultFrequency: '0-0-1', defaultTiming: 'PM', defaultInstructions: 'apply thinly' };
  expect(await get(db([], [defaults]))).toEqual({ source: 'inventory', prescriptionCount: 0, values: {
    duration: 3, durationUnit: 'WEEKS', frequency: '0-0-1', dosePattern: '', timing: 'PM', instructions: 'apply thinly',
  } });
  expect(await get(db([rx('1', { instructions: '' })], [defaults]))).toMatchObject({ source: 'clinic', values: { duration: 10 } });
  expect((await get(db([rx('1', { instructions: '' })], [defaults]))).values.instructions).toBeUndefined();
});

it('returns no invented defaults for a never-prescribed medicine', async () => {
  expect(await get(db())).toEqual({ source: 'none', prescriptionCount: 0, values: {} });
});

it('rejects missing auth context or medicines outside the branch', async () => {
  const prisma = db(); prisma.drug.findFirst.mockResolvedValue(null);
  await expect(get(prisma)).rejects.toThrow('not found in this branch');
  await expect(medicineRegimenDefaults(prisma as any, 'fucibet', '', 'doctor')).rejects.toThrow('Authenticated');
  expect(prisma.prescription.findMany).not.toHaveBeenCalled();
});

it('gets doctor and clinic identity from the authenticated request', async () => {
  const service = { getMedicineRegimenDefaults: jest.fn() };
  const controller = new PrescriptionsController(service as any);
  controller.medicineRegimenDefaults('fucibet', { user: { id: 'signed-in-doctor', branchId: 'clinic', role: 'DOCTOR' } }, 'visit');
  expect(service.getMedicineRegimenDefaults).toHaveBeenCalledWith('fucibet', 'clinic', 'signed-in-doctor', 'visit');
});
