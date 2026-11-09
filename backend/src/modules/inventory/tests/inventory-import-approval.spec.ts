import { INestApplication, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { InventoryController } from '../inventory.controller';
import { InventoryImportService } from '../inventory-import.service';
import { InventoryItemRequestService } from '../inventory-item-request.service';
import { InventoryService } from '../inventory.service';
import {
  importApprovalOnUpload,
  importRowsMayRun,
  newImportApproval,
  nextImportApproval,
} from '../inventory-import-approval.state';
import { accessApp } from './inventory-access-app';

const workbook = (rows: unknown[][], name = 'opening.xlsx') => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Stock');
  return {
    originalname: name,
    buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }),
  } as Express.Multer.File;
};
const twoRows = () =>
  workbook([
    ['Drug name', 'Batch number', 'Current stock'],
    ['New cream', 'NC-1', 5],
    ['Existing tablet', 'ET-1', 12],
  ]);

const reception = { id: 'rec-1', branchId: 'b1', role: 'RECEPTION' };
const pharmacist = { id: 'pha-1', branchId: 'b1', role: 'PHARMACIST' };
const doctor = { id: 'doc-1', branchId: 'b1', role: 'DOCTOR' };
const people: Record<string, { id: string; firstName: string; lastName: string }> = {
  'rec-1': { id: 'rec-1', firstName: 'Riya', lastName: 'Desk' },
  'pha-1': { id: 'pha-1', firstName: 'Pavan', lastName: 'Shelf' },
  'doc-1': { id: 'doc-1', firstName: 'Praneeta', lastName: 'Rao' },
};

function world() {
  const imports = new Map<string, any>();
  const rows = new Map<string, any>();
  const effects: Array<{ name: string; userId: string }> = [];
  const audits: Array<{ action: string; userId: string; entityId: string }> = [];
  const rowKey = (importId: string, sourceRow: number) => `${importId}:${sourceRow}`;
  const withPeople = (m: any) => ({
    ...m,
    requestedBy: people[m.requestedById] ?? null,
    reviewedBy: people[m.reviewedById] ?? null,
    _count: { rows: [...rows.values()].filter((r) => r.importId === m.id).length },
  });
  const matches = (m: any, where: any) =>
    Object.entries(where).every(([key, value]: [string, any]) =>
      value && typeof value === 'object' && 'in' in value
        ? value.in.includes(m[key])
        : m[key] === value,
    );
  const prisma: any = {
    $executeRaw: async () => 0,
    $transaction: async (fn: any) => fn(prisma),
    auditLog: {
      create: async ({ data }: any) => audits.push(data),
    },
    inventoryItem: {
      findFirst: async ({ where }: any) =>
        where.name?.equals === 'Existing tablet' ? { id: 'item-et', currentStock: 12 } : null,
    },
    inventoryMigration: {
      upsert: async ({ where, create }: any) => {
        const found = [...imports.values()].find(
          (m) =>
            m.branchId === where.branchId_sha256.branchId &&
            m.sha256 === where.branchId_sha256.sha256,
        );
        if (found) return { ...found };
        const created = {
          id: `imp-${imports.size + 1}`,
          createdAt: new Date('2026-11-09T10:00:00Z'),
          reviewedById: null,
          reviewedAt: null,
          reviewNote: null,
          result: null,
          legacyResult: null,
          ...create,
        };
        imports.set(created.id, created);
        return { ...created };
      },
      findFirst: async ({ where }: any) => {
        const m = imports.get(where.id);
        return m && m.branchId === where.branchId ? withPeople(m) : null;
      },
      findUniqueOrThrow: async ({ where }: any) => withPeople(imports.get(where.id)),
      findMany: async ({ where }: any) =>
        [...imports.values()].filter((m) => matches(m, where)).map(withPeople),
      count: async ({ where }: any) =>
        [...imports.values()].filter((m) => matches(m, where)).length,
      update: async ({ where, data }: any) => Object.assign(imports.get(where.id), data),
      updateMany: async ({ where, data }: any) => {
        const m = imports.get(where.id);
        if (!m || !matches(m, where)) return { count: 0 };
        Object.assign(m, data);
        return { count: 1 };
      },
    },
    inventoryMigrationRow: {
      createMany: async ({ data }: any) => {
        for (const row of data)
          if (!rows.has(rowKey(row.importId, row.sourceRow)))
            rows.set(rowKey(row.importId, row.sourceRow), { ...row });
      },
      findUniqueOrThrow: async ({ where }: any) => {
        const { importId, sourceRow } = where.importId_sourceRow;
        return { ...rows.get(rowKey(importId, sourceRow)) };
      },
      findMany: async ({ where }: any) =>
        [...rows.values()]
          .filter((r) => r.importId === where.importId)
          .sort((a, b) => a.sourceRow - b.sourceRow),
      updateMany: async ({ where, data }: any) => {
        const row = rows.get(rowKey(where.importId, where.sourceRow));
        if (row && where.status.in.includes(row.status)) Object.assign(row, data);
        return { count: row ? 1 : 0 };
      },
    },
  };
  const service = new InventoryImportService(prisma);
  jest
    .spyOn(service as any, 'upsertImportRow')
    .mockImplementation(async (row: any, _branchId: any, userId: any) => {
      effects.push({ name: row.name, userId });
      const outcome = { status: 'created', drugCreated: true, stockAdjusted: true };
      Object.assign(rows.get(rowKey(row.importId, row.sourceRow)), {
        status: 'SUCCEEDED',
        outcome,
      });
      return outcome;
    });
  const statuses = (importId: string) =>
    [...rows.values()].filter((r) => r.importId === importId).map((r) => r.status);
  return { service, prisma, imports, effects, audits, statuses };
}

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation();
  jest.spyOn(Logger.prototype, 'warn').mockImplementation();
});
afterEach(() => jest.restoreAllMocks());

describe('opening import approval transitions', () => {
  it('starts staff uploads PENDING and approver uploads NOT_REQUIRED', () => {
    expect(
      ['RECEPTION', 'PHARMACIST', 'DOCTOR', 'ADMIN', 'OWNER'].map(newImportApproval),
    ).toEqual(['PENDING', 'PENDING', 'NOT_REQUIRED', 'NOT_REQUIRED', 'NOT_REQUIRED']);
  });

  it('moves a re-uploaded file by its current approval and the uploader', () => {
    expect(
      (['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((from) => [
        importApprovalOnUpload(from, 'RECEPTION'),
        importApprovalOnUpload(from, 'DOCTOR'),
      ]),
    ).toEqual([
      ['NOT_REQUIRED', 'NOT_REQUIRED'],
      ['PENDING', 'PENDING'],
      ['APPROVED', 'APPROVED'],
      ['PENDING', 'APPROVED'],
    ]);
  });

  it('lets only a PENDING import be approved or rejected, and only open imports run rows', () => {
    expect(nextImportApproval('PENDING', 'approve')).toBe('APPROVED');
    expect(nextImportApproval('PENDING', 'reject')).toBe('REJECTED');
    expect(nextImportApproval('APPROVED', 'reject')).toBeNull();
    expect(nextImportApproval('REJECTED', 'approve')).toBeNull();
    expect(nextImportApproval('NOT_REQUIRED', 'approve')).toBeNull();
    expect(
      (['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(importRowsMayRun),
    ).toEqual([true, false, true, false]);
  });
});

describe('opening import under doctor approval', () => {
  it('holds a staff upload as PENDING without touching stock', async () => {
    const w = world();
    const summary = await w.service.importStarterExcel(twoRows(), reception);

    expect(summary).toMatchObject({
      importId: 'imp-1',
      totalRows: 2,
      created: 0,
      updated: 0,
      skipped: 2,
      pendingRows: 2,
      approval: {
        status: 'PENDING',
        requestedBy: { firstName: 'Riya' },
        reviewedBy: null,
        note: null,
      },
    });
    expect(w.effects).toEqual([]);
    expect(w.statuses('imp-1')).toEqual(['PENDING', 'PENDING']);
  });

  it('processes an approver upload immediately under the approver', async () => {
    const w = world();
    const summary = await w.service.importStarterExcel(twoRows(), doctor);

    expect(summary).toMatchObject({
      created: 2,
      skipped: 0,
      approval: { status: 'NOT_REQUIRED', requestedBy: null },
    });
    expect(w.effects).toEqual([
      { name: 'New cream', userId: 'doc-1' },
      { name: 'Existing tablet', userId: 'doc-1' },
    ]);
  });

  it('approve runs every row once under the doctor and a concurrent approve gets 409', async () => {
    const w = world();
    await w.service.importStarterExcel(twoRows(), reception);

    const [first, second] = await Promise.allSettled([
      w.service.approve('imp-1', doctor),
      w.service.approve('imp-1', doctor),
    ]);

    expect(first).toMatchObject({
      status: 'fulfilled',
      value: {
        created: 2,
        skipped: 0,
        approval: {
          status: 'APPROVED',
          requestedBy: { firstName: 'Riya' },
          reviewedBy: { firstName: 'Praneeta' },
        },
      },
    });
    expect(second).toMatchObject({
      status: 'rejected',
      reason: {
        status: 409,
        response: { message: 'This import was already approved', approval: 'APPROVED' },
      },
    });
    expect(w.effects).toEqual([
      { name: 'New cream', userId: 'doc-1' },
      { name: 'Existing tablet', userId: 'doc-1' },
    ]);
    expect(w.audits).toEqual([
      expect.objectContaining({ action: 'INVENTORY_IMPORT_APPROVED', userId: 'doc-1', entityId: 'imp-1' }),
    ]);
  });

  it('requires a note to reject and keeps the import PENDING without one', async () => {
    const w = world();
    await w.service.importStarterExcel(twoRows(), reception);

    await expect(w.service.reject('imp-1', doctor, '   ')).rejects.toMatchObject({
      status: 400,
      response: { message: 'A note is required to reject an import' },
    });
    expect(w.imports.get('imp-1').approval).toBe('PENDING');

    const rejected = await w.service.reject('imp-1', doctor, ' Counts are from last year ');
    expect(rejected.approval).toMatchObject({
      status: 'REJECTED',
      reviewedBy: { firstName: 'Praneeta' },
      note: 'Counts are from last year',
    });
    expect(w.audits).toEqual([
      expect.objectContaining({ action: 'INVENTORY_IMPORT_REJECTED', userId: 'doc-1' }),
    ]);
    expect(w.effects).toEqual([]);
  });

  it('refuses retry or resume while PENDING or REJECTED', async () => {
    const w = world();
    await w.service.importStarterExcel(twoRows(), reception);

    await expect(w.service.retryFailedRows('imp-1', 'b1', 'rec-1')).rejects.toMatchObject({
      status: 409,
      response: { message: "This import is waiting for a doctor's approval", approval: 'PENDING' },
    });
    await w.service.reject('imp-1', doctor, 'Counts are from last year');
    await expect(w.service.retryFailedRows('imp-1', 'b1', 'rec-1')).rejects.toMatchObject({
      status: 409,
      response: { message: 'This import was rejected: Counts are from last year', approval: 'REJECTED' },
    });
    expect(w.effects).toEqual([]);
  });

  it('reopens a rejected file re-uploaded by staff and keeps it unprocessed', async () => {
    const w = world();
    await w.service.importStarterExcel(twoRows(), reception);
    await w.service.reject('imp-1', doctor, 'Counts are from last year');

    const reopened = await w.service.importStarterExcel(twoRows(), pharmacist);

    expect(reopened).toMatchObject({
      importId: 'imp-1',
      created: 0,
      approval: {
        status: 'PENDING',
        requestedBy: { firstName: 'Pavan' },
        reviewedBy: null,
        reviewedAt: null,
        note: null,
      },
    });
    expect(w.effects).toEqual([]);
  });

  it('treats a doctor re-uploading a rejected file as approval and runs it', async () => {
    const w = world();
    await w.service.importStarterExcel(twoRows(), reception);
    await w.service.reject('imp-1', doctor, 'Counts are from last year');

    const approved = await w.service.importStarterExcel(twoRows(), doctor);

    expect(approved).toMatchObject({
      created: 2,
      approval: { status: 'APPROVED', reviewedBy: { firstName: 'Praneeta' }, note: null },
    });
    expect(w.effects.map((e) => e.userId)).toEqual(['doc-1', 'doc-1']);
    expect(w.audits.map((a) => a.action)).toEqual([
      'INVENTORY_IMPORT_REJECTED',
      'INVENTORY_IMPORT_APPROVED',
    ]);
  });

  it('leaves a PENDING file pending when it is uploaded again, even by a doctor', async () => {
    const w = world();
    await w.service.importStarterExcel(twoRows(), reception);

    const again = await w.service.importStarterExcel(twoRows(), doctor);

    expect(again).toMatchObject({ created: 0, approval: { status: 'PENDING' } });
    expect(w.effects).toEqual([]);
  });

  it('lets staff retry rows of an approved file', async () => {
    const w = world();
    await w.service.importStarterExcel(twoRows(), reception);
    const save = (w.service as any).upsertImportRow.getMockImplementation();
    (w.service as any).upsertImportRow.mockImplementationOnce(async () => {
      throw Object.assign(new Error('Synthetic timeout'), { code: 'P2028' });
    });
    const approved = await w.service.approve('imp-1', doctor);
    expect(approved).toMatchObject({ created: 1, skipped: 1, retryableRows: 1 });

    (w.service as any).upsertImportRow.mockImplementation(save);
    const retried = await w.service.retryFailedRows('imp-1', 'b1', 'rec-1');

    expect(retried).toMatchObject({ created: 2, skipped: 0, retryableRows: 0 });
    expect(w.effects).toEqual([
      { name: 'Existing tablet', userId: 'doc-1' },
      { name: 'New cream', userId: 'rec-1' },
    ]);
  });

  it('lists pending files with a new-or-existing batch preview, scoped to the requester for staff', async () => {
    const w = world();
    await w.service.importStarterExcel(twoRows(), reception);
    await w.service.importStarterExcel(
      workbook([['Drug name'], ['Other staff row']], 'other.xlsx'),
      pharmacist,
    );

    const forDoctor = await w.service.pendingImports(doctor);
    const forReception = await w.service.pendingImports(reception);

    expect(forDoctor.map((i) => i.fileName)).toEqual(['opening.xlsx', 'other.xlsx']);
    expect(forReception.map((i) => i.fileName)).toEqual(['opening.xlsx']);
    expect(forDoctor[0]).toMatchObject({
      rowCount: 2,
      approval: { status: 'PENDING', requestedBy: { firstName: 'Riya' } },
      rows: [
        { sourceRow: 2, name: 'New cream', batchNumber: 'NC-1', currentStock: 5, batch: 'NEW' },
        {
          sourceRow: 3,
          name: 'Existing tablet',
          batchNumber: 'ET-1',
          currentStock: 12,
          batch: 'EXISTING',
          existingStock: 12,
        },
      ],
    });
    expect(w.effects).toEqual([]);
  });

  it('lists reviewed files as history with the reviewer and note', async () => {
    const w = world();
    await w.service.importStarterExcel(twoRows(), reception);
    await w.service.reject('imp-1', doctor, 'Counts are from last year');

    expect(await w.service.reviewedImports(reception)).toMatchObject([
      {
        importId: 'imp-1',
        fileName: 'opening.xlsx',
        rowCount: 2,
        approval: { status: 'REJECTED', reviewedBy: { firstName: 'Praneeta' }, note: 'Counts are from last year' },
      },
    ]);
    expect(await w.service.pendingImports(doctor)).toEqual([]);
  });

  it('counts pending imports in the approvals badge', async () => {
    const w = world();
    await w.service.importStarterExcel(twoRows(), reception);
    w.prisma.inventoryItemRequest = { count: async () => 1 };
    const requests = new InventoryItemRequestService(w.prisma, {} as any);

    expect(await requests.pendingCount(doctor)).toEqual({ count: 2 });
    expect(await requests.pendingCount(pharmacist)).toEqual({ count: 1 });
  });
});

describe('opening import approval routes', () => {
  const guard = new RolesGuard(new Reflector());
  const proto = InventoryController.prototype;
  const ctx = (handler: any, role: string): any => ({
    getHandler: () => handler,
    getClass: () => InventoryController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  });

  it.each(['PHARMACIST', 'RECEPTION', 'MANAGER', 'NURSE'])('%s cannot approve or reject an import', (role) => {
    expect([guard.canActivate(ctx(proto.approveImport, role)), guard.canActivate(ctx(proto.rejectImport, role))]).toEqual([false, false]);
  });

  it.each(['DOCTOR', 'ADMIN', 'OWNER'])('%s can approve and reject an import', (role) => {
    expect([guard.canActivate(ctx(proto.approveImport, role)), guard.canActivate(ctx(proto.rejectImport, role))]).toEqual([true, true]);
  });

  describe('over HTTP', () => {
    let app: INestApplication;
    const importer = {
      importStarterExcel: jest.fn(),
      approve: jest.fn(async () => ({ importId: 'imp-1', approval: { status: 'APPROVED' } })),
    };
    beforeAll(async () => {
      app = await accessApp(InventoryController, [
        { provide: InventoryService, useValue: {} },
        { provide: InventoryImportService, useValue: importer },
        { provide: InventoryItemRequestService, useValue: {} },
      ]);
    });
    afterAll(() => app.close());

    it('refuses a pharmacist approving even with stock grants, and lets a doctor approve', async () => {
      await request(app.getHttpServer())
        .post('/inventory/imports/imp-1/approve')
        .set('x-user', 'pharmacistStocker')
        .expect(403);
      const approved = await request(app.getHttpServer())
        .post('/inventory/imports/imp-1/approve')
        .set('x-user', 'doctor')
        .expect(200);
      expect(approved.body).toEqual({ importId: 'imp-1', approval: { status: 'APPROVED' } });
    });

    it('answers 202 PENDING_APPROVAL for a held upload and 201 for a processed one', async () => {
      const summary = (status: string) => ({
        importId: 'imp-1',
        totalRows: 1,
        created: status === 'PENDING' ? 0 : 1,
        updated: 0,
        skipped: status === 'PENDING' ? 1 : 0,
        approval: { status },
      });
      importer.importStarterExcel
        .mockResolvedValueOnce(summary('PENDING'))
        .mockResolvedValueOnce(summary('NOT_REQUIRED'));
      const upload = () =>
        request(app.getHttpServer())
          .post('/inventory/items/import')
          .set('x-user', 'doctor')
          .attach('file', Buffer.from('x'), 'opening.xlsx');

      const held = await upload().expect(202);
      const done = await upload().expect(201);

      expect(held.body).toEqual({ status: 'PENDING_APPROVAL', ...summary('PENDING') });
      expect(done.body).toEqual(summary('NOT_REQUIRED'));
    });
  });
});
