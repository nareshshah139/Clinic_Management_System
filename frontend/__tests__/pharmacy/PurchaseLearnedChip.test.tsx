import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PurchaseLearnedChips } from '@/components/pharmacy/PurchaseLearnedChip';
import { PurchaseOcrChecklist } from '@/components/pharmacy/PurchaseOcrChecklist';
import { readLearnedCorrections, serializeLearnedCorrections, undoConflicts, undoLearnedCorrection, type LearnedCorrection } from '@/lib/purchase-learning';

type Row = { productName: string; manufacturer: string; ocrFlags: string; learnedCorrections?: string };

const learnedRow: Row = {
  productName: 'Dolo 650mg Tablet',
  manufacturer: 'Micro Labs',
  ocrFlags: 'learned_product_needs_confirmation, uncertain_batchNumber',
  learnedCorrections: serializeLearnedCorrections([
    { field: 'product', from: 'DOLO-650 TAB', to: 'Dolo 650mg Tablet', support: 4, tier: 'APPLY', restore: { productName: 'DOLO-650 TAB' }, applied: { productName: 'Dolo 650mg Tablet' }, restoreFlags: [] },
    { field: 'manufacturer', from: 'MICRO LAB', to: 'Micro Labs', support: 2, tier: 'TRUSTED', restore: { manufacturer: 'MICRO LAB' }, applied: { manufacturer: 'Micro Labs' }, restoreFlags: [] },
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
    render(<PurchaseLearnedChips label="x" onUndo={jest.fn()} corrections={[{ field: 'product', from: 'A', to: 'B', support: 1, tier: 'SUGGEST', restore: { productName: 'A' }, applied: { productName: 'B' }, restoreFlags: [] }]} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  const productRow = (withRestore: boolean): Row => ({
    productName: 'Dolo 650mg Tablet',
    manufacturer: 'Micro Labs',
    ocrFlags: 'learned_product_needs_confirmation',
    learnedCorrections: JSON.stringify([{
      field: 'product', from: 'DOLO-650 TAB', to: 'Dolo 650mg Tablet', support: 4, tier: 'APPLY',
      ...(withRestore ? { restore: { productName: 'DOLO-650 TAB', manufacturer: '', packSize: '15' }, restoreFlags: ['missing_manufacturer'] } : {}),
    }]),
  });

  it('puts back everything the product lesson rewrote and the flag it cleared', () => {
    const [correction] = readLearnedCorrections(productRow(true).learnedCorrections);
    const undone = undoLearnedCorrection({ ...productRow(true), packSize: '15' } as Row & Record<string, unknown>, correction, 'ocrFlags');
    expect(undone).toMatchObject({ productName: 'DOLO-650 TAB', manufacturer: '', packSize: '15', ocrFlags: 'missing_manufacturer' });
    expect(undone.learnedCorrections).toBeUndefined();
  });

  it('falls back to the product name for a correction saved before restore existed', () => {
    const [correction] = readLearnedCorrections(productRow(false).learnedCorrections);
    expect(correction).toMatchObject({ restore: { productName: 'DOLO-650 TAB' }, restoreFlags: [] });
    const undone = undoLearnedCorrection(productRow(false) as Row & Record<string, unknown>, correction, 'ocrFlags');
    expect(undone).toMatchObject({ productName: 'DOLO-650 TAB', manufacturer: 'Micro Labs', ocrFlags: '' });
  });

  it('restores only learnable fields, never the row identity', () => {
    const [correction] = readLearnedCorrections(JSON.stringify([{ field: 'product', from: 'DOLO-650 TAB', to: 'Dolo 650mg Tablet', support: 1, tier: 'APPLY',
      restore: { productName: 'DOLO-650 TAB', localId: 'forged' }, restoreFlags: [] }]));
    expect(correction.restore).toEqual({ productName: 'DOLO-650 TAB' });
    const undone = undoLearnedCorrection({ ...productRow(true), localId: 'line-1' } as Row & Record<string, unknown>, correction, 'ocrFlags');
    expect(undone).toMatchObject({ localId: 'line-1', productName: 'DOLO-650 TAB' });
  });

  describe('undoConflicts', () => {
    const product: LearnedCorrection = {
      field: 'product', from: 'DOLO-650 TAB', to: 'Dolo 650mg Tablet', support: 4, tier: 'APPLY',
      restore: { productName: 'DOLO-650 TAB', manufacturer: '', packSize: '15' },
      applied: { productName: 'Dolo 650mg Tablet', manufacturer: 'Micro Labs', packSize: '15' }, restoreFlags: [],
    };
    const untouched = { productName: 'Dolo 650mg Tablet', manufacturer: 'Micro Labs', packSize: '15' };

    it('reports a field the reviewer edited after the lesson filled it in', () => {
      expect(undoConflicts({ ...untouched, manufacturer: 'Cipla' }, product)).toEqual([
        { field: 'manufacturer', label: 'Manufacturer', current: 'Cipla', restored: '' },
      ]);
    });

    it('reports nothing while every field still holds what the lesson wrote or what the read had', () => {
      expect(undoConflicts(untouched, product)).toEqual([]);
      expect(undoConflicts({ productName: 'DOLO-650 TAB', manufacturer: '', packSize: '15' }, product)).toEqual([]);
      expect(undoConflicts({ productName: 'DOLO-650 TAB', manufacturer: 'Micro Labs', packSize: '15' }, product)).toEqual([]);
    });

    it('labels each edited field', () => {
      const edited = { productName: 'Dolo X', manufacturer: 'Cipla', packSize: '10' };
      expect(undoConflicts(edited, product).map(conflict => [conflict.field, conflict.label])).toEqual([
        ['productName', 'Product name'], ['manufacturer', 'Manufacturer'], ['packSize', 'Pack size'],
      ]);
      const supplier = readLearnedCorrections(JSON.stringify([{ field: 'distributorName', from: 'MICRO DISTRIBUTER', to: 'Micro Distributors', support: 2, tier: 'APPLY',
        restore: { distributorName: 'MICRO DISTRIBUTER' }, applied: { distributorName: 'Micro Distributors' }, restoreFlags: [] }]))[0];
      expect(undoConflicts({ distributorName: 'Micro Pharma' }, supplier)).toEqual([
        { field: 'distributorName', label: 'Supplier name', current: 'Micro Pharma', restored: 'MICRO DISTRIBUTER' },
      ]);
    });

    it('judges a correction autosaved before applied existed by the value the lesson set', () => {
      const [legacy] = readLearnedCorrections(JSON.stringify([{ field: 'product', from: 'DOLO-650 TAB', to: 'Dolo 650mg Tablet', support: 4, tier: 'APPLY',
        restore: { productName: 'DOLO-650 TAB', manufacturer: '', packSize: '15' }, restoreFlags: [] }]));
      expect(legacy.applied).toEqual({ productName: 'Dolo 650mg Tablet' });
      expect(undoConflicts(untouched, legacy)).toEqual([]);
      expect(undoConflicts({ ...untouched, productName: 'Dolo 650 Strip' }, legacy)).toEqual([
        { field: 'productName', label: 'Product name', current: 'Dolo 650 Strip', restored: 'DOLO-650 TAB' },
      ]);
    });

    it('keeps applied to the same learnable keys as restore', () => {
      const [parsed] = readLearnedCorrections(JSON.stringify([{ field: 'product', from: 'A', to: 'B', support: 1, tier: 'APPLY',
        restore: { productName: 'A' }, applied: { productName: 'B', localId: 'forged' }, restoreFlags: [] }]));
      expect(parsed.applied).toEqual({ productName: 'B' });
    });
  });
});
