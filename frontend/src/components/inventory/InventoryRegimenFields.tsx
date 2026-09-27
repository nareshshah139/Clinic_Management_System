'use client';

type Values = {
  defaultDuration?: string | number | null;
  defaultDurationUnit?: string | null;
  defaultFrequency?: string | null;
  defaultTiming?: string | null;
  defaultInstructions?: string | null;
};
export function InventoryRegimenFields({ value, onChange }: { value: Values; onChange: (patch: Values) => void }) {
  const inputClass = 'mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
  return <fieldset className="space-y-3 rounded-md border p-4">
    <legend className="px-1 text-sm font-semibold">Prescription defaults (optional)</legend>
    <p className="text-sm text-muted-foreground">Suggested only when this medicine has no prescriptions in the last 12 months. Leave blank for no default.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm">Default duration
        <input className={inputClass} type="number" min="1" step="1" value={value.defaultDuration ?? ''}
          onChange={event => onChange({ defaultDuration: event.target.value, defaultDurationUnit: value.defaultDurationUnit || 'DAYS' })} />
      </label>
      <label className="text-sm">Default duration unit
        <select className={inputClass} value={value.defaultDurationUnit || 'DAYS'} onChange={event => onChange({ defaultDurationUnit: event.target.value })}>
          <option value="DAYS">Days</option><option value="WEEKS">Weeks</option><option value="MONTHS">Months</option><option value="YEARS">Years</option>
        </select>
      </label>
      <label className="text-sm">Default frequency
        <input className={inputClass} maxLength={100} placeholder="e.g., 1-0-1" value={value.defaultFrequency ?? ''} onChange={event => onChange({ defaultFrequency: event.target.value })} />
      </label>
      <label className="text-sm">Default when
        <input className={inputClass} maxLength={100} placeholder="e.g., AM/PM" value={value.defaultTiming ?? ''} onChange={event => onChange({ defaultTiming: event.target.value })} />
      </label>
      <label className="text-sm sm:col-span-2">Default instructions
        <input className={inputClass} maxLength={2000} placeholder="e.g., On the rash" value={value.defaultInstructions ?? ''} onChange={event => onChange({ defaultInstructions: event.target.value })} />
      </label>
    </div>
  </fieldset>;
}
