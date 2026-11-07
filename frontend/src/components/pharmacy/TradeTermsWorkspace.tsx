'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { apiClient } from '@/lib/api';
import { displayClinicDate } from '@/lib/date-display';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  agreedSummary, draftIssue, draftToItem, editWizard, emptyDraft, formatExpiry, formatPercent, formatPtr, formatScheme,
  startWizard, stepReady, wizardReducer, wizardStepLabels, wizardSteps,
  type DraftField, type Distributor, type DistributorSearch, type DistributorTerms, type TermDraft, type TradeTerm, type WizardState,
} from '@/lib/trade-terms';

const READ_ONLY_NOTE = 'Read-only. Only doctors can change terms.';
const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong.');

function useDistributorSearch(search: string) {
  const [state, setState] = useState<{ data: DistributorSearch | null; error: string }>({ data: null, error: '' });
  const [reloadToken, setReloadToken] = useState(0);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      apiClient.get<DistributorSearch>('/pharmacy/trade-terms/distributors', search.trim() ? { search: search.trim() } : undefined).then(
        data => { if (active) setState({ data, error: '' }); },
        error => { if (active) setState(current => ({ data: current.data, error: errorText(error) })); },
      );
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search, reloadToken]);
  return { ...state, reload: useCallback(() => setReloadToken(token => token + 1), []) };
}

function DistributorPicker({ selectedId, onSelect, search, onSearch, directory }: {
  selectedId?: string;
  onSelect: (distributor: Distributor) => void;
  search: string;
  onSearch: (value: string) => void;
  directory: DistributorSearch | null;
}) {
  const option = (distributor: Distributor) => (
    <li key={distributor.id}>
      <button type="button" aria-pressed={selectedId === distributor.id} onClick={() => onSelect(distributor)}
        className={`w-full rounded-md border px-3 py-2 text-left hover:bg-muted ${selectedId === distributor.id ? 'border-primary bg-primary/5' : ''}`}>
        <span className="block font-medium">{distributor.name}</span>
        <span className="block text-sm text-muted-foreground">
          {distributor.gstNumber || 'No GSTIN'} · {distributor.termCount} {distributor.termCount === 1 ? 'product' : 'products'} with terms
        </span>
      </button>
    </li>
  );
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="trade-terms-distributor-search">Find distributor</Label>
        <Input id="trade-terms-distributor-search" placeholder="Name or GSTIN" value={search} onChange={event => onSearch(event.target.value)} />
      </div>
      {!search.trim() && !!directory?.recent.length && (
        <div>
          <h4 className="mb-1 text-sm font-medium text-muted-foreground">Recent distributors</h4>
          <ul className="flex flex-wrap gap-2" aria-label="Recent distributors">
            {directory.recent.map(distributor => (
              <li key={distributor.id}>
                <Button type="button" size="sm" variant={selectedId === distributor.id ? 'secondary' : 'outline'} onClick={() => onSelect(distributor)}>{distributor.name}</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!directory && <p role="status" className="text-sm text-muted-foreground">Loading distributors…</p>}
      {directory && !directory.results.length && <p className="text-sm text-muted-foreground">No distributor matches. Add distributors under Suppliers.</p>}
      {directory && !!directory.results.length && <ul className="max-h-96 space-y-2 overflow-auto" aria-label="Distributors">{directory.results.map(option)}</ul>}
    </div>
  );
}

function TermsTable({ terms, canEdit, onEdit, onDeleted }: {
  terms: TradeTerm[];
  canEdit: boolean;
  onEdit: (term: TradeTerm) => void;
  onDeleted: (term: TradeTerm) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState('');
  const remove = async (term: TradeTerm) => {
    setError('');
    try {
      await apiClient.delete(`/pharmacy/trade-terms/${term.id}`);
      setConfirming(null);
      onDeleted(term);
    } catch (err) {
      setError(errorText(err));
    }
  };
  if (!terms.length) return <p className="py-4 text-muted-foreground">No terms recorded for this distributor yet.</p>;
  return (
    <>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <Table aria-label="Agreed terms">
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Discount</TableHead>
            <TableHead>Scheme</TableHead>
            <TableHead>Min expiry</TableHead>
            <TableHead>Margin</TableHead>
            <TableHead>PTR</TableHead>
            <TableHead>Note</TableHead>
            <TableHead>Entered</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {terms.map(term => (
            <TableRow key={term.id}>
              <TableCell className="min-w-40 whitespace-normal font-medium">{term.productName}{!term.drugId && <span className="block text-xs text-muted-foreground">Not linked to a catalogue product</span>}</TableCell>
              <TableCell>{formatPercent(term.discountPercent) ?? '—'}</TableCell>
              <TableCell>{formatScheme(term.schemeBuy, term.schemeFree) ?? '—'}</TableCell>
              <TableCell>{formatExpiry(term.minExpiryMonths) ?? '—'}</TableCell>
              <TableCell>{formatPercent(term.marginPercent) ?? '—'}</TableCell>
              <TableCell>{formatPtr(term) ?? '—'}</TableCell>
              <TableCell className="min-w-40 max-w-64 whitespace-normal">{term.note || '—'}</TableCell>
              <TableCell className="min-w-44 whitespace-normal text-sm">
                by {term.createdBy.name} on {displayClinicDate(term.createdAt)}
                {(term.updatedBy.id !== term.createdBy.id || displayClinicDate(term.updatedAt) !== displayClinicDate(term.createdAt)) &&
                  <span className="block text-muted-foreground">updated by {term.updatedBy.name} on {displayClinicDate(term.updatedAt)}</span>}
                {canEdit && (
                  <span className="mt-2 flex gap-2">
                    <Button type="button" size="sm" variant="outline" className="whitespace-nowrap" onClick={() => onEdit(term)} aria-label={`Edit terms for ${term.productName}`}>Edit</Button>
                    {confirming === term.id
                      ? <Button type="button" size="sm" variant="destructive" className="whitespace-nowrap" onClick={() => void remove(term)}>Confirm delete</Button>
                      : <Button type="button" size="sm" variant="ghost" className="whitespace-nowrap" onClick={() => setConfirming(term.id)} aria-label={`Delete terms for ${term.productName}`}>Delete</Button>}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

type ProductHit = { id: string; name: string; manufacturerName?: string; packSizeLabel?: string };

function ProductSearch({ onAdd }: { onAdd: (pick: { drugId?: string; productName: string; detail?: string }) => void }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (query.trim().length < 2) { setHits([]); return; }
    let active = true;
    const timer = setTimeout(() => {
      apiClient.get<ProductHit[]>('/drugs/autocomplete', { q: query.trim(), limit: 8 }).then(
        rows => { if (active) { setHits(Array.isArray(rows) ? rows : []); setError(''); } },
        err => { if (active) setError(errorText(err)); },
      );
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);
  const typed = query.trim();
  return (
    <div className="space-y-2">
      <Label htmlFor="trade-terms-product-search">Find product</Label>
      <Input id="trade-terms-product-search" placeholder="Search the product list, or type a product name" value={query} onChange={event => setQuery(event.target.value)} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!!hits.length && (
        <ul className="space-y-1" aria-label="Matching products">
          {hits.map(hit => {
            const detail = [hit.manufacturerName, hit.packSizeLabel].filter(Boolean).join(' · ');
            return (
              <li key={hit.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <span><span className="font-medium">{hit.name}</span>{detail && <span className="block text-sm text-muted-foreground">{detail}</span>}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => { onAdd({ drugId: hit.id, productName: hit.name, detail }); setQuery(''); }}>Add</Button>
              </li>
            );
          })}
        </ul>
      )}
      {typed.length >= 2 && (
        <Button type="button" size="sm" variant="ghost" onClick={() => { onAdd({ productName: typed, detail: 'Typed product, not in the product list' }); setQuery(''); }}>
          Add “{typed}” as typed
        </Button>
      )}
    </div>
  );
}

const termInputs: { field: DraftField; label: string; placeholder?: string; wide?: boolean }[] = [
  { field: 'discountPercent', label: 'Discount %' },
  { field: 'schemeBuy', label: 'Scheme: buy' },
  { field: 'schemeFree', label: 'Scheme: get free' },
  { field: 'minExpiryMonths', label: 'Min expiry (months)' },
  { field: 'marginPercent', label: 'Margin %' },
  { field: 'ptr', label: 'PTR (₹)' },
  { field: 'ptrRule', label: 'PTR rule', placeholder: 'e.g. MRP less 20%', wide: true },
  { field: 'note', label: 'Note', placeholder: 'What the rep agreed', wide: true },
];

function TermFields({ idPrefix, draft, onChange }: { idPrefix: string; draft: TermDraft; onChange: (field: DraftField, value: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
      {termInputs.map(({ field, label, placeholder, wide }) => (
        <div key={field} className={wide ? 'col-span-2 md:col-span-3' : ''}>
          <Label htmlFor={`${idPrefix}-${field}`}>{label}</Label>
          <Input id={`${idPrefix}-${field}`} value={draft[field]} placeholder={placeholder}
            inputMode={wide ? undefined : 'decimal'} onChange={event => onChange(field, event.target.value)} />
        </div>
      ))}
    </div>
  );
}

function TermsWizard({ initial, onCancel, onSaved }: { initial: WizardState; onCancel: () => void; onSaved: (result: DistributorTerms) => void }) {
  const [state, dispatch] = useReducer(wizardReducer, initial);
  const [template, setTemplate] = useState<TermDraft>(emptyDraft);
  const [search, setSearch] = useState('');
  const directory = useDistributorSearch(search);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const nextPick = useRef(0);
  const editing = initial.firstStep === 'scheme';
  const save = async () => {
    if (!state.distributor) return;
    setSaving(true);
    setError('');
    try {
      const result = await apiClient.put<DistributorTerms>('/pharmacy/trade-terms', {
        supplierId: state.distributor.id,
        items: state.picks.map(pick => draftToItem(pick, state.drafts[pick.localId] ?? emptyDraft)),
      });
      onSaved(result);
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  };
  const visibleSteps = wizardSteps.slice(wizardSteps.indexOf(initial.firstStep));
  return (
    <section className="space-y-4 rounded-lg border p-4" aria-label={editing ? 'Edit terms' : 'Add terms'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{editing ? `Edit terms for ${state.picks[0]?.productName}` : 'Add terms'}</h3>
        {state.distributor && <p className="text-sm text-muted-foreground">Distributor: <strong>{state.distributor.name}</strong> {state.distributor.gstNumber && `(${state.distributor.gstNumber})`}</p>}
      </div>
      {!editing && (
        <ol className="flex flex-wrap gap-2 text-sm" aria-label="Steps">
          {visibleSteps.map((step, index) => (
            <li key={step} aria-current={state.step === step ? 'step' : undefined}
              className={`rounded-full border px-3 py-1 ${state.step === step ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
              {index + 1}. {wizardStepLabels[step]}
            </li>
          ))}
        </ol>
      )}

      {state.step === 'distributor' && (
        <DistributorPicker selectedId={state.distributor?.id} onSelect={distributor => dispatch({ type: 'chooseDistributor', distributor })}
          search={search} onSearch={setSearch} directory={directory.data} />
      )}

      {state.step === 'items' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ProductSearch onAdd={pick => dispatch({ type: 'addPick', pick: { ...pick, localId: `pick-${++nextPick.current}` } })} />
          <div>
            <h4 className="mb-2 text-sm font-medium">Selected products ({state.picks.length})</h4>
            {!state.picks.length && <p className="text-sm text-muted-foreground">Add one or more products agreed with this distributor.</p>}
            <ul className="space-y-1" aria-label="Selected products">
              {state.picks.map(pick => (
                <li key={pick.localId} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <span><span className="font-medium">{pick.productName}</span>{pick.detail && <span className="block text-sm text-muted-foreground">{pick.detail}</span>}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => dispatch({ type: 'removePick', localId: pick.localId })} aria-label={`Remove ${pick.productName}`}>Remove</Button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {state.step === 'scheme' && (
        <div className="space-y-4">
          {state.picks.length > 1 && (
            <fieldset className="space-y-2 rounded-md border border-dashed p-3">
              <legend className="px-1 text-sm font-medium">Same terms for every selected product</legend>
              <TermFields idPrefix="trade-terms-all" draft={template} onChange={(field, value) => setTemplate(current => ({ ...current, [field]: value }))} />
              <Button type="button" variant="outline" size="sm" onClick={() => dispatch({ type: 'applyToAll', draft: template })}>Apply to all selected</Button>
            </fieldset>
          )}
          {state.picks.map((pick, index) => {
            const draft = state.drafts[pick.localId] ?? emptyDraft;
            const issue = draftIssue(draft);
            return (
              <fieldset key={pick.localId} className="space-y-2 rounded-md border p-3" aria-label={`Terms for ${pick.productName}`}>
                <legend className="px-1 font-medium">{index + 1}. {pick.productName}</legend>
                <TermFields idPrefix={`trade-terms-${pick.localId}`} draft={draft} onChange={(field, value) => dispatch({ type: 'editDraft', localId: pick.localId, field, value })} />
                {issue && <p className="text-sm text-muted-foreground">{issue}</p>}
              </fieldset>
            );
          })}
        </div>
      )}

      {state.step === 'review' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">These terms will appear when an invoice from {state.distributor?.name} is entered. Saving a product that already has terms replaces them.</p>
          <ul className="space-y-1" aria-label="Terms to save">
            {state.picks.map(pick => {
              const draft = state.drafts[pick.localId] ?? emptyDraft;
              const item = draftToItem(pick, draft);
              return (
                <li key={pick.localId} className="rounded-md border px-3 py-2">
                  <span className="font-medium">{pick.productName}</span>
                  <span className="block text-sm">{agreedSummary(item) || '—'}{item.marginPercent != null && ` · margin ${formatPercent(item.marginPercent)}`}</span>
                  {item.note && <span className="block text-sm text-muted-foreground">{item.note}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {error && <p role="alert" className="text-destructive">{error}</p>}
      <div className="flex flex-wrap justify-between gap-2 border-t pt-3">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <div className="flex gap-2">
          {state.step !== state.firstStep && <Button type="button" variant="outline" onClick={() => dispatch({ type: 'back' })} disabled={saving}>Back</Button>}
          {state.step === 'review' || (editing && state.step === 'scheme')
            ? <Button type="button" onClick={() => void save()} disabled={saving || !stepReady.scheme(state)}>{saving ? 'Saving…' : 'Save terms'}</Button>
            : <Button type="button" onClick={() => dispatch({ type: 'next' })} disabled={!stepReady[state.step](state)}>Next</Button>}
        </div>
      </div>
    </section>
  );
}

/**
 * @cc [owner:nareshshah139,label:product] trade-terms-doctor-edit
 * Terms of trade are recorded per distributor and product. Doctors, admins and owners MAY add,
 * edit and delete them; pharmacy, reception, manager and accountant staff MUST see the same
 * terms without edit controls. The server enforces the same split.
 */
export function TradeTermsWorkspace() {
  const [search, setSearch] = useState('');
  const directory = useDistributorSearch(search);
  const [selected, setSelected] = useState<DistributorTerms | null>(null);
  const [loadError, setLoadError] = useState('');
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const canEdit = !!directory.data?.access.edit;
  const open = async (distributor: Distributor) => {
    setLoadError('');
    try {
      setSelected(await apiClient.get<DistributorTerms>('/pharmacy/trade-terms', { supplierId: distributor.id }));
    } catch (err) {
      setLoadError(errorText(err));
    }
  };
  const replaceTerms = (result: DistributorTerms) => {
    setSelected(result);
    setWizard(null);
    directory.reload();
  };
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-semibold">Terms of Trade</h2>
          <p className="text-sm text-muted-foreground">What each distributor agreed per product, so whoever receives a delivery can check it.</p>
        </div>
        {canEdit && !wizard && <Button onClick={() => setWizard(startWizard(selected?.supplier ?? null))}>Add terms</Button>}
      </div>
      {directory.data && !canEdit && <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm" role="note">{READ_ONLY_NOTE}</p>}
      {directory.error && <div role="alert"><p>{directory.error}</p><Button variant="outline" onClick={directory.reload}>Retry</Button></div>}
      {wizard ? (
        <TermsWizard initial={wizard} onCancel={() => setWizard(null)} onSaved={replaceTerms} />
      ) : (
        <div className="min-w-0 space-y-3">
          {loadError && <p role="alert" className="text-destructive">{loadError}</p>}
          {selected ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold">{selected.supplier.name}</h3>
                  <p className="text-sm text-muted-foreground">{selected.supplier.gstNumber || 'No GSTIN'}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setSelected(null)}>All distributors</Button>
              </div>
              <TermsTable terms={selected.terms} canEdit={canEdit}
                onEdit={term => setWizard(editWizard(selected.supplier, term))}
                onDeleted={term => { setSelected({ ...selected, terms: selected.terms.filter(row => row.id !== term.id) }); directory.reload(); }} />
            </>
          ) : (
            <div className="max-w-2xl">
              <DistributorPicker onSelect={distributor => void open(distributor)} search={search} onSearch={setSearch} directory={directory.data} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

