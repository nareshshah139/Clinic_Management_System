import { BadRequestException, ConflictException } from '@nestjs/common';
import { InvestigationOptionsService, investigationName } from '../investigation-options.service';

function fixture() {
  let serial = 0;
  const records = new Map<string, any>();
  const unique = (branchId: string, name: string, except?: string) => [...records.values()].some(r => r.branchId === branchId && r.normalizedName === name && r.id !== except);
  const project = (r: any) => ({ id: r.id, name: r.name, version: r.version });
  const db = { investigationOption: {
    findUnique: jest.fn(async ({ where }) => [...records.values()].find(r => r.branchId === where.branchId_normalizedName.branchId && r.normalizedName === where.branchId_normalizedName.normalizedName) || null),
    findMany: jest.fn(async ({ where }) => [...records.values()].filter(r => r.branchId === where.branchId && r.archivedAt === null).map(project)),
    create: jest.fn(async ({ data }) => {
      if (unique(data.branchId, data.normalizedName)) throw { code: 'P2002' };
      const r = { ...data, id: String(++serial), version: 0, archivedAt: null };
      records.set(r.id, r);
      return project(r);
    }),
    update: jest.fn(async ({ where, data }) => {
      const r = records.get(where.id);
      if (!r || r.branchId !== where.branchId || r.version !== where.version || (where.archivedAt === null ? r.archivedAt !== null : r.archivedAt === null)) throw { code: 'P2025' };
      if (data.normalizedName && unique(r.branchId, data.normalizedName, r.id)) throw { code: 'P2002' };
      const next = { ...r, ...data, version: r.version + data.version.increment };
      records.set(r.id, next);
      return project(next);
    }),
  } };
  return { db, records, service: new InvestigationOptionsService(db as any) };
}

describe('permanent investigation catalog', () => {
  it('normalizes identity and rejects invalid names before persistence', () => {
    expect(investigationName('  ＣＢＣ\n differential ')).toEqual({ name: 'CBC differential', normalizedName: 'cbc differential' });
    for (const value of ['', '  ', null, 42, 'a'.repeat(161)]) expect(() => investigationName(value)).toThrow(BadRequestException);
  });

  it('survives service recreation and collapses concurrent duplicate adds', async () => {
    const { db, service } = fixture();
    const results = await Promise.all([service.create('a', 'Custom Test'), service.create('a', ' custom   TEST ')]);
    expect(results[0]).toEqual(results[1]);
    expect(await new InvestigationOptionsService(db as any).list('a')).toEqual([{ id: '1', name: 'Custom Test', version: 0 }]);
    expect(await service.list('b')).toEqual([]);
    expect((await service.create('b', 'Custom Test')).id).not.toBe('1');
  });

  it('preserves visit snapshots through rename, archive and explicit restore', async () => {
    const { service } = fixture();
    const original = await service.create('a', 'Vitamin D');
    const visit = { investigations: [original.name] };
    const renamed = await service.update('a', original.id, 'Vitamin D total', 0);
    expect(renamed).toEqual({ id: original.id, name: 'Vitamin D total', version: 1 });
    await service.archive('a', original.id, 1);
    expect(await service.list('a')).toEqual([]);
    await expect(service.update('a', original.id, 'Stale edit', 1)).rejects.toThrow(ConflictException);
    expect(await service.create('a', 'Vitamin D total')).toEqual({ id: original.id, name: 'Vitamin D total', version: 3 });
    expect(visit).toEqual({ investigations: ['Vitamin D'] });
  });

  it('rejects cross-branch changes, stale concurrent edits and name collisions atomically', async () => {
    const { service } = fixture();
    const a = await service.create('a', 'Test A');
    await service.create('a', 'Test B');
    await expect(service.update('a', a.id, 'Test B', 0)).rejects.toThrow(ConflictException);
    await expect(service.archive('b', a.id, 0)).rejects.toThrow(ConflictException);
    const result = await Promise.allSettled([service.update('a', a.id, 'Updated', 0), service.archive('a', a.id, 0)]);
    expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect(await service.list('a')).toEqual([{ id: a.id, name: 'Updated', version: 1 }, { id: '2', name: 'Test B', version: 0 }]);
  });

  it('rejects invalid revisions and propagates storage failures', async () => {
    const { db, service } = fixture();
    await expect(service.archive('a', '1', -1)).rejects.toThrow(BadRequestException);
    const error = new Error('storage unavailable');
    db.investigationOption.create.mockRejectedValueOnce(error);
    await expect(service.create('a', 'Test')).rejects.toBe(error);
  });
});
