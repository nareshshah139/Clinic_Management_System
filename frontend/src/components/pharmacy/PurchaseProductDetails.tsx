'use client';

import { medicineNameIssues } from '@cms/shared-types/medicine-name';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PurchaseHelp } from './PurchaseHelp';

export type PurchaseProductCatalog = {
  productKind: 'MEDICINE' | 'COSMETIC' | 'CONSUMABLE';
  composition1?: string;
  category?: string;
  dosageForm?: string;
  strength?: string;
  brandName?: string; itemCode?: string; combinationProduct?: boolean; dispenseLoose?: boolean;
  requiresPrescription?: boolean;
};
type CatalogProduct = {
  productKind?: PurchaseProductCatalog['productKind']; type?: string;
  composition1?: string | null; category?: string | null; dosageForm?: string | null; strength?: string | null;
  brandName?: string | null; itemCode?: string | null; combinationProduct?: boolean; dispenseLoose?: boolean;
  requiresPrescription?: boolean | null;
};

/**
 * @cc [owner:nareshshah139,label:product] purchase-product-kind-explanation
 * Medicine-only requirements MUST be explained beside the product kind. Classification changes
 * MUST remain an explicit user choice; the interface MUST NOT suggest inventing clinical values.
 */
export function PurchaseProductDetails({ id, product, disabled, onSave, createLabel = 'Save new product', onKindChange }: {
  id: string;
  product?: CatalogProduct;
  disabled: boolean;
  createLabel?: string;
  onKindChange?: (kind: PurchaseProductCatalog['productKind'] | '') => void;
  onSave: (catalog: PurchaseProductCatalog) => Promise<string | undefined>;
}) {
  const [kind, setKind] = useState<PurchaseProductCatalog['productKind'] | ''>(product?.productKind || (product ? product.type === 'cosmetic' ? 'COSMETIC' : product.type === 'consumable' ? 'CONSUMABLE' : 'MEDICINE' : ''));
  const [fields, setFields] = useState({ category: product?.category || '', composition1: product?.composition1 || '', dosageForm: product?.dosageForm || '', strength: product?.strength || '' });
  const [brandName, setBrandName] = useState(product?.brandName || '');
  const [itemCode, setItemCode] = useState(product?.itemCode || '');
  const [combinationProduct, setCombinationProduct] = useState(product?.combinationProduct || false);
  const [dispenseLoose, setDispenseLoose] = useState(product?.dispenseLoose || false);
  const [prescription, setPrescription] = useState(product?.requiresPrescription == null ? '' : String(product.requiresPrescription));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  const medicine = kind === 'MEDICINE';
  const validValue = (value: string) => !!value.trim() && !/^(?:review\b.*|unknown|unspecified|uncategorized|not specified|not available|n\/?a|none|[-?]+)$/i.test(value.trim());
  const strengthRequired = medicineNameIssues({ ...fields, strength: '', brandName: 'Product', combinationProduct }).some(issue => issue.startsWith('Strength'));
  const ready = !!kind && (!medicine || Object.entries(fields).every(([field, value]) => field === 'strength' && !strengthRequired && !value.trim() || validValue(value)) && prescription !== '');
  const save = async () => {
    if (!ready || disabled || lock.current) return;
    lock.current = true; setSaving(true); setError(''); setSaved(false);
    try {
      const message = await onSave({ ...fields, brandName, itemCode, combinationProduct, dispenseLoose, productKind: kind as PurchaseProductCatalog['productKind'], requiresPrescription: medicine ? prescription === 'true' : false });
      if (message) setError(message); else setSaved(true);
    } catch { setError('Product save could not be confirmed. Check the invoice status and retry.'); }
    finally { lock.current = false; setSaving(false); }
  };
  return <section aria-label={product ? 'Edit saved product details' : 'New product details'} className="space-y-3 border-t pt-3 text-sm">
    <div className="flex items-center gap-1"><p className="font-medium">{product ? 'Edit saved product details' : 'New product details'}</p><PurchaseHelp label="Product details">Check the label or saved catalog and enter known details only. Invoice pack size is not medicine strength.</PurchaseHelp></div>
    <fieldset disabled={disabled || saving} className="space-y-3">
      <div>
        <Label htmlFor={`${id}-kind`}>Product kind</Label>
        <select id={`${id}-kind`} value={kind} className="mt-1 block w-full rounded-md border bg-background p-2" onChange={event => {
          const next = event.target.value as typeof kind; setKind(next); onKindChange?.(next); setSaved(false); setError('');
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
        {medicine && <p className="max-w-prose text-muted-foreground">This product is classified as a medicine, so composition and dosage form are required. Strength is required except for topicals and combination products. Check the packaging first. If it is a cosmetic or consumable, correct the product kind instead of inventing clinical details.</p>}
        {!medicine && <div className="flex items-center gap-1 text-muted-foreground"><span>Non-prescription · clinical details optional</span><PurchaseHelp label="Optional clinical details">Composition, strength and form are optional for cosmetics and consumables. Leave unknown values blank.</PurchaseHelp></div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label>Brand name<Input value={brandName} onChange={e => { setBrandName(e.target.value); setSaved(false); }} /></label>
          <label>Item code<Input value={itemCode} onChange={e => { setItemCode(e.target.value); setSaved(false); }} /></label>
          <label className="flex gap-2"><input type="checkbox" checked={combinationProduct} onChange={e => { setCombinationProduct(e.target.checked); setSaved(false); }} />Combination product</label>
          <label className="flex gap-2"><input type="checkbox" checked={dispenseLoose} onChange={e => { setDispenseLoose(e.target.checked); setSaved(false); }} />Dispense loose</label>
          {(['category', 'composition1', 'dosageForm', 'strength'] as const).map(field => <div key={field}>
            <Label htmlFor={`${id}-${field}`}>{({ category: 'Category', composition1: 'Composition', dosageForm: medicine ? 'Dosage form' : 'Product form', strength: 'Strength' })[field]}{medicine && (field !== 'strength' || strengthRequired) ? ' (required)' : ' (optional)'}</Label>
            <Input id={`${id}-${field}`} value={fields[field]} onChange={event => { setFields(current => ({ ...current, [field]: event.target.value })); setSaved(false); }} />
          </div>)}
        </div>
        {medicine && <div><Label htmlFor={`${id}-prescription`}>Prescription required</Label>
          <select id={`${id}-prescription`} className="mt-1 block w-full rounded-md border bg-background p-2" value={prescription} onChange={event => { setPrescription(event.target.value); setSaved(false); }}>
            <option value="">Choose after checking the product</option><option value="true">Yes</option><option value="false">No</option>
          </select>
        </div>}
      </>}
      {!ready && <p className="text-muted-foreground">{!kind ? 'Choose a product kind to continue.' : 'Complete required medicine fields; use verified values.'}</p>}
      <Button type="button" disabled={!ready || saved} onClick={save}>{saving ? 'Saving product…' : product ? 'Save product details' : createLabel}</Button>
    </fieldset>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {saved && <p role="status">Product details saved. Continue with Save & Process to check the invoice again.</p>}
  </section>;
}
