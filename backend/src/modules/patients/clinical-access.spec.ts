import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { VisitsController } from '../visits/visits.controller';
import { VisitsService } from '../visits/visits.service';

describe('clinical patient and visit access', () => {
  let app: INestApplication;
  const patients = { findAll: jest.fn().mockResolvedValue({ patients: [] }), linkUser: jest.fn().mockResolvedValue({ id: 'patient' }) };
  const visits = { remove: jest.fn().mockResolvedValue({ id: 'visit' }) };
  beforeAll(async () => {
    const auth = { canActivate: (ctx: any) => {
      const req = ctx.switchToHttp().getRequest();
      req.user = { id: 'synthetic', branchId: 'branch', role: req.headers['x-role'] };
      return true;
    } };
    const module = await Test.createTestingModule({
      controllers: [PatientsController, VisitsController],
      providers: [
        { provide: PatientsService, useValue: patients },
        { provide: VisitsService, useValue: visits },
        { provide: APP_GUARD, useValue: auth },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).overrideGuard(JwtAuthGuard).useValue(auth).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it.each([UserRole.LAB_TECH, UserRole.PATIENT])('rejects %s from patient records, linking and visit deletion', async role => {
    await request(app.getHttpServer()).get('/patients').set('x-role', role).expect(403);
    await request(app.getHttpServer()).post('/patients/patient/link-user').set('x-role', role).send({ email: 'test@example.invalid' }).expect(403);
    await request(app.getHttpServer()).delete('/visits/visit').set('x-role', role).expect(403);
  });
  it.each([UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTION, UserRole.PHARMACIST, UserRole.ACCOUNTANT])('allows %s to access the agreed clinical routes', async role => {
    await request(app.getHttpServer()).get('/patients').set('x-role', role).expect(200);
    await request(app.getHttpServer()).post('/patients/patient/link-user').set('x-role', role).send({ email: 'test@example.invalid' }).expect(201);
    await request(app.getHttpServer()).delete('/visits/visit').set('x-role', role).expect(200);
  });
  it('retains narrower rules already declared on clinical procedures', async () => {
    await request(app.getHttpServer()).post('/visits').set('x-role', UserRole.PHARMACIST).send({}).expect(403);
  });
});
