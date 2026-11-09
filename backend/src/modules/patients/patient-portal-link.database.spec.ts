import { PrismaClient } from '@prisma/client';
import { localDatabase } from '../../shared/testing/local-database';
import { PatientsService } from './patients.service';

const databaseTests = process.env.PATIENT_LINK_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Portal linking on PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let db: PrismaClient;
  beforeAll(async () => {
    fixture = await localDatabase(process.env.PATIENT_LINK_TEST_DATABASE_URL!);
    db = fixture.prisma;
  }, 60000);
  afterAll(async () => { await fixture?.cleanup(); });

  it('links an account to at most one patient under concurrent requests', async () => {
    const branch = await db.branch.create({ data: { name: 'Synthetic', address: 'Synthetic' } });
    const user = await db.user.create({ data: { branchId: branch.id, firstName: 'Synthetic', lastName: 'User', email: 'portal-race@example.invalid', password: 'not-a-login', role: 'PATIENT' } });
    const patients = await Promise.all(['First', 'Second'].map(name => db.patient.create({ data: { branchId: branch.id, name, phone: '0000000000', gender: 'OTHER' } })));
    const service = new PatientsService(db as any, {} as any, {} as any);
    const result = await Promise.allSettled(patients.map(patient => service.linkUser(patient.id, { email: user.email }, branch.id)));
    expect(result.filter(value => value.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter(value => value.status === 'rejected').every(value => (value as PromiseRejectedResult).reason?.status === 409)).toBe(true);
    expect(await db.patient.count({ where: { portalUserId: user.id } })).toBe(1);
  });
});
