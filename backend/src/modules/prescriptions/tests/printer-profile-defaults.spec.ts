import { PrescriptionsService } from '../prescriptions.service';

type Profile = { id: string; branchId: string; ownerId: string | null; isDefault: boolean; updatedAt: Date; createdAt: Date; owner: { role: string } | null };

describe('Printer profile defaults per doctor', () => {
  let profiles: Profile[];
  const roles: Record<string, string> = { praneeta: 'DOCTOR', rahul: 'DOCTOR', reception: 'RECEPTION', admin: 'ADMIN' };
  const profile = (id: string, ownerId: string | null, isDefault = false, minutesAgo = 0): Profile => ({
    id, branchId: 'branch', ownerId, isDefault, owner: ownerId ? { role: roles[ownerId] } : null,
    updatedAt: new Date(Date.now() - minutesAgo * 60000), createdAt: new Date(0),
  });
  const visible = (where: any) => profiles.filter(p => p.branchId === where.branchId
    && where.OR.some((c: any) => c.owner ? !!p.owner && p.owner.role !== c.owner.role.not
      : c.ownerId === null ? p.ownerId === null : c.ownerId.in.includes(p.ownerId)));
  const db: any = {
    printerProfile: {
      findMany: jest.fn(async ({ where }) => visible(where).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.updatedAt.getTime() - a.updatedAt.getTime())),
      findFirst: jest.fn(async ({ where }) => profiles.find(p => p.id === where.id && p.branchId === where.branchId) ?? null),
      updateMany: jest.fn(async ({ where, data }) => { profiles.filter(p => p.branchId === where.branchId && p.ownerId === where.ownerId && p.id !== where.NOT?.id).forEach(p => Object.assign(p, data)); }),
      update: jest.fn(async ({ where, data }) => Object.assign(profiles.find(p => p.id === where.id)!, data)),
      create: jest.fn(),
    },
  };
  const service = new PrescriptionsService(db, {} as any);
  const applied = async (userId: string, doctorId?: string) =>
    (await service.listPrinterProfiles('branch', userId, doctorId)).filter(p => p.appliesByDefault).map(p => p.id);

  beforeEach(() => {
    profiles = [profile('praneeta-a4', 'praneeta', true), profile('rahul-thermal', 'rahul'), profile('front-desk', 'reception', true, 5), profile('shared', null)];
  });

  it('keeps Dr. Praneeta Jain\'s default for her prescriptions, whoever prints them', async () => {
    expect(await applied('praneeta')).toEqual(['praneeta-a4']);
    expect(await applied('reception', 'praneeta')).toEqual(['praneeta-a4']);
  });

  it('never applies one doctor\'s default to another doctor and falls back to the clinic default', async () => {
    expect(await applied('rahul')).toEqual(['front-desk']);
    expect(await applied('reception', 'rahul')).toEqual(['front-desk']);
    const listed = (await service.listPrinterProfiles('branch', 'reception', 'rahul')).map(p => p.id);
    expect(listed).not.toContain('praneeta-a4');
  });

  it('applies nothing when neither the doctor nor the clinic has a default', async () => {
    profiles = profiles.filter(p => p.id !== 'front-desk');
    expect(await applied('rahul')).toEqual([]);
  });

  it('lets each doctor set a default without clearing anyone else\'s', async () => {
    await service.setDefaultPrinterProfile('branch', 'rahul', 'rahul-thermal');
    expect(await applied('rahul')).toEqual(['rahul-thermal']);
    expect(await applied('praneeta')).toEqual(['praneeta-a4']);
    expect(profiles.find(p => p.id === 'front-desk')!.isDefault).toBe(true);
  });
});
