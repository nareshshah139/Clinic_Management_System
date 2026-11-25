import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { diagnosticValidationPipe } from '../../shared/logging/http-observability';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

type Row = { id: string; name: string; dob: Date | null; createdAt: Date; visits: Array<{ id: string; createdAt: Date }> };

const NAMES = Array.from({ length: 25 }, (_, i) => `Patient ${String.fromCharCode(65 + i)}`);

function fakePrisma(rows: Row[]) {
  const compare = (a: any, b: any, spec: any): number => {
    const [key, dir] = Object.entries(spec)[0] as [string, any];
    const direction = typeof dir === 'string' ? dir : dir.sort;
    const nullsLast = typeof dir === 'object' && dir.nulls === 'last';
    const x = (a as any)[key];
    const y = (b as any)[key];
    if (x == null || y == null) return x == null && y == null ? 0 : x == null ? (nullsLast ? 1 : -1) : nullsLast ? -1 : 1;
    const r = x < y ? -1 : x > y ? 1 : 0;
    return direction === 'asc' ? r : -r;
  };
  const patient = {
    findMany: jest.fn(async (args: any) => {
      let out = [...rows];
      if (args.where?.id?.in) out = out.filter((r) => args.where.id.in.includes(r.id));
      for (const spec of [...(args.orderBy ?? [])].reverse()) out.sort((a, b) => compare(a, b, spec));
      const sliced = out.slice(args.skip ?? 0, args.take === undefined ? undefined : (args.skip ?? 0) + args.take);
      return sliced.map((r) => ({ ...r }));
    }),
    count: jest.fn(async () => rows.length),
  };
  return { patient } as any;
}

describe('patients directory server-side sorting', () => {
  let rows: Row[];
  let service: PatientsService;
  let app: INestApplication;

  beforeAll(async () => {
    rows = NAMES.map((name, i) => ({
      id: `id-${String(i).padStart(2, '0')}`,
      name,
      dob: new Date(2000 - i, 0, 1),
      createdAt: new Date(2026, 0, 1 + i),
      visits: i % 5 === 0 ? [] : [{ id: `v${i}`, createdAt: new Date(2026, 5, 1 + i) }],
    }));
    service = new PatientsService(fakePrisma(rows), {} as any, {} as any);
    const auth = { canActivate: (ctx: any) => { ctx.switchToHttp().getRequest().user = { id: 'u', branchId: 'b', role: 'ADMIN' }; return true; } };
    const findAll = jest.spyOn(service, 'findAll');
    const module = await Test.createTestingModule({
      controllers: [PatientsController],
      providers: [{ provide: PatientsService, useValue: service }],
    }).overrideGuard(JwtAuthGuard).useValue(auth).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(diagnosticValidationPipe());
    await app.init();
    findAll.mockClear();
  });
  afterAll(async () => { await app.close(); });

  const names = (res: { body: { data: Array<{ name: string }> } }) => res.body.data.map((p) => p.name);

  it('returns page 2 ordered by name descending across the whole list', async () => {
    const res = await request(app.getHttpServer()).get('/patients?page=2&limit=10&sortBy=name&sortOrder=desc').expect(200);
    expect(names(res)).toEqual([
      'Patient O', 'Patient N', 'Patient M', 'Patient L', 'Patient K',
      'Patient J', 'Patient I', 'Patient H', 'Patient G', 'Patient F',
    ]);
    expect(res.body.meta).toMatchObject({ total: 25, totalPages: 3 });
  });

  it('returns the last page ordered by name ascending', async () => {
    const res = await request(app.getHttpServer()).get('/patients?page=3&limit=10&sortBy=name&sortOrder=asc').expect(200);
    expect(names(res)).toEqual(['Patient U', 'Patient V', 'Patient W', 'Patient X', 'Patient Y']);
  });

  it('orders by age with the youngest first when ascending', async () => {
    const res = await request(app.getHttpServer()).get('/patients?page=1&limit=3&sortBy=age&sortOrder=asc').expect(200);
    expect(names(res)).toEqual(['Patient A', 'Patient B', 'Patient C']);
  });

  it('orders by last visit with never-visited patients last, on any page', async () => {
    const first = await request(app.getHttpServer()).get('/patients?page=1&limit=3&sortBy=lastVisit&sortOrder=desc').expect(200);
    expect(names(first)).toEqual(['Patient Y', 'Patient X', 'Patient W']);
    const last = await request(app.getHttpServer()).get('/patients?page=3&limit=10&sortBy=lastVisit&sortOrder=desc').expect(200);
    expect(names(last)).toEqual(['Patient U', 'Patient P', 'Patient K', 'Patient F', 'Patient A']);
  });

  it('keeps the newest-first default when no sort is requested', async () => {
    const res = await request(app.getHttpServer()).get('/patients?page=1&limit=2').expect(200);
    expect(names(res)).toEqual(['Patient Y', 'Patient X']);
  });

  it.each([
    ['sortBy=password'],
    ['sortBy=name&sortOrder=sideways'],
    ['sortBy=NAME'],
  ])('rejects %s with 400', async (query) => {
    await request(app.getHttpServer()).get(`/patients?${query}`).expect(400);
  });
});
