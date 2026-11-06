import { InventoryWorkflowService } from '../inventory-workflow.service';
import { InventoryWorkspaceService } from '../inventory-workspace.service';
import { permissionGrants } from '../../../shared/access/permission-grants';
import { PharmacySupplierCreditService } from '../../pharmacy/pharmacy-supplier-credit.service';

describe('Recording a distributor credit note', () => {
  const actor = { id: 'asha', branchId: 'branch', role: 'ADMIN' };
  const workflow = new InventoryWorkflowService({} as any);
  const valid = { requestKey: 'key-1', version: 2, number: 'CN-1', date: '2026-11-01', amount: 120 };
  const message = (input: Record<string, unknown>) =>
    workflow.recordCreditNote(actor, 'return-1', { ...valid, ...input }).then(
      () => 'accepted',
      (error) => error.message,
    );

  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-11-06T20:00:00.000Z'), doNotFake: ['nextTick', 'setImmediate'] });
  });
  afterAll(() => jest.useRealTimers());

  it('refuses a blank or overlong number, a date that is not a calendar day or is after today in the clinic, and a zero amount', async () => {
    expect(await message({ number: '   ' })).toBe('Enter the credit note number');
    expect(await message({ number: 'X'.repeat(51) })).toBe('The credit note number can have at most 50 characters');
    expect(await message({ date: '2026-02-30' })).toBe('Enter the credit note date as a calendar day');
    expect(await message({ date: '2026-11-08' })).toBe('The credit note date cannot be after today');
    expect(await message({ amount: 0 })).toBe('Enter the credit note amount in rupees, more than zero');
    expect(await message({ requestKey: '' })).toBe('A request key is required');
  });
});

describe('Setting credit off against bills', () => {
  const actor = { id: 'asha', branchId: 'branch', role: 'ADMIN' };
  const workspace = new InventoryWorkspaceService({} as any, { permissions: async () => permissionGrants(['*']) } as any, new PharmacySupplierCreditService({} as any));
  const message = (input: Record<string, unknown>) =>
    workspace.setOff(actor, { requestKey: 'key-1', creditId: 'credit-1', ...input }).then(
      () => 'accepted',
      (error) => error.message,
    );

  it('refuses requests that name no bill, a non-positive amount or the same bill twice before touching the database', async () => {
    expect(await message({ allocations: [] })).toBe('Choose at least one bill to set the credit off against');
    expect(await message({ allocations: [{ purchaseInvoiceId: 'bill-1', amount: -5 }] })).toBe('Each bill needs an amount of more than zero');
    expect(
      await message({ allocations: [{ purchaseInvoiceId: 'bill-1', amount: 5 }, { purchaseInvoiceId: 'bill-1', amount: 6 }] }),
    ).toBe('Each bill can appear only once');
    expect(await message({ creditId: '', allocations: [{ purchaseInvoiceId: 'bill-1', amount: 5 }] })).toBe(
      'Choose a distributor or a credit to set off',
    );
  });
});
