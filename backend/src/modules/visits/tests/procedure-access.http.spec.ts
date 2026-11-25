import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/guards/permissions.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { diagnosticValidationPipe } from '../../../shared/logging/http-observability';
import { ProcedureAccessService } from '../procedure-access';
import { ProceduresController } from '../procedures.controller';
import { VisitsService } from '../visits.service';

const procedure = {
  type: 'Fotona Starwalker', machine: 'fotona-starwalker', therapistId: 'nurse-1', sessionNo: 2,
  bodyPart: ['Face'], shotCounts: { begin: 0, end: 120 }, parameters: { Fluence: { 1: '12' } },
};
const newProcedure = { patientId: 'patient-1', doctorId: 'doctor-1', treatmentPlan: { dermatology: { procedures: [procedure] }, notes: 'Mild erythema' } };

describe('procedure records and who may record them, over HTTP', () => {
  let app: INestApplication;
  let branch: { id: string; metadata: string | null };
  let audit: Array<Record<string, unknown>>;
  let storedVisits: Record<string, { plan: unknown }>;
  const visits = { create: jest.fn(), update: jest.fn(), findOne: jest.fn() };

  const as = (role: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('x-role', role),
    put: (url: string, body: object) => request(app.getHttpServer()).put(url).set('x-role', role).send(body),
    post: (url: string, body: object) => request(app.getHttpServer()).post(url).set('x-role', role).send(body),
    patch: (url: string, body: object) => request(app.getHttpServer()).patch(url).set('x-role', role).send(body),
  });

  beforeAll(async () => {
    const auth = { canActivate: (ctx: any) => {
      const req = ctx.switchToHttp().getRequest();
      req.user = { id: `${req.headers['x-role']}-user`, branchId: 'branch-1', role: req.headers['x-role'] };
      return true;
    } };
    const db: any = {
      branch: {
        findUnique: async ({ where }: any) => (where.id === branch.id ? { metadata: branch.metadata } : null),
        updateMany: async ({ where, data }: any) => {
          if (where.id !== branch.id || where.metadata !== branch.metadata) return { count: 0 };
          branch.metadata = data.metadata;
          return { count: 1 };
        },
      },
      auditLog: { create: async ({ data }: any) => { audit.push(data); return data; } },
      $transaction: async (work: (tx: any) => unknown) => work(db),
    };
    const module = await Test.createTestingModule({
      controllers: [ProceduresController],
      providers: [
        ProcedureAccessService,
        { provide: PrismaService, useValue: db },
        { provide: VisitsService, useValue: visits },
        { provide: APP_GUARD, useValue: auth },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    }).overrideGuard(JwtAuthGuard).useValue(auth).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(diagnosticValidationPipe());
    await app.init();
  });

  beforeEach(() => {
    branch = { id: 'branch-1', metadata: JSON.stringify({ unrelated: 'kept' }) };
    audit = [];
    storedVisits = {
      'procedure-visit': { plan: { dermatology: { procedures: [procedure] }, notes: 'Before' } },
      'consultation-visit': { plan: { dermatology: { procedures: [{ type: 'Chemical peel' }] }, notes: 'Doctor notes' } },
    };
    jest.clearAllMocks();
    visits.create.mockImplementation(async (dto: unknown) => ({ id: 'created-visit', ...(dto as object) }));
    visits.update.mockImplementation(async (id: string) => ({ id }));
    visits.findOne.mockImplementation(async (id: string) => ({ id, ...storedVisits[id] }));
  });

  afterAll(async () => { await app.close(); });

  it('lets only doctors, admins and owners record by default, and tells a nurse why', async () => {
    const refused = await as('NURSE').post('/procedures', newProcedure).expect(403);
    expect(refused.body.message).toBe('Your role can view procedures but not record them. A doctor or admin can change this.');
    await as('MANAGER').post('/procedures', newProcedure).expect(403);
    await as('NURSE').patch('/procedures/procedure-visit', { version: 1, treatmentPlan: newProcedure.treatmentPlan }).expect(403);
    expect(visits.create).not.toHaveBeenCalled();
    expect(visits.update).not.toHaveBeenCalled();

    await as('DOCTOR').post('/procedures', newProcedure).expect(201);
    expect((await as('DOCTOR').get('/procedures/access').expect(200)).body).toEqual({ recordRoles: ['OWNER', 'ADMIN', 'DOCTOR'] });
    expect((await as('NURSE').get('/procedures/access/me').expect(200)).body).toEqual({ canRecord: false, canConfigure: false });
    expect((await as('DOCTOR').get('/procedures/access/me').expect(200)).body).toEqual({ canRecord: true, canConfigure: true });
  });

  it('lets a nurse record once a doctor allows nurses, and saves exactly the procedure as a visit', async () => {
    const saved = await as('DOCTOR').put('/procedures/access', { recordRoles: ['NURSE'] }).expect(200);
    expect(saved.body).toEqual({ recordRoles: ['OWNER', 'ADMIN', 'DOCTOR', 'NURSE'] });
    expect((await as('NURSE').get('/procedures/access/me').expect(200)).body).toEqual({ canRecord: true, canConfigure: false });

    await as('NURSE').post('/procedures', {
      ...newProcedure,
      complaints: [{ complaint: 'smuggled' }],
      treatmentPlan: { ...newProcedure.treatmentPlan, medications: 'smuggled', followUpDate: '2026-12-01' },
    }).expect(201);
    expect(visits.create).toHaveBeenCalledTimes(1);
    expect(visits.create).toHaveBeenCalledWith(
      { patientId: 'patient-1', doctorId: 'doctor-1', complaints: [], treatmentPlan: { dermatology: { procedures: [procedure] }, notes: 'Mild erythema' } },
      'branch-1',
      'NURSE-user',
    );

    await as('NURSE').patch('/procedures/procedure-visit', { version: 3, treatmentPlan: { dermatology: { procedures: [procedure] }, notes: 'After' } }).expect(200);
    expect(visits.update).toHaveBeenCalledWith(
      'procedure-visit',
      { version: 3, treatmentPlan: { dermatology: { procedures: [procedure] }, notes: 'After' } },
      'branch-1',
      'NURSE-user',
    );
  });

  it('keeps the setting in branch settings beside other keys and audits each real change once', async () => {
    await as('ADMIN').put('/procedures/access', { recordRoles: ['MANAGER', 'NURSE', 'NURSE'] }).expect(200);
    await as('ADMIN').put('/procedures/access', { recordRoles: ['NURSE', 'MANAGER'] }).expect(200);
    expect(JSON.parse(branch.metadata!)).toEqual({ unrelated: 'kept', procedureAccess: { recordRoles: ['OWNER', 'ADMIN', 'DOCTOR', 'NURSE', 'MANAGER'] } });
    expect(audit).toEqual([{
      userId: 'ADMIN-user', action: 'PROCEDURE_ACCESS_UPDATED', entity: 'Branch', entityId: 'branch-1',
      oldValues: JSON.stringify({ recordRoles: ['OWNER', 'ADMIN', 'DOCTOR'] }),
      newValues: JSON.stringify({ recordRoles: ['OWNER', 'ADMIN', 'DOCTOR', 'NURSE', 'MANAGER'] }),
    }]);

    await as('OWNER').put('/procedures/access', { recordRoles: [] }).expect(200);
    expect((await as('NURSE').get('/procedures/access/me').expect(200)).body.canRecord).toBe(false);
    await as('NURSE').post('/procedures', newProcedure).expect(403);
    expect(audit).toHaveLength(2);
  });

  it('never lets a manager read or change the setting, even when managers may record', async () => {
    await as('MANAGER').put('/procedures/access', { recordRoles: ['MANAGER'] }).expect(403);
    await as('DOCTOR').put('/procedures/access', { recordRoles: ['MANAGER'] }).expect(200);
    await as('MANAGER').post('/procedures', newProcedure).expect(201);
    await as('MANAGER').get('/procedures/access').expect(403);
    await as('MANAGER').put('/procedures/access', { recordRoles: ['MANAGER', 'NURSE'] }).expect(403);
    await as('NURSE').put('/procedures/access', { recordRoles: ['NURSE'] }).expect(403);
    expect(audit).toHaveLength(1);
  });

  it.each([
    [{ recordRoles: ['PATIENT'] }],
    [{ recordRoles: ['LAB_TECH'] }],
    [{ recordRoles: ['nurse'] }],
    [{ recordRoles: 'NURSE' }],
    [{}],
  ])('rejects %j with 400 and leaves the setting alone', async (body) => {
    await as('DOCTOR').put('/procedures/access', body).expect(400);
    expect(JSON.parse(branch.metadata!)).toEqual({ unrelated: 'kept' });
    expect(audit).toEqual([]);
  });

  it('refuses a save that is not a procedure record', async () => {
    await as('DOCTOR').post('/procedures', { ...newProcedure, treatmentPlan: { dermatology: { procedures: [{ type: 'Peel' }] } } }).expect(400);
    await as('DOCTOR').post('/procedures', { patientId: 'patient-1', doctorId: 'doctor-1' }).expect(400);
    await as('DOCTOR').patch('/procedures/consultation-visit', { version: 1, treatmentPlan: newProcedure.treatmentPlan }).expect(404);
    expect(visits.create).not.toHaveBeenCalled();
    expect(visits.update).not.toHaveBeenCalled();
  });
});
