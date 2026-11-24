import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PurchaseLearnedChips } from '@/components/pharmacy/PurchaseLearnedChip';
import { PurchaseOcrChecklist } from '@/components/pharmacy/PurchaseOcrChecklist';
import { readLearnedCorrections, serializeLearnedCorrections, undoLearnedCorrection } from '@/lib/purchase-learning';

type Row = { productName: string; manufacturer: string; ocrFlags: string; learnedCorrections?: string };

const learnedRow: Row = {
  productName: 'Dolo 650mg Tablet',
  manufacturer: 'Micro Labs',
  ocrFlags: 'learned_product_needs_confirmation, uncertain_batchNumber',
  learnedCorrections: serializeLearnedCorrections([
    { field: 'product', from: 'DOLO-650 TAB', to: 'Dolo 650mg Tablet', support: 4, tier: 'APPLY' },
    { field: 'manufacturer', from: 'MICRO LAB', to: 'Micro Labs', support: 2, tier: 'TRUSTED' },
  ]),
};

function Line() {
  const [row, setRow] = useState(learnedRow);
  const flags = row.ocrFlags.split(',').map(flag => flag.trim()).filter(Boolean);
  return <div>
    <input aria-label="Product" value={row.productName} readOnly />
    <input aria-label="Manufacturer" value={row.manufacturer} readOnly />
    <PurchaseLearnedChips label="Line 1 learned corrections" corrections={readLearnedCorrections(row.learnedCorrections)}
      onUndo={correction => setRow(current => undoLearnedCorrection(current, correction, 'ocrFlags'))} />
    <PurchaseOcrChecklist flags={flags} lineIndex={0} values={{ productName: row.productName, batchNumber: '' }} />
  </div>;
}

describe('learned correction chip', () => {
  it('shows what was learned and reverts the product and its confirmation flag on Undo', async () => {
    render(<Line />);
    expect(screen.getByText("Learned: 'DOLO-650 TAB' → Dolo 650mg Tablet · chosen 4× for this supplier")).toBeInTheDocument();
    expect(screen.getByText(/Line 1: Check the learned product match\./)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Undo learned product correction' }));

    expect(screen.getByLabelText('Product')).toHaveValue('DOLO-650 TAB');
    expect(screen.queryByText(/learned product match/)).not.toBeInTheDocument();
    expect(screen.queryByText(/DOLO-650 TAB' →/)).not.toBeInTheDocument();
    expect(screen.getByText(/Line 1: Check batch\./)).toBeInTheDocument();
    expect(screen.getByLabelText('Manufacturer')).toHaveValue('Micro Labs');
    expect(screen.getByRole('button', { name: 'Undo learned manufacturer correction' })).toBeInTheDocument();
  });

  it('undoes a trusted correction that carried no confirmation flag', async () => {
    render(<Line />);
    await userEvent.click(screen.getByRole('button', { name: 'Undo learned manufacturer correction' }));
    expect(screen.getByLabelText('Manufacturer')).toHaveValue('MICRO LAB');
    expect(screen.getByText(/Line 1: Check the learned product match\./)).toBeInTheDocument();
  });

  it('renders nothing for suggestions that were not applied', () => {
    render(<PurchaseLearnedChips label="x" onUndo={jest.fn()} corrections={[{ field: 'product', from: 'A', to: 'B', support: 1, tier: 'SUGGEST' }]} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
