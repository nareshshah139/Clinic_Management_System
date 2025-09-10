import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { BillingModule } from '../billing.module';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { InvoiceStatus, PaymentMethod, PaymentStatus } from '../dto/invoice.dto';

describe('BillingController (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const mockUser = {
    id: 'user-123',
    branchId: 'branch-123',
    role: 'DOCTOR',
  };

  const mockAuthGuard = {
    canActivate: jest.fn(() => true),
  };

  // Mock Prisma Service
  const mockPrismaService = {
    patient: {
      findFirst: jest.fn(),
    },
    visit: {
      findFirst: jest.fn(),
    },
    appointment: {
      findFirst: jest.fn(),
    },
    invoice: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    payment: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    refund: {
      create: jest.fn(),
    },
    onModuleInit: jest.fn(),
    $connect: jest.fn(),
    enableShutdownHooks: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [BillingModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideGuard(JwtAuthGuard)
      .useValue(mockAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);

    // Mock request user
    app.use((req, res, next) => {
      req.user = mockUser;
      next();
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('/billing/invoices (POST)', () => {
    it('should create a new invoice', async () => {
      const createInvoiceDto = {
        patientId: 'patient-123',
        visitId: 'visit-123',
        items: [
          {
            name: 'Consultation',
            description: 'General consultation',
            quantity: 1,
            unitPrice: 500,
            gstRate: 18,
          },
          {
            name: 'Medicine',
            description: 'Prescribed medicine',
            quantity: 2,
            unitPrice: 100,
            gstRate: 18,
          },
        ],
        discount: 10,
        discountReason: 'Senior citizen discount',
        notes: 'Regular patient',
        dueDate: '2024-12-30',
      };

      const mockPatient = { id: 'patient-123', name: 'John Doe' };
      const mockVisit = { id: 'visit-123', createdAt: new Date() };
      const mockInvoice = {
        id: 'invoice-123',
        invoiceNumber: 'INV-20241225-001',
        ...createInvoiceDto,
        subtotal: 700,
        discount: 70,
        gstAmount: 113.4,
        totalAmount: 743.4,
        status: InvoiceStatus.DRAFT,
        patient: mockPatient,
        visit: mockVisit,
        appointment: null,
      };

      mockPrismaService.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrismaService.visit.findFirst.mockResolvedValue(mockVisit);
      mockPrismaService.invoice.create.mockResolvedValue(mockInvoice);

      const response = await request(app.getHttpServer())
        .post('/billing/invoices')
        .send(createInvoiceDto)
        .expect(201);

      expect(response.body).toMatchObject({
        id: 'invoice-123',
        invoiceNumber: 'INV-20241225-001',
        patientId: 'patient-123',
        visitId: 'visit-123',
        totalAmount: 743.4,
        status: InvoiceStatus.DRAFT,
      });
    });

    it('should return 400 for missing items', async () => {
      const createInvoiceDto = {
        patientId: 'patient-123',
        items: [], // Empty items array
      };

      const mockPatient = { id: 'patient-123', name: 'John Doe' };

      mockPrismaService.patient.findFirst.mockResolvedValue(mockPatient);

      await request(app.getHttpServer())
        .post('/billing/invoices')
        .send(createInvoiceDto)
        .expect(400);
    });

    it('should return 404 for non-existent patient', async () => {
      const createInvoiceDto = {
        patientId: 'non-existent',
        items: [
          {
            name: 'Consultation',
            quantity: 1,
            unitPrice: 500,
          },
        ],
      };

      mockPrismaService.patient.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/billing/invoices')
        .send(createInvoiceDto)
        .expect(404);
    });
  });

  describe('/billing/invoices (GET)', () => {
    it('should return paginated invoices', async () => {
      const mockInvoices = [
        {
          id: 'invoice-1',
          invoiceNumber: 'INV-20241225-001',
          totalAmount: 500,
          status: InvoiceStatus.PENDING,
          patient: { id: 'patient-1', name: 'John Doe' },
          visit: { id: 'visit-1', createdAt: new Date() },
          payments: [],
        },
      ];

      mockPrismaService.invoice.findMany.mockResolvedValue(mockInvoices);
      mockPrismaService.invoice.count.mockResolvedValue(1);

      const response = await request(app.getHttpServer())
        .get('/billing/invoices')
        .query({ page: 1, limit: 20 })
        .expect(200);

      expect(response.body).toHaveProperty('invoices');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.invoices).toHaveLength(1);
    });

    it('should filter invoices by status', async () => {
      mockPrismaService.invoice.findMany.mockResolvedValue([]);
      mockPrismaService.invoice.count.mockResolvedValue(0);

      await request(app.getHttpServer())
        .get('/billing/invoices')
        .query({ status: InvoiceStatus.PENDING })
        .expect(200);

      expect(mockPrismaService.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: InvoiceStatus.PENDING,
          }),
        }),
      );
    });
  });

  describe('/billing/invoices/outstanding (GET)', () => {
    it('should return outstanding invoices', async () => {
      const mockInvoices = [
        {
          id: 'invoice-1',
          totalAmount: 500,
          dueDate: new Date('2024-11-30'),
          status: InvoiceStatus.PENDING,
          patient: { id: 'patient-1', name: 'John Doe' },
          payments: [
            { id: 'payment-1', amount: 200, status: PaymentStatus.COMPLETED },
          ],
        },
      ];

      mockPrismaService.invoice.findMany.mockResolvedValue(mockInvoices);

      const response = await request(app.getHttpServer())
        .get('/billing/invoices/outstanding')
        .query({ overdueAfter: '2024-12-01' })
        .expect(200);

      expect(response.body).toHaveProperty('invoices');
      expect(response.body).toHaveProperty('totalOutstanding');
      expect(response.body).toHaveProperty('overdueCount');
      expect(response.body.invoices).toHaveLength(1);
    });
  });

  describe('/billing/invoices/:id (GET)', () => {
    it('should return invoice by id', async () => {
      const invoiceId = 'invoice-123';
      const mockInvoice = {
        id: invoiceId,
        invoiceNumber: 'INV-20241225-001',
        items: JSON.stringify([
          { name: 'Consultation', quantity: 1, unitPrice: 500 },
        ]),
        metadata: JSON.stringify({ source: 'web' }),
        totalAmount: 590,
        status: InvoiceStatus.PENDING,
        patient: { id: 'patient-123', name: 'John Doe' },
        visit: { id: 'visit-123', createdAt: new Date() },
        payments: [],
        refunds: [],
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(mockInvoice);

      const response = await request(app.getHttpServer())
        .get(`/billing/invoices/${invoiceId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: invoiceId,
        invoiceNumber: 'INV-20241225-001',
        totalAmount: 590,
        status: InvoiceStatus.PENDING,
      });
      expect(response.body.items).toEqual([
        { name: 'Consultation', quantity: 1, unitPrice: 500 },
      ]);
      expect(response.body.metadata).toEqual({ source: 'web' });
    });

    it('should return 404 for non-existent invoice', async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/billing/invoices/non-existent')
        .expect(404);
    });
  });

  describe('/billing/invoices/:id (PATCH)', () => {
    it('should update invoice', async () => {
      const invoiceId = 'invoice-123';
      const updateDto = {
        items: [
          { name: 'Updated Consultation', quantity: 1, unitPrice: 600 },
        ],
        notes: 'Updated notes',
      };

      const mockInvoice = {
        id: invoiceId,
        status: InvoiceStatus.DRAFT,
        totalAmount: 500,
        payments: [],
        items: JSON.stringify([{ name: 'Consultation', quantity: 1, unitPrice: 500 }]),
        metadata: JSON.stringify({ source: 'web' }),
        patient: { id: 'patient-123', name: 'John Doe' },
        visit: { id: 'visit-123', createdAt: new Date() },
        payments: [],
        refunds: [],
      };

      const mockUpdatedInvoice = {
        ...mockInvoice,
        notes: updateDto.notes,
        totalAmount: 708,
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(mockInvoice);
      mockPrismaService.invoice.update.mockResolvedValue(mockUpdatedInvoice);

      const response = await request(app.getHttpServer())
        .patch(`/billing/invoices/${invoiceId}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.notes).toBe(updateDto.notes);
    });
  });

  describe('/billing/invoices/:id (DELETE)', () => {
    it('should cancel invoice', async () => {
      const invoiceId = 'invoice-123';
      const reason = 'Patient cancelled';

      const mockInvoice = {
        id: invoiceId,
        status: InvoiceStatus.PENDING,
        totalAmount: 500,
        payments: [],
        items: JSON.stringify([{ name: 'Consultation', quantity: 1, unitPrice: 500 }]),
        metadata: JSON.stringify({ source: 'web' }),
        patient: { id: 'patient-123', name: 'John Doe' },
        visit: { id: 'visit-123', createdAt: new Date() },
        payments: [],
        refunds: [],
      };

      const mockCancelledInvoice = {
        ...mockInvoice,
        status: InvoiceStatus.CANCELLED,
        notes: `Cancelled: ${reason}`,
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(mockInvoice);
      mockPrismaService.invoice.update.mockResolvedValue(mockCancelledInvoice);

      const response = await request(app.getHttpServer())
        .delete(`/billing/invoices/${invoiceId}`)
        .query({ reason })
        .expect(200);

      expect(response.body.status).toBe(InvoiceStatus.CANCELLED);
    });
  });

  describe('/billing/payments (POST)', () => {
    it('should process payment', async () => {
      const paymentDto = {
        invoiceId: 'invoice-123',
        amount: 500,
        method: PaymentMethod.CASH,
        transactionId: 'TXN-123',
        notes: 'Cash payment',
      };

      const mockInvoice = {
        id: 'invoice-123',
        totalAmount: 500,
        status: InvoiceStatus.PENDING,
        payments: [],
        items: JSON.stringify([{ name: 'Consultation', quantity: 1, unitPrice: 500 }]),
        metadata: JSON.stringify({ source: 'web' }),
        patient: { id: 'patient-123', name: 'John Doe' },
        visit: { id: 'visit-123', createdAt: new Date() },
        payments: [],
        refunds: [],
      };

      const mockPayment = {
        id: 'payment-123',
        ...paymentDto,
        status: PaymentStatus.PENDING,
        invoice: {
          id: 'invoice-123',
          invoiceNumber: 'INV-20241225-001',
          totalAmount: 500,
          patient: { id: 'patient-123', name: 'John Doe' },
        },
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(mockInvoice);
      mockPrismaService.payment.create.mockResolvedValue(mockPayment);
      mockPrismaService.invoice.update.mockResolvedValue({
        ...mockInvoice,
        status: InvoiceStatus.PAID,
      });

      const response = await request(app.getHttpServer())
        .post('/billing/payments')
        .send(paymentDto)
        .expect(201);

      expect(response.body).toMatchObject({
        id: 'payment-123',
        invoiceId: 'invoice-123',
        amount: 500,
        method: PaymentMethod.CASH,
        status: PaymentStatus.PENDING,
      });
    });

    it('should return 400 if payment amount exceeds remaining balance', async () => {
      const paymentDto = {
        invoiceId: 'invoice-123',
        amount: 600,
        method: PaymentMethod.CASH,
      };

      const mockInvoice = {
        id: 'invoice-123',
        totalAmount: 500,
        status: InvoiceStatus.PENDING,
        payments: [],
        items: JSON.stringify([{ name: 'Consultation', quantity: 1, unitPrice: 500 }]),
        metadata: JSON.stringify({ source: 'web' }),
        patient: { id: 'patient-123', name: 'John Doe' },
        visit: { id: 'visit-123', createdAt: new Date() },
        payments: [],
        refunds: [],
      };

      mockPrismaService.invoice.findFirst.mockResolvedValue(mockInvoice);

      await request(app.getHttpServer())
        .post('/billing/payments')
        .send(paymentDto)
        .expect(400);
    });
  });

  describe('/billing/payments/bulk (POST)', () => {
    it('should process bulk payment', async () => {
      const bulkPaymentDto = {
        invoiceIds: ['invoice-1', 'invoice-2'],
        totalAmount: 1000,
        method: PaymentMethod.UPI,
        transactionId: 'BULK-TXN-123',
        notes: 'Bulk payment',
      };

      const mockInvoices = [
        {
          id: 'invoice-1',
          totalAmount: 500,
          payments: [],
        },
        {
          id: 'invoice-2',
          totalAmount: 500,
          payments: [],
        },
      ];

      const mockPayments = [
        {
          id: 'payment-1',
          invoiceId: 'invoice-1',
          amount: 500,
          method: PaymentMethod.UPI,
          status: PaymentStatus.PENDING,
        },
        {
          id: 'payment-2',
          invoiceId: 'invoice-2',
          amount: 500,
          method: PaymentMethod.UPI,
          status: PaymentStatus.PENDING,
        },
      ];

      mockPrismaService.invoice.findMany.mockResolvedValue(mockInvoices);
      mockPrismaService.payment.create
        .mockResolvedValueOnce(mockPayments[0])
        .mockResolvedValueOnce(mockPayments[1]);
      mockPrismaService.invoice.update.mockResolvedValue({});

      const response = await request(app.getHttpServer())
        .post('/billing/payments/bulk')
        .send(bulkPaymentDto)
        .expect(201);

      expect(response.body).toHaveProperty('payments');
      expect(response.body).toHaveProperty('totalAmount');
      expect(response.body).toHaveProperty('invoiceCount');
      expect(response.body.totalAmount).toBe(1000);
      expect(response.body.invoiceCount).toBe(2);
    });
  });

  describe('/billing/payments/:id/confirm (POST)', () => {
    it('should confirm payment', async () => {
      const paymentId = 'payment-123';
      const gatewayResponse = { transactionId: 'GATEWAY-123', status: 'success' };

      const mockPayment = {
        id: paymentId,
        invoiceId: 'invoice-123',
        status: PaymentStatus.PENDING,
        gatewayResponse: null,
      };

      const mockConfirmedPayment = {
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
        gatewayResponse: JSON.stringify(gatewayResponse),
      };

      mockPrismaService.payment.findFirst.mockResolvedValue(mockPayment);
      mockPrismaService.payment.update.mockResolvedValue(mockConfirmedPayment);
      mockPrismaService.invoice.update.mockResolvedValue({});

      const response = await request(app.getHttpServer())
        .post(`/billing/payments/${paymentId}/confirm`)
        .send(gatewayResponse)
        .expect(201);

      expect(response.body.status).toBe(PaymentStatus.COMPLETED);
    });
  });

  describe('/billing/payments (GET)', () => {
    it('should return paginated payments', async () => {
      const mockPayments = [
        {
          id: 'payment-1',
          amount: 500,
          method: PaymentMethod.CASH,
          status: PaymentStatus.COMPLETED,
          invoice: {
            id: 'invoice-1',
            invoiceNumber: 'INV-20241225-001',
            totalAmount: 500,
            patient: { id: 'patient-1', name: 'John Doe' },
          },
        },
      ];

      mockPrismaService.payment.findMany.mockResolvedValue(mockPayments);
      mockPrismaService.payment.count.mockResolvedValue(1);

      const response = await request(app.getHttpServer())
        .get('/billing/payments')
        .query({ page: 1, limit: 20 })
        .expect(200);

      expect(response.body).toHaveProperty('payments');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.payments).toHaveLength(1);
    });
  });

  describe('/billing/payments/summary (GET)', () => {
    it('should return payment summary', async () => {
      const mockSummary = {
        totalAmount: 10000,
        paymentCount: 20,
        methodBreakdown: [
          { method: PaymentMethod.CASH, amount: 5000, count: 10 },
          { method: PaymentMethod.UPI, amount: 5000, count: 10 },
        ],
        dailyBreakdown: [
          { date: '2024-12-01T00:00:00.000Z', amount: 1000, count: 2 },
          { date: '2024-12-02T00:00:00.000Z', amount: 1500, count: 3 },
        ],
        period: {
          startDate: '2024-12-01',
          endDate: '2024-12-31',
        },
      };

      mockPrismaService.payment.aggregate.mockResolvedValue({ _sum: { amount: 10000 } });
      mockPrismaService.payment.count.mockResolvedValue(20);
      mockPrismaService.payment.groupBy
        .mockResolvedValueOnce([
          { method: PaymentMethod.CASH, _sum: { amount: 5000 }, _count: { id: 10 } },
          { method: PaymentMethod.UPI, _sum: { amount: 5000 }, _count: { id: 10 } },
        ])
        .mockResolvedValueOnce([
          { createdAt: new Date('2024-12-01'), _sum: { amount: 1000 }, _count: { id: 2 } },
          { createdAt: new Date('2024-12-02'), _sum: { amount: 1500 }, _count: { id: 3 } },
        ]);

      const response = await request(app.getHttpServer())
        .get('/billing/payments/summary')
        .query({ startDate: '2024-12-01', endDate: '2024-12-31' })
        .expect(200);

      expect(response.body).toEqual(mockSummary);
    });
  });

  describe('/billing/refunds (POST)', () => {
    it('should process refund', async () => {
      const refundDto = {
        paymentId: 'payment-123',
        amount: 100,
        reason: 'Patient request',
        notes: 'Partial refund',
      } as any;

      const mockPayment = {
        id: 'payment-123',
        invoiceId: 'invoice-123',
        amount: 500,
        reconStatus: 'COMPLETED',
        invoice: {
          id: 'invoice-123',
          invoiceNumber: 'INV-20241225-001',
        },
      } as any;

      const mockRefundPayment = {
        id: 'payment-refund-1',
        invoiceId: 'invoice-123',
        amount: -100,
        method: PaymentMethod.CASH,
        status: PaymentStatus.COMPLETED,
      } as any;

      mockPrismaService.payment.findFirst.mockResolvedValue(mockPayment);
      mockPrismaService.payment.create.mockResolvedValue(mockRefundPayment);
      mockPrismaService.invoice.findFirst.mockResolvedValue({ id: 'invoice-123', total: 500, received: 500 });
      mockPrismaService.invoice.update.mockResolvedValue({});

      const response = await request(app.getHttpServer())
        .post('/billing/refunds')
        .send(refundDto)
        .expect(201);

      expect(response.body).toMatchObject({
        id: 'payment-refund-1',
        invoiceId: 'invoice-123',
        amount: -100,
      });
    });
  });

  describe('/billing/reports/revenue (GET)', () => {
    it('should return revenue report', async () => {
      const mockPayments = [
        {
          id: 'payment-1',
          amount: 500,
          createdAt: new Date('2024-12-01'),
          invoice: {
            id: 'invoice-1',
            invoiceNumber: 'INV-001',
            items: JSON.stringify([{ name: 'Consultation' }]),
            visit: { doctor: { id: 'doctor-1', name: 'Dr. Smith' } },
            appointment: null,
          },
        },
      ];

      mockPrismaService.payment.findMany.mockResolvedValue(mockPayments);

      const response = await request(app.getHttpServer())
        .get('/billing/reports/revenue')
        .query({ startDate: '2024-12-01', endDate: '2024-12-31', groupBy: 'day' })
        .expect(200);

      expect(response.body).toHaveProperty('report');
      expect(response.body).toHaveProperty('summary');
      expect(response.body.summary.totalRevenue).toBe(500);
      expect(response.body.summary.totalTransactions).toBe(1);
    });
  });

  describe('/billing/statistics (GET)', () => {
    it('should return statistics', async () => {
      const mockStats = {
        totalAmount: 10000,
        paymentCount: 20,
        methodBreakdown: [],
        dailyBreakdown: [],
        period: {
          startDate: '2024-12-01',
          endDate: '2024-12-31',
        },
      };

      mockPrismaService.payment.aggregate.mockResolvedValue({ _sum: { amount: 10000 } });
      mockPrismaService.payment.count.mockResolvedValue(20);
      mockPrismaService.payment.groupBy.mockResolvedValue([]);

      const response = await request(app.getHttpServer())
        .get('/billing/statistics')
        .query({ startDate: '2024-12-01', endDate: '2024-12-31' })
        .expect(200);

      expect(response.body).toEqual(mockStats);
    });
  });
});
