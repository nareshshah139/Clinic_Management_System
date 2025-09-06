import { Test, TestingModule } from '@nestjs/testing';
import { BillingController } from '../billing.controller';
import { BillingService } from '../billing.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { InvoiceStatus, PaymentMethod, PaymentStatus } from '../dto/invoice.dto';

describe('BillingController', () => {
  let controller: BillingController;
  let service: BillingService;

  const mockBillingService = {
    createInvoice: jest.fn(),
    findAllInvoices: jest.fn(),
    findInvoiceById: jest.fn(),
    updateInvoice: jest.fn(),
    cancelInvoice: jest.fn(),
    processPayment: jest.fn(),
    processBulkPayment: jest.fn(),
    confirmPayment: jest.fn(),
    findAllPayments: jest.fn(),
    getPaymentSummary: jest.fn(),
    processRefund: jest.fn(),
    getRevenueReport: jest.fn(),
    getOutstandingInvoices: jest.fn(),
  };

  const mockRequest = {
    user: {
      id: 'user-123',
      branchId: 'branch-123',
      role: 'DOCTOR',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        {
          provide: BillingService,
          useValue: mockBillingService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BillingController>(BillingController);
    service = module.get<BillingService>(BillingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createInvoice', () => {
    it('should create an invoice', async () => {
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
        ],
        discount: 10,
        notes: 'Regular patient',
      };

      const mockInvoice = {
        id: 'invoice-123',
        invoiceNumber: 'INV-20241225-001',
        ...createInvoiceDto,
        totalAmount: 531,
        status: InvoiceStatus.DRAFT,
      };

      mockBillingService.createInvoice.mockResolvedValue(mockInvoice);

      const result = await controller.createInvoice(createInvoiceDto, mockRequest as any);

      expect(result).toEqual(mockInvoice);
      expect(service.createInvoice).toHaveBeenCalledWith(createInvoiceDto, mockRequest.user.branchId);
    });
  });

  describe('findAllInvoices', () => {
    it('should return paginated invoices', async () => {
      const query = {
        page: 1,
        limit: 20,
        status: InvoiceStatus.PENDING,
      };

      const mockResult = {
        invoices: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 20,
          pages: 0,
        },
      };

      mockBillingService.findAllInvoices.mockResolvedValue(mockResult);

      const result = await controller.findAllInvoices(query, mockRequest as any);

      expect(result).toEqual(mockResult);
      expect(service.findAllInvoices).toHaveBeenCalledWith(query, mockRequest.user.branchId);
    });
  });

  describe('getOutstandingInvoices', () => {
    it('should return outstanding invoices', async () => {
      const query = {
        overdueAfter: '2024-12-01',
        limit: 50,
      };

      const mockResult = {
        invoices: [],
        totalOutstanding: 0,
        overdueCount: 0,
      };

      mockBillingService.getOutstandingInvoices.mockResolvedValue(mockResult);

      const result = await controller.getOutstandingInvoices(query, mockRequest as any);

      expect(result).toEqual(mockResult);
      expect(service.getOutstandingInvoices).toHaveBeenCalledWith(query, mockRequest.user.branchId);
    });
  });

  describe('findInvoiceById', () => {
    it('should return invoice by id', async () => {
      const invoiceId = 'invoice-123';
      const mockInvoice = {
        id: invoiceId,
        invoiceNumber: 'INV-20241225-001',
        totalAmount: 500,
        status: InvoiceStatus.PENDING,
        items: [{ name: 'Consultation', quantity: 1, unitPrice: 500 }],
      };

      mockBillingService.findInvoiceById.mockResolvedValue(mockInvoice);

      const result = await controller.findInvoiceById(invoiceId, mockRequest as any);

      expect(result).toEqual(mockInvoice);
      expect(service.findInvoiceById).toHaveBeenCalledWith(invoiceId, mockRequest.user.branchId);
    });
  });

  describe('updateInvoice', () => {
    it('should update invoice', async () => {
      const invoiceId = 'invoice-123';
      const updateDto = {
        items: [
          { name: 'Updated Consultation', quantity: 1, unitPrice: 600 },
        ],
        notes: 'Updated notes',
      };

      const mockUpdatedInvoice = {
        id: invoiceId,
        ...updateDto,
        totalAmount: 708,
      };

      mockBillingService.updateInvoice.mockResolvedValue(mockUpdatedInvoice);

      const result = await controller.updateInvoice(invoiceId, updateDto, mockRequest as any);

      expect(result).toEqual(mockUpdatedInvoice);
      expect(service.updateInvoice).toHaveBeenCalledWith(
        invoiceId,
        updateDto,
        mockRequest.user.branchId,
      );
    });
  });

  describe('cancelInvoice', () => {
    it('should cancel invoice', async () => {
      const invoiceId = 'invoice-123';
      const reason = 'Patient cancelled';

      const mockCancelledInvoice = {
        id: invoiceId,
        status: InvoiceStatus.CANCELLED,
        notes: `Cancelled: ${reason}`,
      };

      mockBillingService.cancelInvoice.mockResolvedValue(mockCancelledInvoice);

      const result = await controller.cancelInvoice(invoiceId, reason, mockRequest as any);

      expect(result).toEqual(mockCancelledInvoice);
      expect(service.cancelInvoice).toHaveBeenCalledWith(
        invoiceId,
        mockRequest.user.branchId,
        reason,
      );
    });
  });

  describe('processPayment', () => {
    it('should process payment', async () => {
      const paymentDto = {
        invoiceId: 'invoice-123',
        amount: 500,
        method: PaymentMethod.CASH,
        transactionId: 'TXN-123',
        notes: 'Cash payment',
      };

      const mockPayment = {
        id: 'payment-123',
        ...paymentDto,
        status: PaymentStatus.PENDING,
      };

      mockBillingService.processPayment.mockResolvedValue(mockPayment);

      const result = await controller.processPayment(paymentDto, mockRequest as any);

      expect(result).toEqual(mockPayment);
      expect(service.processPayment).toHaveBeenCalledWith(paymentDto, mockRequest.user.branchId);
    });
  });

  describe('processBulkPayment', () => {
    it('should process bulk payment', async () => {
      const bulkPaymentDto = {
        invoiceIds: ['invoice-1', 'invoice-2'],
        totalAmount: 1000,
        method: PaymentMethod.UPI,
        transactionId: 'BULK-TXN-123',
        notes: 'Bulk payment',
      };

      const mockResult = {
        payments: [],
        totalAmount: 1000,
        invoiceCount: 2,
      };

      mockBillingService.processBulkPayment.mockResolvedValue(mockResult);

      const result = await controller.processBulkPayment(bulkPaymentDto, mockRequest as any);

      expect(result).toEqual(mockResult);
      expect(service.processBulkPayment).toHaveBeenCalledWith(bulkPaymentDto, mockRequest.user.branchId);
    });
  });

  describe('confirmPayment', () => {
    it('should confirm payment', async () => {
      const paymentId = 'payment-123';
      const gatewayResponse = { transactionId: 'GATEWAY-123', status: 'success' };

      const mockConfirmedPayment = {
        id: paymentId,
        status: PaymentStatus.COMPLETED,
        gatewayResponse: JSON.stringify(gatewayResponse),
      };

      mockBillingService.confirmPayment.mockResolvedValue(mockConfirmedPayment);

      const result = await controller.confirmPayment(paymentId, gatewayResponse, mockRequest as any);

      expect(result).toEqual(mockConfirmedPayment);
      expect(service.confirmPayment).toHaveBeenCalledWith(
        paymentId,
        mockRequest.user.branchId,
        gatewayResponse,
      );
    });
  });

  describe('findAllPayments', () => {
    it('should return paginated payments', async () => {
      const query = {
        page: 1,
        limit: 20,
        method: PaymentMethod.CASH,
      };

      const mockResult = {
        payments: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 20,
          pages: 0,
        },
      };

      mockBillingService.findAllPayments.mockResolvedValue(mockResult);

      const result = await controller.findAllPayments(query, mockRequest as any);

      expect(result).toEqual(mockResult);
      expect(service.findAllPayments).toHaveBeenCalledWith(query, mockRequest.user.branchId);
    });
  });

  describe('getPaymentSummary', () => {
    it('should return payment summary', async () => {
      const query = {
        startDate: '2024-12-01',
        endDate: '2024-12-31',
        method: PaymentMethod.CASH,
      };

      const mockSummary = {
        totalAmount: 10000,
        paymentCount: 20,
        methodBreakdown: [
          { method: PaymentMethod.CASH, amount: 10000, count: 20 },
        ],
        dailyBreakdown: [],
        period: {
          startDate: '2024-12-01',
          endDate: '2024-12-31',
        },
      };

      mockBillingService.getPaymentSummary.mockResolvedValue(mockSummary);

      const result = await controller.getPaymentSummary(query, mockRequest as any);

      expect(result).toEqual(mockSummary);
      expect(service.getPaymentSummary).toHaveBeenCalledWith(query, mockRequest.user.branchId);
    });
  });

  describe('processRefund', () => {
    it('should process refund', async () => {
      const refundDto = {
        paymentId: 'payment-123',
        amount: 100,
        reason: 'Patient request',
        notes: 'Partial refund',
      };

      const mockRefund = {
        id: 'refund-123',
        ...refundDto,
        payment: {
          id: 'payment-123',
          amount: 500,
          method: PaymentMethod.CASH,
          transactionId: 'TXN-123',
          invoice: {
            id: 'invoice-123',
            invoiceNumber: 'INV-20241225-001',
          },
        },
      };

      mockBillingService.processRefund.mockResolvedValue(mockRefund);

      const result = await controller.processRefund(refundDto, mockRequest as any);

      expect(result).toEqual(mockRefund);
      expect(service.processRefund).toHaveBeenCalledWith(refundDto, mockRequest.user.branchId);
    });
  });

  describe('getRevenueReport', () => {
    it('should return revenue report', async () => {
      const query = {
        startDate: '2024-12-01',
        endDate: '2024-12-31',
        groupBy: 'day' as const,
        doctorId: 'doctor-123',
      };

      const mockReport = {
        report: [
          {
            period: '2024-12-01',
            revenue: 1000,
            transactions: 2,
            averageValue: 500,
          },
        ],
        summary: {
          totalRevenue: 1000,
          totalTransactions: 2,
          averageTransactionValue: 500,
        },
        period: {
          startDate: '2024-12-01',
          endDate: '2024-12-31',
          groupBy: 'day',
        },
      };

      mockBillingService.getRevenueReport.mockResolvedValue(mockReport);

      const result = await controller.getRevenueReport(query, mockRequest as any);

      expect(result).toEqual(mockReport);
      expect(service.getRevenueReport).toHaveBeenCalledWith(query, mockRequest.user.branchId);
    });
  });

  describe('getStatistics', () => {
    it('should return statistics', async () => {
      const startDate = '2024-12-01';
      const endDate = '2024-12-31';

      const mockStats = {
        totalAmount: 10000,
        paymentCount: 20,
        methodBreakdown: [],
        dailyBreakdown: [],
        period: {
          startDate,
          endDate,
        },
      };

      mockBillingService.getPaymentSummary.mockResolvedValue(mockStats);

      const result = await controller.getStatistics(startDate, endDate, mockRequest as any);

      expect(result).toEqual(mockStats);
      expect(service.getPaymentSummary).toHaveBeenCalledWith(
        { startDate, endDate },
        mockRequest.user.branchId,
      );
    });
  });
});
