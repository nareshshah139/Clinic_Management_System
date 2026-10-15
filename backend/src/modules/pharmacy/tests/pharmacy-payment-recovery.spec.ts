import { ConflictException } from '@nestjs/common';
import { PharmacyPurchaseLedgerService } from '../pharmacy-purchase-ledger.service';
import { PharmacyPurchasePaymentModeDto } from '../dto/pharmacy-purchase-ledger.dto';

describe('Supplier payment recovery', () => {
  it('rejects reuse of a payment request key for a changed amount instead of returning an unrelated success', async () => {
    const original = {
      id: 'payment-1', branchId: 'branch-1', requestKey: 'attempt-1',
      distributorGstin: '36ABCDE1234F1Z5', distributorName: 'Synthetic Supplier',
      paymentDate: new Date('2026-10-15'), mode: 'NEFT', amount: 100,
      allocations: [{ purchaseInvoiceId: 'invoice-1', amount: 100 }],
    };
    const tx = { pharmacyPurchasePayment: { findUnique: jest.fn().mockResolvedValue(original) } };
    const prisma = { $transaction: (run: any) => run(tx) };
    const service = new PharmacyPurchaseLedgerService(prisma as any);
    await expect(service.createPayment({
      requestKey: 'attempt-1', distributorGstin: original.distributorGstin,
      distributorName: original.distributorName, paymentDate: '2026-10-15',
      mode: PharmacyPurchasePaymentModeDto.NEFT, amount: 200,
      allocations: [{ purchaseInvoiceId: 'invoice-1', amount: 200 }],
    }, 'branch-1', 'user-1')).rejects.toThrow(ConflictException);
  });
});
