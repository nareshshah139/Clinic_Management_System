import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import request from 'supertest';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { diagnosticValidationPipe } from '../../../shared/logging/http-observability';
import { ClinicFeesController } from '../clinic-fees.controller';
import { ClinicFeesService } from '../clinic-fees.service';

const databaseTests = process.env.BILLING_TEST_DATABASE_URL ? describe : describe.skip;

/** The fee list the bill dialog starts from, over HTTP with the real role guard, service and PostgreSQL. */
databaseTests('Clinic fee list on PostgreSQL', () => {
  const schema = `clinic_fees_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let app: INestApplication;
  let created = false;

  const USERS: Record<string, [string, string, string]> = {
    admin: ['ADMIN', 'Meera', 'Kulkarni'],
    owner: ['OWNER', 'Asha', 'Jain'],
    doctor: ['DOCTOR', 'Praneeta', 'Jain'],
    reception: ['RECEPTION', 'Ravi', 'Desk'],
    nurse: ['NURSE', 'Kavya', 'Rao'],
    pharmacist: ['PHARMACIST', 'Pooja', 'Shah'],
    accountant: ['ACCOUNTANT', 'Arun', 'Iyer'],
    'other-admin': ['ADMIN', 'Other', 'Branch'],
  };

  beforeAll(async () => {
    const url = new URL(process.env.BILLING_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')],
      { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url.toString() } });
    db = new PrismaClient({ datasourceUrl: url.toString() });
    for (const branchId of ['branch', 'other']) await db.branch.create({ data: { id: branchId, name: branchId, address: 'Synthetic' } });
    for (const [id, [role, firstName, lastName]] of Object.entries(USERS))
      await db.user.create({ data: { id, firstName, lastName, role: role as any, email: `${id}@example.test`, password: 'x', branchId: id === 'other-admin' ? 'other' : 'branch', permissions: '["*"]' } });

    const authenticate = {
      canActivate: (context: any) => {
        const req = context.switchToHttp().getRequest();
        const id = req.headers['x-user'];
        if (!USERS[id]) return false;
        req.user = { id, role: USERS[id][0], branchId: id === 'other-admin' ? 'other' : 'branch' };
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [ClinicFeesController],
      providers: [
        ClinicFeesService,
        { provide: PrismaService, useValue: db },
        { provide: APP_GUARD, useValue: authenticate },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(authenticate)
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(diagnosticValidationPipe());
    await app.init();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  const list = (who: string) => request(app.getHttpServer()).get('/billing/fees').set('x-user', who);
  const put = (who: string, billType: string, body: unknown) =>
    request(app.getHttpServer()).put(`/billing/fees/${billType}`).set('x-user', who).send(body as object);
  const stored = async () =>
    (await db.clinicFee.findMany({ orderBy: [{ branchId: 'asc' }, { billType: 'asc' }] })).map((f) => [f.branchId, f.billType, f.amount, f.version, f.updatedById]);
  const amounts = (body: any) => body.fees.map((f: any) => [f.label, f.amount, f.version, f.updatedBy]);

  it('lists one row per bill type, none set, for an admin of a new branch', async () => {
    const res = await list('admin');
    expect([res.status, amounts(res.body)]).toEqual([200, [['First consultation', null, 0, null], ['Review', null, 0, null], ['Procedure', null, 0, null]]]);
  });

  it('saves a fee, saves it again without a change, and lets the owner change it over the current version', async () => {
    const first = await put('admin', 'REVIEW', { amount: 500, version: 0 });
    expect([first.status, first.body.amount, first.body.version, first.body.updatedBy]).toEqual([200, 500, 1, 'Meera Kulkarni']);
    const retried = await put('admin', 'REVIEW', { amount: 500, version: 0 });
    expect([retried.status, retried.body.amount, retried.body.version]).toEqual([200, 500, 1]);
    const owner = await put('owner', 'REVIEW', { amount: 650.5, version: 1 });
    expect([owner.status, owner.body.amount, owner.body.version, owner.body.updatedBy]).toEqual([200, 650.5, 2, 'Asha Jain']);
    expect(await stored()).toEqual([['branch', 'REVIEW', 650.5, 2, 'owner']]);
  });

  it('refuses a save over a version someone else has changed, in words, and keeps their fee', async () => {
    const stale = await put('admin', 'REVIEW', { amount: 700, version: 1 });
    expect([stale.status, stale.body.message]).toEqual([409, 'Asha Jain set the Review fee to ₹650.5 while you were editing. Check it and save again.']);
    expect(await stored()).toEqual([['branch', 'REVIEW', 650.5, 2, 'owner']]);
  });

  it('lets exactly one of two first saves of the same fee win', async () => {
    const [a, b] = await Promise.all([put('admin', 'PROCEDURE', { amount: 1280, version: 0 }), put('owner', 'PROCEDURE', { amount: 390, version: 0 })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = a.status === 200 ? 1280 : 390;
    const row = await db.clinicFee.findUnique({ where: { branchId_billType: { branchId: 'branch', billType: 'PROCEDURE' } } });
    expect([row?.amount, row?.version]).toEqual([winner, 1]);
  });

  it('clears a fee to none and lists who cleared it', async () => {
    const cleared = await put('admin', 'REVIEW', { amount: null, version: 2 });
    expect([cleared.status, cleared.body.amount, cleared.body.version, cleared.body.updatedBy]).toEqual([200, null, 3, 'Meera Kulkarni']);
    const again = await put('admin', 'FIRST_CONSULTATION', { amount: null, version: 0 });
    expect([again.status, again.body.amount, again.body.version]).toEqual([200, null, 0]);
    const res = await list('owner');
    expect(amounts(res.body).slice(0, 2)).toEqual([['First consultation', null, 0, null], ['Review', null, 3, 'Meera Kulkarni']]);
  });

  it.each([
    ['zero', { amount: 0, version: 0 }],
    ['negative', { amount: -5, version: 0 }],
    ['three decimals', { amount: 12.345, version: 0 }],
    ['text', { amount: '500', version: 0 }],
    ['over ten lakh', { amount: 1000001, version: 0 }],
    ['missing amount', { version: 0 }],
    ['missing version', { amount: 500 }],
    ['fractional version', { amount: 500, version: 1.5 }],
  ])('refuses a %s fee with 400 and stores nothing', async (_, body) => {
    const before = await stored();
    expect((await put('admin', 'FIRST_CONSULTATION', body)).status).toBe(400);
    expect(await stored()).toEqual(before);
  });

  it('refuses an unknown bill type with 400', async () => {
    expect((await put('admin', 'CONSULT', { amount: 500, version: 0 })).status).toBe(400);
  });

  it.each(['doctor', 'reception', 'nurse', 'pharmacist', 'accountant'])('refuses %s with 403 on reading and on saving, and stores nothing', async (who) => {
    const before = await stored();
    const [read, write] = [await list(who), await put(who, 'FIRST_CONSULTATION', { amount: 999, version: 0 })];
    expect([read.status, write.status]).toEqual([403, 403]);
    expect(await stored()).toEqual(before);
  });

  it('keeps each branch to its own list', async () => {
    const saved = await put('other-admin', 'REVIEW', { amount: 300, version: 0 });
    expect([saved.status, saved.body.version]).toEqual([200, 1]);
    expect(amounts((await list('other-admin')).body)[1]).toEqual(['Review', 300, 1, 'Other Branch']);
    expect(amounts((await list('admin')).body)[1]).toEqual(['Review', null, 3, 'Meera Kulkarni']);
  });
});
