import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { AuditLogsController } from '../audit-logs.controller';
import { AuditLogsService } from '../audit-logs.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';

const adminOwner = [
  '/audit-logs',
  '/audit-logs/statistics',
  '/audit-logs/export',
  '/audit-logs/export/json',
  '/audit-logs/user/user-9',
  '/audit-logs/log-1',
];
const entityHistory = '/audit-logs/entity/Patient/pat-1';
const myActivity = '/audit-logs/my-activity';

describe('/audit-logs access control', () => {
  let app: INestApplication;
  const service = {
    findAll: jest.fn(async () => ({ data: [], pagination: {} })),
    getStatistics: jest.fn(async () => ({ totalLogs: 0 })),
    exportLogs: jest.fn(async (_query: unknown, format: string) =>
      format === 'csv' ? 'id\n1' : [],
    ),
    findByUser: jest.fn(async () => ({ data: [], pagination: {} })),
    findByEntity: jest.fn(async () => []),
    findOne: jest.fn(async () => ({ id: 'log-1' })),
  };
  const authenticate = {
    canActivate: (context: any) => {
      const req = context.switchToHttp().getRequest();
      const role = req.headers['x-role'];
      if (!role) return false;
      req.user = { id: `user-${role}`, role, branchId: 'branch-a' };
      return true;
    },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuditLogsController],
      providers: [
        { provide: AuditLogsService, useValue: service },
        { provide: APP_GUARD, useValue: authenticate },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(authenticate)
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  const get = (path: string, role?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return role ? req.set('x-role', role) : req;
  };

  describe.each(['OWNER', 'ADMIN', 'DOCTOR'])('%s', (role) => {
    it.each([...adminOwner, entityHistory, myActivity])(
      'may read %s',
      async (path) => {
        expect((await get(path, role)).status).toBe(200);
      },
    );
  });

  describe.each(['RECEPTION', 'PHARMACIST', 'NURSE', 'PATIENT'])(
    '%s',
    (role) => {
      it.each([...adminOwner, entityHistory])(
        'may not read %s',
        async (path) => {
          expect((await get(path, role)).status).toBe(403);
        },
      );

      it('may read only their own activity', async () => {
        service.findByUser.mockClear();
        expect((await get(myActivity, role)).status).toBe(200);
        expect(service.findByUser).toHaveBeenCalledWith(
          `user-${role}`,
          expect.anything(),
        );
      });
    },
  );

  it('denies every route without authentication', async () => {
    for (const path of [...adminOwner, entityHistory, myActivity]) {
      expect((await get(path)).status).toBe(403);
    }
  });

  it('exposes no write route', async () => {
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      for (const path of [
        '/audit-logs',
        '/audit-logs/log-1',
        '/audit-logs/cleanup',
      ]) {
        const res = await (request(app.getHttpServer()) as any)
          [method](path)
          .set('x-role', 'ADMIN')
          .send({});
        expect(res.status).toBe(404);
      }
    }
  });

  it('does not reach the service for a forbidden role', async () => {
    service.findAll.mockClear();
    await get('/audit-logs', 'RECEPTION');
    expect(service.findAll).not.toHaveBeenCalled();
  });
});
