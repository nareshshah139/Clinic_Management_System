import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { BillingService } from '../billing.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { InvoiceStatus, PaymentMethod, PaymentStatus } from '../dto/invoice.dto';

describe('BillingService', () => {
  let service: BillingService;
  let prisma: PrismaService;

  const mockPrisma = {
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
  };

  const mockBranchId = 'branch-123';
  const mockPatient = {
    id: 'patient-123',
    name: 'John Doe',
    phone: '1234567890',
  };
  const mockVisit = {
    id: 'visit-123',
    createdAt: new Date(),
    doctor: { id: 'doctor-123', name: 'Dr. Smith' },
  };
  const mockAppointment = {
    id: 'appointment-123',
    date: new Date(),
    slot: '10:00-10:30',
    doctor: { id: 'doctor-123', name: 'Dr. Smith' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createInvoice', () => {
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
    };

    it('should create an invoice successfully', async () => {
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

      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.visit.findFirst.mockResolvedValue(mockVisit);
      mockPrisma.invoice.create.mockResolvedValue(mockInvoice);

      const result = await service.createInvoice(createInvoiceDto, mockBranchId);

      expect(result).toEqual(mockInvoice);
      expect(mockPrisma.patient.findFirst).toHaveBeenCalledWith({
        where: { id: createInvoiceDto.patientId, branchId: mockBranchId },
      });
      expect(mockPrisma.visit.findFirst).toHaveBeenCalledWith({
        where: { id: createInvoiceDto.visitId, branchId: mockBranchId },
      });
    });

    it('should throw NotFoundException if patient not found', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(null);

      await expect(service.createInvoice(createInvoiceDto, mockBranchId)).rejects.toThrow(
        new NotFoundException('Patient not found in this branch'),
      );
    });

    it('should throw NotFoundException if visit not found', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.visit.findFirst.mockResolvedValue(null);

      await expect(service.createInvoice(createInvoiceDto, mockBranchId)).rejects.toThrow(
        new NotFoundException('Visit not found in this branch'),
      );
    });

    it('should throw BadRequestException if no items provided', async () => {
      const invalidDto = { ...createInvoiceDto, items: [], visitId: undefined };

      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      // Don't mock visit check for this test

      await expect(service.createInvoice(invalidDto, mockBranchId)).rejects.toThrow(
        new BadRequestException('At least one item is required'),
      );
    });
  });

  describe('findAllInvoices', () => {
    it('should return paginated invoices', async () => {
      const mockInvoices = [
        {
          id: 'invoice-1',
          invoiceNumber: 'INV-20241225-001',
          totalAmount: 500,
          status: InvoiceStatus.PENDING,
          patient: mockPatient,
          visit: mockVisit,
          payments: [],
        },
      ];

      mockPrisma.invoice.findMany.mockResolvedValue(mockInvoices);
      mockPrisma.invoice.count.mockResolvedValue(1);

      const query = { page: 1, limit: 20 };
      const result = await service.findAllInvoices(query, mockBranchId);

      expect(result).toEqual({
        invoices: mockInvoices,
        pagination: {
          total: 1,
          page: 1,
          limit: 20,
          pages: 1,
        },
      });
    });

    it('should apply filters correctly', async () => {
      const query = {
        patientId: 'patient-123',
        status: InvoiceStatus.PENDING,
        startDate: '2024-12-01',
        endDate: '2024-12-31',
      };

      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.invoice.count.mockResolvedValue(0);

      await service.findAllInvoices(query, mockBranchId);

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          branchId: mockBranchId,
          patientId: 'patient-123',
          status: InvoiceStatus.PENDING,
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
        include: expect.any(Object),
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findInvoiceById', () => {
    it('should return invoice by id with parsed JSON fields', async () => {
      const mockInvoice = {
        id: 'invoice-123',
        invoiceNumber: 'INV-20241225-001',
        items: JSON.stringify([
          { name: 'Consultation', quantity: 1, unitPrice: 500 },
        ]),
        metadata: JSON.stringify({ source: 'web' }),
        totalAmount: 590,
        status: InvoiceStatus.PENDING,
        patient: mockPatient,
        visit: mockVisit,
        payments: [],
        refunds: [],
      };

      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);

      const result = await service.findInvoiceById('invoice-123', mockBranchId);

      expect(result).toEqual({
        ...mockInvoice,
        items: [{ name: 'Consultation', quantity: 1, unitPrice: 500 }],
        metadata: { source: 'web' },
      });
      expect(mockPrisma.invoice.findFirst).toHaveBeenCalledWith({
        where: { id: 'invoice-123', branchId: mockBranchId },
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException if invoice not found', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.findInvoiceById('invoice-123', mockBranchId)).rejects.toThrow(
        new NotFoundException('Invoice not found'),
      );
    });
  });

  describe('updateInvoice', () => {
    it('should update invoice successfully', async () => {
      const mockInvoice = {
        id: 'invoice-123',
        status: InvoiceStatus.DRAFT,
        totalAmount: 500,
        payments: [],
        items: JSON.stringify([{ name: 'Consultation', quantity: 1, unitPrice: 500 }]),
        metadata: JSON.stringify({ source: 'web' }),
        patient: mockPatient,
        visit: mockVisit,
        payments: [],
        refunds: [],
      };

      const updateDto = {
        items: [
          { name: 'Updated Consultation', quantity: 1, unitPrice: 600 },
        ],
        notes: 'Updated notes',
      };

      const mockUpdatedInvoice = {
        ...mockInvoice,
        notes: updateDto.notes,
      };

      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);
      mockPrisma.invoice.update.mockResolvedValue(mockUpdatedInvoice);

      const result = await service.updateInvoice('invoice-123', updateDto, mockBranchId);

      expect(result).toEqual(mockUpdatedInvoice);
      expect(mockPrisma.invoice.update).toHaveBeenCalledWith({
        where: { id: 'invoice-123' },
        data: expect.objectContaining({
          notes: updateDto.notes,
        }),
        include: expect.any(Object),
      });
    });

    it('should throw BadRequestException if trying to update paid invoice', async () => {
      const mockInvoice = {
        id: 'invoice-123',
        status: InvoiceStatus.PAID,
        totalAmount: 500,
        payments: [],
        items: JSON.stringify([{ name: 'Consultation', quantity: 1, unitPrice: 500 }]),
        metadata: JSON.stringify({ source: 'web' }),
        patient: mockPatient,
        visit: mockVisit,
        payments: [],
        refunds: [],
      };

      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);

      const updateDto = { notes: 'Updated notes' };

      await expect(service.updateInvoice('invoice-123', updateDto, mockBranchId)).rejects.toThrow(
        new BadRequestException('Cannot update paid invoice'),
      );
    });
  });

  describe('processPayment', () => {
    it('should process payment successfully', async () => {
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
        patient: mockPatient,
        visit: mockVisit,
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
          patient: mockPatient,
        },
      };

      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);
      mockPrisma.payment.create.mockResolvedValue(mockPayment);
      mockPrisma.invoice.update.mockResolvedValue({
        ...mockInvoice,
        status: InvoiceStatus.PAID,
      });

      const result = await service.processPayment(paymentDto, mockBranchId);

      expect(result).toEqual(mockPayment);
      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          invoiceId: paymentDto.invoiceId,
          amount: paymentDto.amount,
          method: paymentDto.method,
          status: PaymentStatus.PENDING,
        }),
        include: expect.any(Object),
      });
    });

    it('should throw BadRequestException if payment amount exceeds remaining balance', async () => {
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
        patient: mockPatient,
        visit: mockVisit,
        payments: [],
        refunds: [],
      };

      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);

      await expect(service.processPayment(paymentDto, mockBranchId)).rejects.toThrow(
        new BadRequestException('Payment amount (600) exceeds remaining balance (500)'),
      );
    });
  });

  describe('confirmPayment', () => {
    it('should confirm payment successfully', async () => {
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

      mockPrisma.payment.findFirst.mockResolvedValue(mockPayment);
      mockPrisma.payment.update.mockResolvedValue(mockConfirmedPayment);
      mockPrisma.invoice.update.mockResolvedValue({});

      const result = await service.confirmPayment(paymentId, mockBranchId, gatewayResponse);

      expect(result).toEqual(mockConfirmedPayment);
      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.COMPLETED,
          gatewayResponse: JSON.stringify(gatewayResponse),
        },
      });
    });

    it('should throw NotFoundException if payment not found', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await expect(service.confirmPayment('payment-123', mockBranchId)).rejects.toThrow(
        new NotFoundException('Payment not found'),
      );
    });
  });

  describe('processRefund', () => {
    it('should process refund successfully', async () => {
      const refundDto = {
        paymentId: 'payment-123',
        amount: 100,
        reason: 'Patient request',
        notes: 'Partial refund',
      };

      const mockPayment = {
        id: 'payment-123',
        amount: 500,
        status: PaymentStatus.COMPLETED,
        invoice: {
          id: 'invoice-123',
          invoiceNumber: 'INV-20241225-001',
        },
      };

      const mockRefund = {
        id: 'refund-123',
        ...refundDto,
        payment: mockPayment,
      };

      mockPrisma.payment.findFirst.mockResolvedValue(mockPayment);
      mockPrisma.refund.create.mockResolvedValue(mockRefund);
      mockPrisma.invoice.update.mockResolvedValue({});

      const result = await service.processRefund(refundDto, mockBranchId);

      expect(result).toEqual(mockRefund);
      expect(mockPrisma.refund.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          paymentId: refundDto.paymentId,
          amount: refundDto.amount,
          reason: refundDto.reason,
        }),
        include: expect.any(Object),
      });
    });

    it('should throw BadRequestException if trying to refund non-completed payment', async () => {
      const refundDto = {
        paymentId: 'payment-123',
        amount: 100,
        reason: 'Patient request',
      };

      const mockPayment = {
        id: 'payment-123',
        amount: 500,
        status: PaymentStatus.PENDING,
        invoice: {
          id: 'invoice-123',
          invoiceNumber: 'INV-20241225-001',
        },
      };

      mockPrisma.payment.findFirst.mockResolvedValue(mockPayment);

      await expect(service.processRefund(refundDto, mockBranchId)).rejects.toThrow(
        new BadRequestException('Can only refund completed payments'),
      );
    });
  });

  describe('getPaymentSummary', () => {
    it('should return payment summary', async () => {
      const query = {
        startDate: '2024-12-01',
        endDate: '2024-12-31',
      };

      const mockSummary = {
        totalAmount: 10000,
        paymentCount: 20,
        methodBreakdown: [
          { method: PaymentMethod.CASH, amount: 5000, count: 10 },
          { method: PaymentMethod.UPI, amount: 5000, count: 10 },
        ],
        dailyBreakdown: [
          { date: new Date('2024-12-01'), amount: 1000, count: 2 },
          { date: new Date('2024-12-02'), amount: 1500, count: 3 },
        ],
        period: {
          startDate: '2024-12-01',
          endDate: '2024-12-31',
        },
      };

      mockPrisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 10000 } });
      mockPrisma.payment.count.mockResolvedValue(20);
      mockPrisma.payment.groupBy
        .mockResolvedValueOnce([
          { method: PaymentMethod.CASH, _sum: { amount: 5000 }, _count: { id: 10 } },
          { method: PaymentMethod.UPI, _sum: { amount: 5000 }, _count: { id: 10 } },
        ])
        .mockResolvedValueOnce([
          { createdAt: new Date('2024-12-01'), _sum: { amount: 1000 }, _count: { id: 2 } },
          { createdAt: new Date('2024-12-02'), _sum: { amount: 1500 }, _count: { id: 3 } },
        ]);

      const result = await service.getPaymentSummary(query, mockBranchId);

      expect(result).toEqual(mockSummary);
    });
  });

  describe('getRevenueReport', () => {
    it('should return revenue report', async () => {
      const query = {
        startDate: '2024-12-01',
        endDate: '2024-12-31',
        groupBy: 'day' as const,
      };

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
        {
          id: 'payment-2',
          amount: 300,
          createdAt: new Date('2024-12-01'),
          invoice: {
            id: 'invoice-2',
            invoiceNumber: 'INV-002',
            items: JSON.stringify([{ name: 'Medicine' }]),
            visit: null,
            appointment: { doctor: { id: 'doctor-1', name: 'Dr. Smith' } },
          },
        },
      ];

      mockPrisma.payment.findMany.mockResolvedValue(mockPayments);

      const result = await service.getRevenueReport(query, mockBranchId);

      expect(result).toHaveProperty('report');
      expect(result).toHaveProperty('summary');
      expect(result.summary.totalRevenue).toBe(800);
      expect(result.summary.totalTransactions).toBe(2);
    });
  });

  describe('getOutstandingInvoices', () => {
    it('should return outstanding invoices', async () => {
      const query = {
        overdueAfter: '2024-12-01',
        limit: 50,
      };

      const mockInvoices = [
        {
          id: 'invoice-1',
          totalAmount: 500,
          dueDate: new Date('2024-11-30'),
          status: InvoiceStatus.PENDING,
          patient: mockPatient,
          payments: [
            { id: 'payment-1', amount: 200, status: PaymentStatus.COMPLETED },
          ],
        },
        {
          id: 'invoice-2',
          totalAmount: 300,
          dueDate: new Date('2024-12-15'),
          status: InvoiceStatus.PARTIALLY_PAID,
          patient: mockPatient,
          payments: [
            { id: 'payment-2', amount: 100, status: PaymentStatus.COMPLETED },
          ],
        },
      ];

      mockPrisma.invoice.findMany.mockResolvedValue(mockInvoices);

      const result = await service.getOutstandingInvoices(query, mockBranchId);

      expect(result).toHaveProperty('invoices');
      expect(result).toHaveProperty('totalOutstanding');
      expect(result).toHaveProperty('overdueCount');
      expect(result.invoices).toHaveLength(2);
      expect(result.invoices[0].outstandingAmount).toBe(300); // 500 - 200
      expect(result.invoices[1].outstandingAmount).toBe(200); // 300 - 100
      expect(result.totalOutstanding).toBe(500);
    });
  });
});
