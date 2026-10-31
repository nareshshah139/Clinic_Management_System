import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PharmacyPurchaseInvoiceController } from '../pharmacy-purchase-invoice.controller';
import { PermissionsGuard } from '../../../shared/guards/permissions.guard';

describe('purchase catalogue check permissions', () => {
  const check = (method: 'suggestMasterMatches' | 'confirmMaster', permissions: string[]) => {
    const guard = new PermissionsGuard(new Reflector(), {
      user: { findUnique: async () => ({ role: 'RECEPTION', permissions: JSON.stringify(permissions) }) },
      role: { findFirst: async () => ({ permissions: '[]' }) },
    } as any);
    return guard.canActivate({
      getHandler: () => PharmacyPurchaseInvoiceController.prototype[method], getClass: () => PharmacyPurchaseInvoiceController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'reviewer', role: 'RECEPTION' } }) }),
    } as ExecutionContext);
  };
  it.each(['pharmacy:purchase-invoice:review', 'inventory:po:update', 'pharmacy:purchase-invoice:create'])('allows %s to read exact readiness', async permission => {
    expect(await check('suggestMasterMatches', [permission])).toBe(true);
  });
  it('does not grant product mutation or readiness access to unrelated users', async () => {
    expect(await check('confirmMaster', ['pharmacy:purchase-invoice:review'])).toBe(false);
    expect(await check('suggestMasterMatches', ['inventory:stock:read'])).toBe(false);
  });
});
