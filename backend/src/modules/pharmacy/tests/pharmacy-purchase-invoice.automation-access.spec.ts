import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/guards/permissions.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { PharmacyPurchaseInvoiceController } from '../pharmacy-purchase-invoice.controller';
import { PharmacyPurchaseInvoiceService } from '../pharmacy-purchase-invoice.service';

describe('Automatic intake HTTP permissions', () => {
  let app: INestApplication;
  let permissions: string[];
  let role: string;
  const required = ['create', 'review', 'commit-stock'].map((action) => `pharmacy:purchase-invoice:${action}`);
  const service = { importFromDocument: jest.fn().mockResolvedValue({}), processInvoice: jest.fn().mockResolvedValue({}) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PharmacyPurchaseInvoiceController],
      providers: [
        RolesGuard, PermissionsGuard,
        { provide: PharmacyPurchaseInvoiceService, useValue: service },
        { provide: PrismaService, useValue: {
          user: { findUnique: async () => ({ role, permissions: JSON.stringify(permissions) }) },
          role: { findFirst: async () => ({ permissions: '[]' }) },
        } },
      ],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      req.user = { id: 'user-1', branchId: 'branch-1', role }; next();
    });
    app.useGlobalGuards(module.get(RolesGuard), module.get(PermissionsGuard));
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => { role = 'PHARMACIST'; permissions = [...required]; jest.clearAllMocks(); });
  const upload = () => request(app.getHttpServer()).post('/pharmacy/purchase-invoices/ocr/import')
    .field('goodsReceivedDate', '2026-09-12')
    .attach('file', Buffer.from('synthetic'), { filename: 'test.jpg', contentType: 'image/jpeg' });

  it('passes the file, confirmed receipt date and authenticated identity to automatic import', async () => {
    await upload().expect(201);
    expect(service.importFromDocument).toHaveBeenCalledWith(expect.objectContaining({ originalname: 'test.jpg' }), 'branch-1', 'user-1', '2026-09-12');
    await request(app.getHttpServer()).post('/pharmacy/purchase-invoices/invoice-1/process').send({}).expect(201);
    expect(service.processInvoice).toHaveBeenCalledWith('invoice-1', 'branch-1', 'user-1');
  });

  it.each(required)('requires %s in addition to the other permissions', async (missing) => {
    permissions = required.filter((permission) => permission !== missing);
    await upload().expect(403);
    await request(app.getHttpServer()).post('/pharmacy/purchase-invoices/invoice-1/process').send({}).expect(403);
    expect(service.importFromDocument).not.toHaveBeenCalled();
    expect(service.processInvoice).not.toHaveBeenCalled();
  });

  it('allows Reception with all three corresponding Inventory permissions', async () => {
    role = 'RECEPTION';
    permissions = ['inventory:po:create', 'inventory:po:update', 'inventory:transaction:create'];
    await upload().expect(201);
  });

  it.each(['inventory:po:create', 'inventory:po:update', 'inventory:transaction:create'])('still requires Reception %s', async (missing) => {
    role = 'RECEPTION';
    permissions = ['inventory:po:create', 'inventory:po:update', 'inventory:transaction:create'].filter((permission) => permission !== missing);
    await upload().expect(403);
    expect(service.importFromDocument).not.toHaveBeenCalled();
  });
});
