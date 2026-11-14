'use client';

import {
  MEDICINE_FORMS,
  MEDICINE_FORM_KEYS,
  normalizeStrength,
  STRENGTH_UNITS,
  standardMedicineName,
  strengthMissing,
  strengthRequired,
  strengthUnitMissing,
} from '@/lib/medicine-names';
import { NativeSelect } from '@/components/ui/native-select';

export type MedicineNameValue = {
  form?: string | null;
  brandName?: string | null;
  strength?: string | null;
  isCombination?: boolean | null;
};

const fieldClass = 'mt-1 h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary aria-[invalid=true]:border-destructive';

const STRENGTH_EXAMPLE: Record<string, string> = { TABLET: 'e.g. 150 mg', CAPSULE: 'e.g. 10 mg', SYRUP: 'e.g. 2.5mg/5ml' };

/**
 * @cc [owner:nareshshah139,label:product] medicine-name-fields-preview
 * The form MUST show, while typing, exactly the name that will print on prescriptions, built from
 * form, name and strength. Codes and pack sizes are entered elsewhere and never appear in it.
 * A strength typed without its unit MUST print without one until the user picks the unit.
 */
export function MedicineNameFields({
  value,
  onChange,
  errors = {},
  formRequired = true,
}: {
  value: MedicineNameValue;
  onChange: (patch: MedicineNameValue) => void;
  errors?: Partial<Record<'form' | 'name' | 'strength', string>>;
  formRequired?: boolean;
}) {
  const needsStrength = strengthRequired(value);
  const preview = standardMedicineName({ ...value, name: value.brandName });
  const bare = strengthUnitMissing(value) && /^\d+(?:\.\d+)?$/.test(normalizeStrength(value.strength)) ? normalizeStrength(value.strength) : '';
  const error = (key: 'form' | 'name' | 'strength') =>
    errors[key] ? <span id={`medicine-${key}-error`} role="alert" className="mt-1 block text-sm text-destructive">{errors[key]}</span> : null;
  return (
    <fieldset className="space-y-4 rounded-md border p-4">
      <legend className="px-1 text-sm font-semibold">Name on prescriptions</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="text-sm">
          <label htmlFor="medicine-form">Form{formRequired ? ' *' : ''}</label>
          <NativeSelect
            id="medicine-form"
            className="mt-1 w-full min-w-0"
            value={value.form || ''}
            aria-invalid={Boolean(errors.form)}
            aria-describedby={errors.form ? 'medicine-form-error' : undefined}
            onChange={(event) => onChange({ form: event.target.value || null })}
          >
            <option value="">{formRequired ? 'Choose the form' : 'Not set'}</option>
            {MEDICINE_FORM_KEYS.map((key) => (
              <option key={key} value={key}>{MEDICINE_FORMS[key].label}</option>
            ))}
          </NativeSelect>
          {error('form')}
        </div>
        <div className="text-sm">
          <label htmlFor="medicine-name">Medicine name *</label>
          <input
            id="medicine-name"
            className={fieldClass}
            value={value.brandName || ''}
            placeholder="e.g. Flutas"
            autoComplete="off"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'medicine-name-error' : 'medicine-name-hint'}
            onChange={(event) => onChange({ brandName: event.target.value })}
          />
          {error('name') || <span id="medicine-name-hint" className="mt-1 block text-xs text-muted-foreground">Only the name: no form, strength, code or pack size</span>}
        </div>
        <div className="text-sm">
          <label htmlFor="medicine-strength">Strength{needsStrength ? ' *' : ' (optional)'}</label>
          <input
            id="medicine-strength"
            className={fieldClass}
            value={value.isCombination ? '' : value.strength || ''}
            disabled={Boolean(value.isCombination)}
            placeholder={value.isCombination ? 'Not printed for combinations' : STRENGTH_EXAMPLE[value.form || ''] || 'e.g. 0.1%'}
            aria-invalid={Boolean(errors.strength)}
            aria-describedby={errors.strength ? 'medicine-strength-error' : undefined}
            onChange={(event) => onChange({ strength: event.target.value })}
          />
          {bare && (
            <div role="group" aria-label={`Unit of ${bare}`} className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="w-full text-xs text-muted-foreground">Which unit?</span>
              {STRENGTH_UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  className="h-8 min-w-11 rounded-md border border-input bg-background px-2.5 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
                  onClick={() => onChange({ strength: normalizeStrength(`${bare}${u === '%' ? '' : ' '}${u}`) })}
                >
                  {u}
                </button>
              ))}
            </div>
          )}
          {error('strength')}
        </div>
        <div className="flex items-start gap-2 self-center text-sm sm:pt-5">
          <input
            id="medicine-combination"
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={Boolean(value.isCombination)}
            aria-describedby="medicine-combination-hint"
            onChange={(event) => onChange({ isCombination: event.target.checked })}
          />
          <div>
            <label htmlFor="medicine-combination">Combination product</label>
            <span id="medicine-combination-hint" className="block text-xs text-muted-foreground">More than one ingredient; no strength prints</span>
          </div>
        </div>
      </div>
      <p className="rounded-md bg-muted px-3 py-2 text-sm" aria-live="polite">
        <span className="text-muted-foreground">Prints as </span>
        <strong data-testid="medicine-name-preview">{preview || '—'}</strong>
        {value.form && (bare || strengthMissing(value)) && (
          <span className="block text-xs text-warning-text">{bare ? `Unit missing: ${bare} could be mg or mcg` : 'Strength missing'}</span>
        )}
      </p>
    </fieldset>
  );
}
