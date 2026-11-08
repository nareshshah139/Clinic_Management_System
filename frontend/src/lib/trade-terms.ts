export type TradeTermAccess = { read: boolean; edit: boolean };
export type Distributor = { id: string; name: string; gstNumber: string | null; termCount: number };
export type DistributorSearch = { access: TradeTermAccess; results: Distributor[]; recent: Distributor[] };
export type TradeTermActor = { id: string; name: string };
export type TradeTerm = {
  id: string;
  supplierId: string;
  drugId: string | null;
  productName: string;
  productKey: string;
  discountPercent: number | null;
  schemeBuy: number | null;
  schemeFree: number | null;
  minExpiryMonths: number | null;
  marginPercent: number | null;
  ptr: number | null;
  ptrRule: string | null;
  note: string | null;
  createdBy: TradeTermActor;
  updatedBy: TradeTermActor;
  createdAt: string;
  updatedAt: string;
};
export type DistributorTerms = { supplier: Distributor; terms: TradeTerm[] };
export type TradeTermLookup = { supplier: Distributor | null; terms: TradeTerm[]; matches: (string | null)[] };

export type ProductPick = { localId: string; drugId?: string; productName: string; detail?: string };
const draftFields = ['discountPercent', 'schemeBuy', 'schemeFree', 'minExpiryMonths', 'marginPercent', 'ptr', 'ptrRule', 'note'] as const;
export type DraftField = (typeof draftFields)[number];
export type TermDraft = Record<DraftField, string>;
export const emptyDraft: TermDraft = { discountPercent: '', schemeBuy: '', schemeFree: '', minExpiryMonths: '', marginPercent: '', ptr: '', ptrRule: '', note: '' };

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const plain = (value: number) => String(Number(value.toFixed(2)));

export function formatScheme(buy: number | null, free: number | null) {
  return buy != null && free != null ? `Buy ${buy} Get ${free}` : null;
}

export function formatExpiry(months: number | null) {
  return months == null ? null : `${months} ${months === 1 ? 'month' : 'months'}`;
}

export function formatPercent(value: number | null) {
  return value == null ? null : `${plain(value)}%`;
}

export function formatPtr(term: Pick<TradeTerm, 'ptr' | 'ptrRule'>) {
  const parts = [term.ptr != null ? money.format(term.ptr) : null, term.ptrRule].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export function agreedSummary(term: Pick<TradeTerm, 'discountPercent' | 'schemeBuy' | 'schemeFree' | 'minExpiryMonths' | 'ptr' | 'ptrRule'>) {
  return [
    formatPercent(term.discountPercent),
    formatScheme(term.schemeBuy, term.schemeFree),
    term.minExpiryMonths != null ? `min ${term.minExpiryMonths} mo expiry` : null,
    term.ptr != null ? `PTR ${money.format(term.ptr)}` : null,
    term.ptrRule,
  ].filter(Boolean).join(' · ');
}

const numberLimits: Partial<Record<DraftField, { max?: number; integer?: boolean }>> = {
  discountPercent: { max: 100 },
  schemeBuy: { integer: true },
  schemeFree: { integer: true },
  minExpiryMonths: { max: 60, integer: true },
  marginPercent: { max: 100 },
  ptr: {},
};

export function draftIssue(draft: TermDraft): string | null {
  for (const [field, limit] of Object.entries(numberLimits) as [DraftField, { max?: number; integer?: boolean }][]) {
    const raw = draft[field].trim();
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || (limit.max != null && value > limit.max) || (limit.integer && !Number.isInteger(value))) {
      return `Check ${fieldLabels[field]}.`;
    }
  }
  if (!draft.schemeBuy.trim() !== !draft.schemeFree.trim()) return 'Enter both scheme quantities, or neither.';
  return draftFields.some(field => draft[field].trim()) ? null : 'Enter at least one term.';
}

export const fieldLabels: Record<DraftField, string> = {
  discountPercent: 'discount %',
  schemeBuy: 'scheme buy quantity',
  schemeFree: 'scheme free quantity',
  minExpiryMonths: 'minimum expiry (months)',
  marginPercent: 'margin %',
  ptr: 'PTR',
  ptrRule: 'PTR rule',
  note: 'note',
};

const numberOrNull = (raw: string) => (raw.trim() ? Number(raw) : null);
const textOrNull = (raw: string) => raw.trim() || null;

export function draftToItem(pick: ProductPick, draft: TermDraft) {
  return {
    ...(pick.drugId ? { drugId: pick.drugId } : {}),
    productName: pick.productName,
    discountPercent: numberOrNull(draft.discountPercent),
    schemeBuy: numberOrNull(draft.schemeBuy),
    schemeFree: numberOrNull(draft.schemeFree),
    minExpiryMonths: numberOrNull(draft.minExpiryMonths),
    marginPercent: numberOrNull(draft.marginPercent),
    ptr: numberOrNull(draft.ptr),
    ptrRule: textOrNull(draft.ptrRule),
    note: textOrNull(draft.note),
  };
}

export function termToDraft(term: TradeTerm): TermDraft {
  const text = (value: number | string | null) => (value == null ? '' : String(value));
  return Object.fromEntries(draftFields.map(field => [field, text(term[field])])) as TermDraft;
}

export const wizardSteps = ['distributor', 'items', 'scheme', 'review'] as const;
export type WizardStep = (typeof wizardSteps)[number];
export const wizardStepLabels: Record<WizardStep, string> = { distributor: 'Distributor', items: 'Items', scheme: 'Scheme', review: 'Review' };

export type WizardState = {
  step: WizardStep;
  firstStep: WizardStep;
  distributor: Distributor | null;
  picks: ProductPick[];
  drafts: Record<string, TermDraft>;
};

export type WizardAction =
  | { type: 'chooseDistributor'; distributor: Distributor }
  | { type: 'addPick'; pick: ProductPick }
  | { type: 'removePick'; localId: string }
  | { type: 'editDraft'; localId: string; field: DraftField; value: string }
  | { type: 'applyToAll'; draft: TermDraft }
  | { type: 'next' }
  | { type: 'back' };

export const stepReady: Record<WizardStep, (state: WizardState) => boolean> = {
  distributor: state => state.distributor != null,
  items: state => state.picks.length > 0,
  scheme: state => state.picks.every(pick => draftIssue(state.drafts[pick.localId] ?? emptyDraft) == null),
  review: () => true,
};

export function startWizard(distributor: Distributor | null): WizardState {
  return { step: distributor ? 'items' : 'distributor', firstStep: 'distributor', distributor, picks: [], drafts: {} };
}

export function editWizard(distributor: Distributor, term: TradeTerm): WizardState {
  const pick = { localId: term.id, drugId: term.drugId ?? undefined, productName: term.productName };
  return { step: 'scheme', firstStep: 'scheme', distributor, picks: [pick], drafts: { [term.id]: termToDraft(term) } };
}

const offset = (step: WizardStep, by: number) => wizardSteps[wizardSteps.indexOf(step) + by];

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'chooseDistributor':
      return { ...state, distributor: action.distributor };
    case 'addPick':
      if (action.pick.drugId && state.picks.some(pick => pick.drugId === action.pick.drugId)) return state;
      return { ...state, picks: [...state.picks, action.pick], drafts: { ...state.drafts, [action.pick.localId]: emptyDraft } };
    case 'removePick':
      return {
        ...state,
        picks: state.picks.filter(pick => pick.localId !== action.localId),
        drafts: Object.fromEntries(Object.entries(state.drafts).filter(([localId]) => localId !== action.localId)),
      };
    case 'editDraft':
      return { ...state, drafts: { ...state.drafts, [action.localId]: { ...(state.drafts[action.localId] ?? emptyDraft), [action.field]: action.value } } };
    case 'applyToAll':
      return { ...state, drafts: Object.fromEntries(state.picks.map(pick => [pick.localId, { ...action.draft }])) };
    case 'next':
      return stepReady[state.step](state) && state.step !== 'review' ? { ...state, step: offset(state.step, 1) } : state;
    case 'back':
      return state.step === state.firstStep ? state : { ...state, step: offset(state.step, -1) };
  }
}
