import { PharmacyPurchaseInvoiceService } from '../pharmacy-purchase-invoice.service';
import { PharmacyAgentService } from '../../pharmacy-agent/pharmacy-agent.service';

const user = { id: 'pharmacist', role: 'PHARMACIST' };
const database = (grants: string[]) => ({
  user: { findUnique: jest.fn().mockResolvedValue({ role: user.role, permissions: null }) },
  role: { findFirst: jest.fn().mockResolvedValue({ permissions: JSON.stringify(grants) }) },
});

it('honors scoped purchase and inventory wildcards when calculating pharmacy capabilities', async () => {
  const service = new PharmacyPurchaseInvoiceService(database(['inventory:po:*', 'pharmacy:drug:*']) as any);
  const result = await service.capabilities(user);
  expect(result).toMatchObject({ read: true, create: true, review: true, editProduct: true, commit: false });
});
it('honors only the exact agent permission scope', async () => {
  const service = new PharmacyAgentService(database(['pharmacy:drug:*']) as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  expect(await (service as any).hasPermission(user, 'pharmacy:drug:read')).toBe(true);
  expect(await (service as any).hasPermission(user, 'pharmacy:drug:inventory-change:read')).toBe(false);
});
