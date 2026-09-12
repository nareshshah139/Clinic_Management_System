import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/guards/permissions.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { PharmacyPurchaseInvoiceController } from '../pharmacy-purchase-invoice.controller';
import { PharmacyPurchaseInvoiceService } from '../pharmacy-purchase-invoice.service';

// Exercise the real route metadata, role guard, permission guard and multipart
// upload together. Only authentication identity, database and OCR are test doubles.
describe('Purchase invoice access through HTTP', () => {
  let app: INestApplication;
  let role: UserRole;
  let userPermissions: string[];
  let rolePermissions: string[];
  const service = {
    capabilities: jest.fn().mockResolvedValue({read:false,create:false,review:false,commit:false,automate:false}),
    purchaseSuppliers: jest.fn().mockResolvedValue([]),
    extractDraftFromDocument: jest.fn().mockResolvedValue({ draft: { items: [] } }),
    findAll: jest.fn().mockResolvedValue({ data: [] }),
    findOne: jest.fn().mockResolvedValue({ id: 'draft-1' }),
    createDraft: jest.fn().mockResolvedValue({ id: 'draft-1' }),
    updateDraft: jest.fn().mockResolvedValue({ id: 'draft-1' }),
    suggestMasterMatches: jest.fn().mockResolvedValue({ matches: [] }),
    confirmMasterRecord: jest.fn().mockResolvedValue({}),
    getDistributorAnalytics: jest.fn().mockResolvedValue({}),
    markReviewed: jest.fn().mockResolvedValue({ status: 'REVIEWED' }),
    commitStock: jest.fn().mockResolvedValue({ status: 'STOCK_COMMITTED' }),
    listUnlinkedDocuments: jest.fn().mockResolvedValue([]),
    getOriginalDocument: jest.fn().mockResolvedValue({ data: Buffer.from('%PDF-original'), sizeBytes: 13, mimeType: 'application/pdf', fileName: 'invoice.pdf' }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PharmacyPurchaseInvoiceController],
      providers: [
        { provide: PharmacyPurchaseInvoiceService, useValue: service },
        { provide: PrismaService, useValue: {
          user: { findUnique: jest.fn(async () => ({ role, permissions: JSON.stringify(userPermissions) })) },
          role: { findFirst: jest.fn(async () => ({ permissions: JSON.stringify(rolePermissions) })) },
        } },
        RolesGuard,
        PermissionsGuard,
        Reflector,
      ],
    }).overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: any) {
        if (!context.switchToHttp().getRequest().user) throw new UnauthorizedException();
        return true;
      },
    }).compile();
    app = module.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      req.user = { id: 'staff-1', branchId: 'branch-1', role };
      next();
    });
    app.useGlobalGuards(module.get(RolesGuard), module.get(PermissionsGuard));
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => { await app?.close(); });
  beforeEach(() => {
    jest.clearAllMocks();
    role = UserRole.RECEPTION;
    userPermissions = [];
    rolePermissions = [];
  });

  const upload = () => request(app.getHttpServer())
    .post('/pharmacy/purchase-invoices/ocr/extract')
    .attach('file', Buffer.from('invoice-test-pixels'), { filename: 'invoice.jpg', contentType: 'image/jpeg' });

  it('allows staff to learn their capabilities before any purchase permissions are granted', async () => {
    const response = await request(app.getHttpServer()).get('/pharmacy/purchase-invoices/capabilities').expect(200);
    expect(response.body.automate).toBe(false);
    expect(service.capabilities).toHaveBeenCalledWith({id:'staff-1',branchId:'branch-1',role:'RECEPTION'});
  });

  it('lists branch suppliers only with purchase read or create access', async () => {
    await request(app.getHttpServer()).get('/pharmacy/purchase-invoices/suppliers').expect(403);
    userPermissions = ['inventory:po:create'];
    await request(app.getHttpServer()).get('/pharmacy/purchase-invoices/suppliers').expect(200);
    expect(service.purchaseSuppliers).toHaveBeenCalledWith('branch-1');
  });

  it('lets Reception with explicit purchase permission reach OCR', async () => {
    userPermissions = ['pharmacy:purchase-invoice:create'];
    await upload().expect(201);
    expect(service.extractDraftFromDocument).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'invoice.jpg', buffer: Buffer.from('invoice-test-pixels') }),
      'branch-1',
      'staff-1',
    );
  });

  it('lets existing Reception inventory purchasing access reach OCR', async () => {
    rolePermissions = ['inventory:po:create'];
    await upload().expect(201);
    expect(service.extractDraftFromDocument).toHaveBeenCalledTimes(1);
    expect(service.createDraft).not.toHaveBeenCalled();
    expect(service.commitStock).not.toHaveBeenCalled();
  });

  it('serves original documents only with invoice read access, with private download headers', async () => {
    await request(app.getHttpServer()).get('/pharmacy/purchase-invoices/documents/document-1').expect(403);
    expect(service.getOriginalDocument).not.toHaveBeenCalled();
    userPermissions = ['inventory:po:read'];
    const response = await request(app.getHttpServer()).get('/pharmacy/purchase-invoices/documents/document-1').expect(200);
    expect(response.body).toEqual(Buffer.from('%PDF-original'));
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-disposition']).toContain('attachment;');
    expect(service.getOriginalDocument).toHaveBeenCalledWith('document-1', 'branch-1');
    await request(app.getHttpServer()).get('/pharmacy/purchase-invoices/documents').expect(200);
    expect(service.listUnlinkedDocuments).toHaveBeenCalledWith('branch-1');
  });

  const routes = [
    ['get', '', 'read', 'inventory:po:read', 'findAll', 200],
    ['get', '/draft-1', 'read', 'inventory:po:read', 'findOne', 200],
    ['get', '/analytics/distributors', 'read', 'inventory:po:read', 'getDistributorAnalytics', 200],
    ['post', '/drafts', 'create', 'inventory:po:create', 'createDraft', 201],
    ['patch', '/drafts/draft-1', 'create', 'inventory:po:create', 'updateDraft', 200],
    ['post', '/master-matches', 'create', 'inventory:po:create', 'suggestMasterMatches', 201],
    ['post', '/master-confirmations', 'create', 'inventory:po:create', 'confirmMasterRecord', 201],
    ['patch', '/draft-1/review', 'review', 'inventory:po:update', 'markReviewed', 200],
    ['post', '/draft-1/commit-stock', 'commit-stock', 'inventory:transaction:create', 'commitStock', 201],
  ] as const;

  it.each(routes)('allows authorized Reception %s %s', async (method, path, _permission, inventoryPermission, action, status) => {
    rolePermissions = [inventoryPermission];
    await request(app.getHttpServer())[method](`/pharmacy/purchase-invoices${path}`).send({ items: [] }).expect(status);
    expect(service[action]).toHaveBeenCalledTimes(1);
  });

  it.each(routes)('denies Reception without permission %s %s', async (method, path, _permission, _inventoryPermission, action) => {
    await request(app.getHttpServer())[method](`/pharmacy/purchase-invoices${path}`).send({ items: [] }).expect(403);
    expect(service[action]).not.toHaveBeenCalled();
  });

  it('does not let OCR permission grant review or stock commit', async () => {
    rolePermissions = ['inventory:po:create', 'pharmacy:purchase-invoice:create'];
    await request(app.getHttpServer()).patch('/pharmacy/purchase-invoices/draft-1/review').send({}).expect(403);
    await request(app.getHttpServer()).post('/pharmacy/purchase-invoices/draft-1/commit-stock').send({}).expect(403);
  });

  it.each([UserRole.PATIENT, UserRole.NURSE, UserRole.ACCOUNTANT])('does not grant %s access through inventory permissions', async (otherRole) => {
    role = otherRole;
    rolePermissions = ['inventory:po:create', 'pharmacy:purchase-invoice:create'];
    await upload().expect(403);
    expect(service.extractDraftFromDocument).not.toHaveBeenCalled();
  });

  it('keeps Pharmacist explicit purchase permissions working', async () => {
    role = UserRole.PHARMACIST;
    userPermissions = ['pharmacy:purchase-invoice:create'];
    await upload().expect(201);
  });
});
