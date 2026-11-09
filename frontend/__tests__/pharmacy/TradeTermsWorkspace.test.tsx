import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TradeTermsWorkspace } from '@/components/pharmacy/TradeTermsWorkspace';
import { AgreedTermHint } from '@/components/pharmacy/AgreedTerms';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), put: jest.fn(), delete: jest.fn() } }));
const api = apiClient as jest.Mocked<typeof apiClient>;

const apex = { id: 'sup-apex', name: 'Apex Pharma', gstNumber: '36ABCDE1234F1Z5', termCount: 1 };
const term = {
  id: 'term-1', supplierId: 'sup-apex', drugId: 'drug-dolo', productName: 'Dolo 650 Tablet', productKey: 'drug:drug-dolo',
  discountPercent: 10, schemeBuy: 10, schemeFree: 1, minExpiryMonths: 18, marginPercent: 22, ptr: 24.5, ptrRule: null, note: 'Rep: Kiran',
  createdBy: { id: 'd1', name: 'Praneeta Rao' }, updatedBy: { id: 'd1', name: 'Praneeta Rao' },
  createdAt: '2026-11-07T05:00:00.000Z', updatedAt: '2026-11-07T05:00:00.000Z',
};

function serve(edit: boolean) {
  api.get.mockImplementation(async (endpoint: string) => {
    if (endpoint === '/pharmacy/trade-terms/distributors') return { access: { read: true, edit }, results: [apex], recent: [apex] } as any;
    if (endpoint === '/pharmacy/trade-terms') return { supplier: apex, terms: [term] } as any;
    throw new Error(`unexpected ${endpoint}`);
  });
}

describe('TradeTermsWorkspace', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows a distributor\'s terms read-only to staff', async () => {
    serve(false);
    render(<TradeTermsWorkspace />);
    await userEvent.click(await screen.findByRole('button', { name: /Apex Pharma.*36ABCDE1234F1Z5/ }));
    const row = (await screen.findByText('Dolo 650 Tablet')).closest('tr')!;
    expect(Array.from(row.querySelectorAll('td')).map(cell => cell.textContent)).toEqual([
      'Dolo 650 Tablet', '10%', 'Buy 10 Get 1', '18 months', '22%', '₹24.50', 'Rep: Kiran', 'by Praneeta Rao on 07 Nov 2026',
    ]);
    expect(screen.getByRole('note').textContent).toBe('Read-only. Only doctors can change terms.');
    expect(screen.queryByRole('button', { name: 'Add terms' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Edit terms/ })).toBeNull();
  });

  it('gives doctors add, edit and delete controls', async () => {
    serve(true);
    render(<TradeTermsWorkspace />);
    await userEvent.click(await screen.findByRole('button', { name: /Apex Pharma.*36ABCDE1234F1Z5/ }));
    expect(await screen.findByRole('button', { name: 'Edit terms for Dolo 650 Tablet' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete terms for Dolo 650 Tablet' })).toBeEnabled();
    expect(screen.queryByRole('note')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Add terms' }));
    expect(screen.getByRole('listitem', { current: 'step' }).textContent).toBe('2. Items');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
});

describe('AgreedTermHint', () => {
  it('puts the agreed deal next to what the invoice line says', () => {
    render(<AgreedTermHint term={term} line={{ discountPercent: '8', quantityPurchased: '10', freeQuantity: '', expiryMonth: '3', expiryYear: '2027', purchaseRate: '26' }} />);
    expect(screen.getByTestId('agreed-term-hint').textContent).toBe(
      'Agreed: 10% · Buy 10 Get 1 · min 18 mo expiry · PTR ₹24.50Invoice: 8% · 10 paid + 0 free · exp 03/2027 · rate ₹26.00',
    );
  });
});
