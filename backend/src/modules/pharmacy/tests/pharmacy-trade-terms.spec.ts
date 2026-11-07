import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { diagnosticValidationPipe } from '../../../shared/logging/http-observability';
import { matchTradeTerm, tradeTermIssue, tradeTermProductKey } from '../pharmacy-trade-terms';
import { PharmacyTradeTermsController } from '../pharmacy-trade-terms.controller';
import { PharmacyTradeTermsService } from '../pharmacy-trade-terms.service';

type Term = Record<string, any>;

function fakeDb() {
  const users = [
    { id: 'doctor-1', firstName: 'Praneeta', lastName: 'Rao' },
    { id: 'doctor-2', firstName: 'Shravya', lastName: 'K' },
  ];
  const suppliers = [
    { id: 'sup-1', branchId: 'branch-1', name: 'Apex Pharma', gstNumber: '36ABCDE1234F1Z5', isActive: true },
    { id: 'sup-2', branchId: 'branch-1', name: 'Medline Distributors', gstNumber: '36PQRST9876K1Z2', isActive: true },
    { id: 'sup-other', branchId: 'branch-2', name: 'Other Branch Pharma', gstNumber: '36ZZZZZ1234F1Z5', isActive: true },
  ];
  const drugs = [{ id: 'drug-dolo', branchId: 'branch-1' }, { id: 'drug-far', branchId: 'branch-2' }];
  const invoices = [{ branchId: 'branch-1', supplierId: 'sup-2', createdAt: new Date(Date.UTC(2026, 10, 1)) }];
  const terms: Term[] = [];
  let seq = 0;
  const matches = (row: Record<string, any>, where: Record<string, any>) =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === 'object' && 'in' in value) return value.in.includes(row[key]);
      if (value && typeof value === 'object' && 'equals' in value) return String(row[key]).toUpperCase() === String(value.equals).toUpperCase();
      if (value && typeof value === 'object' && 'contains' in value) return String(row[key] ?? '').toUpperCase().includes(String(value.contains).toUpperCase());
      if (value && typeof value === 'object' && 'not' in value) return row[key] !== value.not;
      if (key === 'OR') return value.some((alternative: Record<string, any>) => matches(row, alternative));
      return row[key] === value;
    });
  const withCount = (row: Record<string, any>) => ({ ...row, _count: { tradeTerms: terms.filter(t => t.supplierId === row.id).length } });
  const latestPerSupplier = <T extends Record<string, any>>(rows: T[], at: string) =>
    [...rows].sort((a, b) => b[at] - a[at]).filter((row, i, all) => all.findIndex(other => other.supplierId === row.supplierId) === i);
  const withActors = (term: Term) => ({ ...term, createdBy: users.find(u => u.id === term.createdById), updatedBy: users.find(u => u.id === term.updatedById) });
  const db = {
    terms,
    supplier: {
      findFirst: jest.fn(async ({ where }) => {
        const row = suppliers.find(s => matches(s, where));
        return row ? withCount(row) : null;
      }),
      findMany: jest.fn(async ({ where }) => suppliers.filter(s => matches(s, where)).map(withCount)),
    },
    pharmacyPurchaseInvoice: { findMany: jest.fn(async ({ where }) => latestPerSupplier(invoices.filter(i => matches(i, where)), 'createdAt')) },
    drug: { count: jest.fn(async ({ where }) => drugs.filter(d => matches(d, where)).length) },
    pharmacyTradeTerm: {
      findMany: jest.fn(async ({ where, distinct }) => {
        const rows = terms.filter(t => matches(t, where));
        return distinct ? latestPerSupplier(rows, 'updatedAt') : rows.map(withActors);
      }),
      upsert: jest.fn(async ({ where, create, update }) => {
        const key = where.branchId_supplierId_productKey;
        const existing = terms.find(t => matches(t, key));
        if (existing) return Object.assign(existing, update, { updatedAt: new Date(Date.UTC(2026, 10, 7, 0, ++seq)) });
        const row = { id: `term-${++seq}`, ...create, updatedAt: new Date(Date.UTC(2026, 10, 7, 0, seq)) };
        terms.push(row);
        return row;
      }),
      deleteMany: jest.fn(async ({ where }) => {
        const before = terms.length;
        for (let i = terms.length - 1; i >= 0; i--) if (matches(terms[i], where)) terms.splice(i, 1);
        return { count: before - terms.length };
      }),
    },
    $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  return db;
}

const dolo = { drugId: 'drug-dolo', productName: 'Dolo 650 Tablet', discountPercent: 10, schemeBuy: 10, schemeFree: 1, minExpiryMonths: 18, ptr: 24.5 };
const syrup = { productName: '  Cough   SYRUP 100ml ', marginPercent: 22, ptrRule: 'MRP less 20%' };

describe('trade term product identity', () => {
  it('keys a master product by drug id and a typed product by its normalised name', () => {
    expect(tradeTermProductKey({ drugId: 'drug-dolo', productName: 'Dolo 650' })).toBe('drug:drug-dolo');
    expect(tradeTermProductKey({ productName: '  Cough \t SYRUP\n100ml ' })).toBe('name:cough syrup 100ml');
    expect(tradeTermProductKey({ drugId: null, productName: 'Cough Syrup 100ml' })).toBe('name:cough syrup 100ml');
  });

  it('matches an invoice line by drug id first, then by name only against compatible terms', () => {
    const terms = [
      { id: 'by-drug', drugId: 'drug-dolo', productName: 'Dolo 650 Tablet' },
      { id: 'by-name', drugId: null, productName: 'Cough Syrup 100ml' },
    ];
    expect(matchTradeTerm(terms, { drugId: 'drug-dolo', productName: 'DOLO-650 (strip)' })?.id).toBe('by-drug');
    expect(matchTradeTerm(terms, { productName: 'dolo 650   tablet' })?.id).toBe('by-drug');
    expect(matchTradeTerm(terms, { drugId: 'drug-new', productName: 'cough syrup 100ML' })?.id).toBe('by-name');
    expect(matchTradeTerm(terms, { drugId: 'drug-other', productName: 'Dolo 650 Tablet' })).toBeNull();
    expect(matchTradeTerm(terms, { productName: '   ' })).toBeNull();
  });

  it('rejects an incomplete scheme, an implausible scheme and an empty term', () => {
    expect(tradeTermIssue({ schemeBuy: 10 })).toBe('Enter both the buy and free quantities of the scheme, or neither.');
    expect(tradeTermIssue({ schemeBuy: 2, schemeFree: 21 })).toBe('The free quantity cannot exceed ten times the buy quantity.');
    expect(tradeTermIssue({ schemeBuy: 0, schemeFree: 0 })).toBe('A scheme needs a buy quantity of at least 1.');
    expect(tradeTermIssue({ note: '  ' })).toBe('Enter at least one agreed term for each product.');
    expect(tradeTermIssue({ schemeBuy: 10, schemeFree: 1 })).toBeNull();
  });
});

describe('PharmacyTradeTermsService', () => {
  let db: ReturnType<typeof fakeDb>;
  let service: PharmacyTradeTermsService;
  beforeEach(() => {
    db = fakeDb();
    service = new PharmacyTradeTermsService(db as any);
  });

  it('saves two products for a distributor with who entered them', async () => {
    const result = await service.save('branch-1', 'doctor-1', { supplierId: 'sup-1', items: [dolo, syrup] });
    expect(result.supplier).toEqual({ id: 'sup-1', name: 'Apex Pharma', gstNumber: '36ABCDE1234F1Z5', termCount: 2 });
    expect(result.terms.map(t => [t.productKey, t.discountPercent, t.schemeBuy, t.schemeFree, t.minExpiryMonths, t.marginPercent, t.ptr, t.ptrRule, t.createdBy.name])).toEqual([
      ['drug:drug-dolo', 10, 10, 1, 18, null, 24.5, null, 'Praneeta Rao'],
      ['name:cough syrup 100ml', null, null, null, null, 22, null, 'MRP less 20%', 'Praneeta Rao'],
    ]);
  });

  it('updates the same row when a product is saved again, keeping its original author', async () => {
    await service.save('branch-1', 'doctor-1', { supplierId: 'sup-1', items: [syrup] });
    const result = await service.save('branch-1', 'doctor-2', { supplierId: 'sup-1', items: [{ productName: 'cough syrup 100ML', discountPercent: 5 }] });
    expect(db.terms).toHaveLength(1);
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0]).toMatchObject({ id: 'term-1', productName: 'cough syrup 100ML', discountPercent: 5, marginPercent: null, ptrRule: null });
    expect([result.terms[0].createdBy.name, result.terms[0].updatedBy.name]).toEqual(['Praneeta Rao', 'Shravya K']);
  });

  it('refuses a duplicate product within one save', async () => {
    await expect(service.save('branch-1', 'doctor-1', { supplierId: 'sup-1', items: [syrup, { productName: 'Cough Syrup 100ml', ptr: 50 }] }))
      .rejects.toThrow('Each product can appear only once.');
    expect(db.terms).toHaveLength(0);
  });

  it('keeps every read and write inside the signed-in branch', async () => {
    await expect(service.save('branch-1', 'doctor-1', { supplierId: 'sup-other', items: [syrup] })).rejects.toThrow('Distributor not found in this branch.');
    await expect(service.save('branch-1', 'doctor-1', { supplierId: 'sup-1', items: [{ ...dolo, drugId: 'drug-far' }] }))
      .rejects.toThrow('A selected product is not in this branch catalogue.');
    await expect(service.list('branch-2', 'sup-1')).rejects.toThrow('Distributor not found in this branch.');
    await service.save('branch-1', 'doctor-1', { supplierId: 'sup-1', items: [syrup] });
    await expect(service.remove('branch-2', 'term-1')).rejects.toThrow('Trade term not found in this branch.');
    expect(db.terms.map(t => t.id)).toEqual(['term-1']);
    expect(await service.remove('branch-1', 'term-1')).toEqual({ id: 'term-1' });
    expect(db.terms).toHaveLength(0);
  });

  it('searches distributors by GSTIN fragment and lists the most recently used first', async () => {
    const before = await service.distributors('branch-1', 'RECEPTION', 'pqrst');
    expect(before).toEqual({
      access: { read: true, edit: false },
      results: [{ id: 'sup-2', name: 'Medline Distributors', gstNumber: '36PQRST9876K1Z2', termCount: 0 }],
      recent: [{ id: 'sup-2', name: 'Medline Distributors', gstNumber: '36PQRST9876K1Z2', termCount: 0 }],
    });
    await service.save('branch-1', 'doctor-1', { supplierId: 'sup-1', items: [syrup] });
    const after = await service.distributors('branch-1', 'DOCTOR');
    expect(after.access).toEqual({ read: true, edit: true });
    expect(after.recent.map(d => [d.name, d.termCount])).toEqual([['Apex Pharma', 1], ['Medline Distributors', 0]]);
  });

  it('finds the distributor by GSTIN on the invoice screen and matches each line', async () => {
    await service.save('branch-1', 'doctor-1', { supplierId: 'sup-1', items: [dolo, syrup] });
    const result = await service.lookup('branch-1', {
      gstin: '36abcde1234f1z5',
      products: [{ productName: 'Dolo 650 Tablet', drugId: 'drug-dolo' }, { productName: 'Crocin' }, { productName: 'COUGH SYRUP 100ML' }],
    });
    expect(result.supplier?.name).toBe('Apex Pharma');
    expect(result.matches).toEqual(['term-1', null, 'term-2']);
    expect(await service.lookup('branch-2', { gstin: '36ABCDE1234F1Z5', products: [{ productName: 'Dolo 650 Tablet' }] }))
      .toEqual({ supplier: null, terms: [], matches: [null] });
  });
});

describe('Trade terms over HTTP', () => {
  let app: INestApplication;
  let role: UserRole;
  let db: ReturnType<typeof fakeDb>;

  beforeAll(async () => {
    db = fakeDb();
    const module = await Test.createTestingModule({
      controllers: [PharmacyTradeTermsController],
      providers: [PharmacyTradeTermsService, { provide: PrismaService, useValue: db }, RolesGuard, Reflector],
    }).overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: any) {
        if (!context.switchToHttp().getRequest().user) throw new UnauthorizedException();
        return true;
      },
    }).compile();
    app = module.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      req.user = { id: 'doctor-1', branchId: 'branch-1', role };
      next();
    });
    app.useGlobalPipes(diagnosticValidationPipe());
    app.useGlobalGuards(module.get(RolesGuard));
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => { await app?.close(); });

  const put = (body: unknown) => request(app.getHttpServer()).put('/pharmacy/trade-terms').send(body);

  it.each([UserRole.RECEPTION, UserRole.PHARMACIST, UserRole.MANAGER, UserRole.ACCOUNTANT])('lets %s read terms but not change them', async staff => {
    role = staff;
    expect((await put({ supplierId: 'sup-1', items: [syrup] })).status).toBe(403);
    expect((await request(app.getHttpServer()).delete('/pharmacy/trade-terms/term-1')).status).toBe(403);
    const read = await request(app.getHttpServer()).get('/pharmacy/trade-terms').query({ supplierId: 'sup-1' });
    expect([read.status, read.body.supplier.name]).toEqual([200, 'Apex Pharma']);
    expect(db.terms).toHaveLength(0);
  });

  it('denies roles outside the clinic purchase team', async () => {
    role = UserRole.LAB_TECH;
    expect((await request(app.getHttpServer()).get('/pharmacy/trade-terms').query({ supplierId: 'sup-1' })).status).toBe(403);
  });

  it('lets a doctor save valid terms and rejects out-of-range values', async () => {
    role = UserRole.DOCTOR;
    expect((await put({ supplierId: 'sup-1', items: [{ ...syrup, discountPercent: 101 }] })).status).toBe(400);
    expect((await put({ supplierId: 'sup-1', items: [{ ...syrup, minExpiryMonths: 61 }] })).status).toBe(400);
    expect((await put({ supplierId: 'sup-1', items: [{ ...syrup, schemeBuy: 1.5, schemeFree: 1 }] })).status).toBe(400);
    const saved = await put({ supplierId: 'sup-1', items: [syrup] });
    expect([saved.status, saved.body.terms.map((t: Term) => t.productKey)]).toEqual([200, ['name:cough syrup 100ml']]);
  });
});
