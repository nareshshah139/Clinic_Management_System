import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { diagnosticValidationPipe } from '../../../shared/logging/http-observability';
import { UsersController } from '../users.controller';
import { UsersService } from '../users.service';

const newUser = { firstName: 'Asha', lastName: 'Rao', email: 'asha.rao@example.test', password: 'Synthetic-Pass-26', role: 'DOCTOR' };

describe('creating a user over HTTP', () => {
  let app: INestApplication;
  const created: Array<Record<string, unknown>> = [];
  const db: any = {
    user: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => {
        created.push(data);
        return { ...data, id: 'user-new', branch: { id: data.branchId, name: 'Branch' }, createdAt: new Date(), updatedAt: new Date() };
      }),
    },
  };

  beforeAll(async () => {
    const auth = { canActivate: (ctx: any) => {
      ctx.switchToHttp().getRequest().user = { id: 'admin-user', branchId: 'branch-own', role: 'ADMIN' };
      return true;
    } };
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [UsersService, { provide: PrismaService, useValue: db }, { provide: JwtService, useValue: {} }],
    }).overrideGuard(JwtAuthGuard).useValue(auth).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(diagnosticValidationPipe());
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => { created.length = 0; jest.clearAllMocks(); });

  it.each([
    ['a UUID-shaped id', '6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f'],
    ['a real branch cuid', 'cmwwaf1l000001qg554m2609a'],
  ])('puts the account in the caller’s branch when the request names another branch by %s', async (_label, otherBranch) => {
    const res = await request(app.getHttpServer()).post('/users').send({ ...newUser, branchId: otherBranch });
    expect(res.status).toBe(201);
    expect(created).toEqual([expect.objectContaining({ branchId: 'branch-own' })]);
  });

  it('puts the account in the caller’s branch when no branch is named', async () => {
    const res = await request(app.getHttpServer()).post('/users').send(newUser);
    expect(res.status).toBe(201);
    expect(created).toEqual([expect.objectContaining({ branchId: 'branch-own' })]);
  });
});
