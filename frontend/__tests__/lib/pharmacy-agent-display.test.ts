import { pharmacyChatTitle, pharmacyProposalLabel } from '@/lib/pharmacy-agent-display';

describe('pharmacy assistant display', () => {
  it('normalizes only the exact saved default without rewriting custom titles', () => {
    expect(pharmacyChatTitle('Agentic Pharmacy')).toBe('Pharmacy assistant');
    expect(pharmacyChatTitle(undefined)).toBe('Pharmacy assistant');
    expect(pharmacyChatTitle('  ')).toBe('Pharmacy assistant');
    expect(pharmacyChatTitle('Agentic Pharmacy stock review')).toBe('Agentic Pharmacy stock review');
    expect(pharmacyChatTitle('  Supplier review  ')).toBe('  Supplier review  ');
  });

  it('uses readable proposal labels and safe fallbacks for new codes', () => {
    expect(pharmacyProposalLabel('risk', 'HIGH')).toBe('High risk');
    expect(pharmacyProposalLabel('status', 'PENDING_REVIEW')).toBe('Awaiting review');
    expect(pharmacyProposalLabel('action', 'commit_purchase_invoice_stock')).toBe('Add purchased stock');
    expect(pharmacyProposalLabel('target', 'pharmacy_purchase_invoice')).toBe('Purchase invoice');
    expect(pharmacyProposalLabel('permission', 'inventory:adjustment:create')).toBe('Permission to correct stock quantities');
    expect(pharmacyProposalLabel('action', 'unrecognized_action')).toBe('Other action');
    expect(pharmacyProposalLabel('permission', 'future:permission')).toBe('Additional permission required');
    expect(pharmacyProposalLabel('status', 'toString')).toBe('Status unavailable');
  });
});
