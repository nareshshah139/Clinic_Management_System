import { PharmacyPurchaseInvoiceService } from '../pharmacy-purchase-invoice.service';
import { PharmacyAgentService } from '../../pharmacy-agent/pharmacy-agent.service';

const database = (role: string, grants: string[]) => ({
  user: { findUnique: jest.fn().mockResolvedValue({ role, permissions: null }) },
  role: { findFirst: jest.fn().mockResolvedValue({ permissions: JSON.stringify(grants) }) },
});

it('honors scoped purchase and inventory wildcards when calculating pharmacy capabilities', async () => {
  const service = new PharmacyPurchaseInvoiceService(database('RECEPTION', ['inventory:po:*', 'pharmacy:drug:*']) as any);
  const result = await service.capabilities({ id: 'reception', role: 'RECEPTION' });
  expect(result).toMatchObject({ read: true, create: true, review: true, editProduct: true, commit: false });
});
it('gives a pharmacist every purchase capability with no stored grants', async () => {
  const service = new PharmacyPurchaseInvoiceService(database('PHARMACIST', []) as any);
  const result = await service.capabilities({ id: 'pharmacist', role: 'PHARMACIST' });
  expect(result).toMatchObject({ read: true, create: true, review: true, editProduct: true, commit: true, automate: true });
});
it('grants an agent permission inside the wildcard scope and nothing outside it', async () => {
  const service = new PharmacyAgentService(database('RECEPTION', ['pharmacy:drug:*']) as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  const user = { id: 'reception', role: 'RECEPTION' };
  expect(await (service as any).hasPermission(user, 'pharmacy:drug:read')).toBe(true);
  expect(await (service as any).hasPermission(user, 'pharmacy:drug:inventory-change:read')).toBe(true);
  expect(await (service as any).hasPermission(user, 'pharmacy:invoice:read')).toBe(false);
});
