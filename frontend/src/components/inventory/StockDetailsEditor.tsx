"use client";

import { Button } from "@/components/ui/button";
import { InventoryChangePreview } from "./InventoryChangePreview";
import { InventoryRegimenFields } from "./InventoryRegimenFields";
import { inputClass } from "./workspace-model";

const basicFields = [
  ["name", "Product name"],
  ["batchNumber", "Batch number"],
  ["expiryDate", "Expiry date"],
  ["storageLocation", "Rack / shelf"],
  ["manufacturer", "Manufacturer"],
] as const;
const extraFields = [
  ["category", "Category"],
  ["subCategory", "Subcategory"],
  ["genericName", "Composition / generic"],
  ["dosageForm", "Dosage form"],
  ["schedule", "Schedule"],
  ["hsnCode", "HSN"],
  ["gstRate", "GST %"],
  ["minStockLevel", "Minimum stock"],
  ["maxStockLevel", "Maximum stock"],
  ["reorderLevel", "Reorder at"],
  ["barcode", "Barcode"],
  ["sku", "SKU"],
] as const;
const regimenFields = [
  ["defaultDuration", "Default duration"],
  ["defaultDurationUnit", "Duration unit"],
  ["defaultFrequency", "Default frequency"],
  ["defaultTiming", "Default when"],
  ["defaultInstructions", "Default instructions"],
] as const;
const numericFields = new Set([
  "gstRate",
  "minStockLevel",
  "maxStockLevel",
  "reorderLevel",
]);
const fieldValue = (value: unknown, key: string) =>
  key === "expiryDate" ? String(value || "").slice(0, 10) : String(value ?? "");

/**
 * @cc [owner:nareshshah139,label:product] saved-details-correction-preview
 * Detail edits MUST display saved and proposed values before saving and require a reason.
 * Cancel MUST discard the proposal; failed saves MUST retain it. Batch dates use the saved UTC
 * calendar date. Quantity, selling price and pack units MUST stay outside this metadata form.
 */
export function StockDetailsEditor({
  item,
  value,
  onChange,
  onSave,
  onCancel,
  busy,
}: {
  item: Record<string, any>;
  value: Record<string, any>;
  busy: boolean;
  onChange: (value: Record<string, any>) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  const original = { ...item, ...item.metadata };
  const changes = [
    ...basicFields,
    ...extraFields,
    ...regimenFields,
    ["status", "Availability"],
  ].flatMap(([key, label]) => {
    const before = fieldValue(original[key], key),
      after = fieldValue(value[key], key);
    return before === after ? [] : [{ label, before, after }];
  });
  const fields = (entries: readonly (readonly [string, string])[]) =>
    entries.map(([key, label]) => (
      <label key={key} className="block text-sm">
        {label}
        <input
          className={inputClass}
          type={
            key === "expiryDate"
              ? "date"
              : numericFields.has(key)
                ? "number"
                : "text"
          }
          required={
            key === "name" ||
            ((key === "batchNumber" || key === "expiryDate") && !!original[key])
          }
          min={numericFields.has(key) ? 0 : undefined}
          step={
            key === "gstRate" ? "0.01" : numericFields.has(key) ? 1 : undefined
          }
          value={fieldValue(value[key], key)}
          onChange={(event) =>
            onChange({ ...value, [key]: event.target.value })
          }
        />
      </label>
    ));
  return (
    <form
      aria-label="Edit product details"
      className="space-y-4 border-y py-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && changes.length && value.reason?.trim()) void onSave();
      }}
    >
      <h3 className="text-lg font-semibold">Correct saved details</h3>
      <p className="text-sm text-muted-foreground">
        Check the pack or original bill. These changes apply to this batch; the
        original bill stays in history.
      </p>
      <fieldset disabled={busy} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">{fields(basicFields)}</div>
        <details>
          <summary className="cursor-pointer py-2 font-medium">
            More details: tax, stock limits &amp; codes
          </summary>
          <div className="grid gap-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
            {fields(extraFields)}
            <label className="text-sm">
              Availability
              <select
                className={inputClass}
                value={value.status}
                onChange={(event) =>
                  onChange({ ...value, status: event.target.value })
                }
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="DISCONTINUED">Discontinued</option>
              </select>
            </label>
          </div>
          {(item.type === "MEDICINE" || item.drugs?.length > 0) && (
            <InventoryRegimenFields
              value={value}
              onChange={(patch) => onChange({ ...value, ...patch })}
            />
          )}
        </details>
        <InventoryChangePreview changes={changes} />
        <label className="block text-sm">
          Why are you changing it?
          <input
            required
            className={inputClass}
            value={value.reason || ""}
            onChange={(event) =>
              onChange({ ...value, reason: event.target.value })
            }
            placeholder="e.g. Expiry was entered incorrectly; checked the pack"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!changes.length || !value.reason?.trim()}>
            {busy ? "Saving…" : "Save corrected details"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
