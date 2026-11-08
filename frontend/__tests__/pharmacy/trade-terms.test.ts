import { agreedSummary, draftIssue, draftToItem, editWizard, emptyDraft, startWizard, wizardReducer, type TradeTerm, type WizardAction, type WizardState } from '@/lib/trade-terms';

const apex = { id: 'sup-apex', name: 'Apex Pharma', gstNumber: '36ABCDE1234F1Z5', termCount: 0 };
const term: TradeTerm = {
  id: 'term-1', supplierId: 'sup-apex', drugId: 'drug-dolo', productName: 'Dolo 650 Tablet', productKey: 'drug:drug-dolo',
  discountPercent: 10, schemeBuy: 10, schemeFree: 1, minExpiryMonths: 18, marginPercent: 22, ptr: 24.5, ptrRule: null, note: null,
  createdBy: { id: 'd1', name: 'Praneeta Rao' }, updatedBy: { id: 'd1', name: 'Praneeta Rao' }, createdAt: '2026-11-07T10:00:00Z', updatedAt: '2026-11-07T10:00:00Z',
};
const run = (state: WizardState, ...actions: WizardAction[]) => actions.reduce(wizardReducer, state);

describe('terms of trade entry steps', () => {
  it('moves distributor, items, scheme, review only when each step is complete', () => {
    let state = run(startWizard(null), { type: 'next' });
    expect(state.step).toBe('distributor');
    state = run(state, { type: 'chooseDistributor', distributor: apex }, { type: 'next' }, { type: 'next' });
    expect(state.step).toBe('items');
    state = run(state,
      { type: 'addPick', pick: { localId: 'a', drugId: 'drug-dolo', productName: 'Dolo 650 Tablet' } },
      { type: 'addPick', pick: { localId: 'dup', drugId: 'drug-dolo', productName: 'Dolo 650 Tablet' } },
      { type: 'addPick', pick: { localId: 'b', productName: 'Cough Syrup 100ml' } },
      { type: 'next' }, { type: 'next' });
    expect([state.step, state.picks.map(p => p.localId)]).toEqual(['scheme', ['a', 'b']]);
    state = run(state, { type: 'applyToAll', draft: { ...emptyDraft, discountPercent: '10', schemeBuy: '10', schemeFree: '1' } }, { type: 'editDraft', localId: 'b', field: 'schemeFree', value: '' }, { type: 'next' });
    expect(state.step).toBe('scheme');
    state = run(state, { type: 'editDraft', localId: 'b', field: 'schemeBuy', value: '' }, { type: 'next' }, { type: 'next' });
    expect(state.step).toBe('review');
    expect(state.picks.map(pick => draftToItem(pick, state.drafts[pick.localId]))).toEqual([
      { drugId: 'drug-dolo', productName: 'Dolo 650 Tablet', discountPercent: 10, schemeBuy: 10, schemeFree: 1, minExpiryMonths: null, marginPercent: null, ptr: null, ptrRule: null, note: null },
      { productName: 'Cough Syrup 100ml', discountPercent: 10, schemeBuy: null, schemeFree: null, minExpiryMonths: null, marginPercent: null, ptr: null, ptrRule: null, note: null },
    ]);
    expect(run(state, { type: 'back' }, { type: 'back' }, { type: 'back' }, { type: 'back' }).step).toBe('distributor');
  });

  it('starts at items for a chosen distributor and edits one saved row without leaving the scheme step', () => {
    expect(startWizard(apex).step).toBe('items');
    const editing = run(editWizard(apex, term), { type: 'back' }, { type: 'editDraft', localId: 'term-1', field: 'ptr', value: '26' });
    expect([editing.step, draftToItem(editing.picks[0], editing.drafts['term-1']).ptr]).toEqual(['scheme', 26]);
  });

  it('explains what blocks a term from being saved', () => {
    expect(draftIssue(emptyDraft)).toBe('Enter at least one term.');
    expect(draftIssue({ ...emptyDraft, discountPercent: '120' })).toBe('Check discount %.');
    expect(draftIssue({ ...emptyDraft, minExpiryMonths: '18.5' })).toBe('Check minimum expiry (months).');
    expect(draftIssue({ ...emptyDraft, schemeBuy: '10' })).toBe('Enter both scheme quantities, or neither.');
    expect(draftIssue({ ...emptyDraft, note: 'Rep promised fresh stock' })).toBeNull();
  });

  it('summarises the deal the way the invoice line is checked', () => {
    expect(agreedSummary(term)).toBe('10% · Buy 10 Get 1 · min 18 mo expiry · PTR ₹24.50');
    expect(agreedSummary({ ...term, discountPercent: null, schemeBuy: null, schemeFree: null, minExpiryMonths: null, ptr: null, ptrRule: 'MRP less 20%' })).toBe('MRP less 20%');
  });
});
