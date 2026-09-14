'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type PurchaseProductCatalog = {
  productKind: 'MEDICINE' | 'COSMETIC' | 'CONSUMABLE';
  composition1?: string;
  category?: string;
  dosageForm?: string;
  strength?: string;
  requiresPrescription?: boolean;
};
type CatalogProduct = {
  productKind?: PurchaseProductCatalog['productKind']; type?: string;
  composition1?: string | null; category?: string | null; dosageForm?: string | null; strength?: string | null;
  requiresPrescription?: boolean | null;
};

export function PurchaseProductDetails({ id, product, disabled, onSave }: {
  id: string;
  product?: CatalogProduct;
  disabled: boolean;
  onSave: (catalog: PurchaseProductCatalog) => Promise<string | undefined>;
}) {
  const [kind, setKind] = useState<PurchaseProductCatalog['productKind'] | ''>(product?.productKind || (product ? product.type === 'cosmetic' ? 'COSMETIC' : product.type === 'consumable' ? 'CONSUMABLE' : 'MEDICINE' : ''));
  const [fields, setFields] = useState({ category: product?.category || '', composition1: product?.composition1 || '', dosageForm: product?.dosageForm || '', strength: product?.strength || '' });
  const [prescription, setPrescription] = useState(product?.requiresPrescription == null ? '' : String(product.requiresPrescription));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  const medicine = kind === 'MEDICINE';
  const validValue = (value: string) => !!value.trim() && !/^(?:review\b.*|unknown|unspecified|uncategorized|not specified|not available|n\/?a|none|[-?]+)$/i.test(value.trim());
  const ready = !!kind && (!medicine || Object.values(fields).every(validValue) && prescription !== '');
  const save = async () => {
    if (!ready || disabled || lock.current) return;
    lock.current = true; setSaving(true); setError(''); setSaved(false);
    try {
      const message = await onSave({ ...fields, productKind: kind as PurchaseProductCatalog['productKind'], requiresPrescription: medicine ? prescription === 'true' : false });
      if (message) setError(message); else setSaved(true);
    } catch { setError('Product save could not be confirmed. Check the invoice status and retry.'); }
    finally { lock.current = false; setSaving(false); }
  };
  return <section aria-label={product ? 'Edit saved product details' : 'New product details'} className="space-y-3 border-t pt-3 text-sm">
    <p className="font-medium">{product ? 'Edit saved product details' : 'New product details'}</p>
    <p className="text-muted-foreground">Choose the product kind after checking its label or saved catalog. Enter known details only. Invoice pack size is not medicine strength.</p>
    <fieldset disabled={disabled || saving} className="space-y-3">
      <div>
        <Label htmlFor={`${id}-kind`}>Product kind</Label>
        <select id={`${id}-kind`} value={kind} className="mt-1 block w-full rounded-md border bg-background p-2" onChange={event => {
          const next = event.target.value as typeof kind; setKind(next); setSaved(false); setError('');
          // Changing kind discards inherited clinical defaults, including legacy
          // Tablet / Review strength values from cosmetic invoice records.
          setFields({ category: next === 'COSMETIC' ? 'Cosmetic' : next === 'CONSUMABLE' ? 'Consumable' : '', composition1: '', dosageForm: '', strength: '' });
          setPrescription('');
        }}>
          <option value="">Choose product kind</option>
          <option value="MEDICINE">Medicine</option>
          <option value="COSMETIC">Cosmetic / skin care</option>
          <option value="CONSUMABLE">Other consumable</option>
        </select>
      </div>
      {!!kind && <>
        {!medicine && <p>Composition, strength and form are optional. Unknown values stay blank. This product will be stocked as a non-prescription consumable.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {(['category', 'composition1', 'dosageForm', 'strength'] as const).map(field => <div key={field}>
            <Label htmlFor={`${id}-${field}`}>{({ category: 'Category', composition1: 'Composition', dosageForm: medicine ? 'Dosage form' : 'Product form', strength: 'Strength' })[field]}{medicine ? ' (required)' : ' (optional)'}</Label>
            <Input id={`${id}-${field}`} value={fields[field]} onChange={event => { setFields(current => ({ ...current, [field]: event.target.value })); setSaved(false); }} />
          </div>)}
        </div>
        {medicine && <div><Label htmlFor={`${id}-prescription`}>Prescription required</Label>
          <select id={`${id}-prescription`} className="mt-1 block w-full rounded-md border bg-background p-2" value={prescription} onChange={event => { setPrescription(event.target.value); setSaved(false); }}>
            <option value="">Choose after checking the product</option><option value="true">Yes</option><option value="false">No</option>
          </select>
        </div>}
      </>}
      {!ready && <p className="text-muted-foreground">{!kind ? 'Choose a product kind to continue.' : 'Enter the required medicine details and prescription requirement. Placeholder values cannot be used.'}</p>}
      <Button type="button" disabled={!ready || saved} onClick={save}>{saving ? 'Saving product…' : product ? 'Save product details' : 'Save new product'}</Button>
    </fieldset>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {saved && <p role="status">Product details saved. Continue with Save & Process to check the invoice again.</p>}
  </section>;
}
