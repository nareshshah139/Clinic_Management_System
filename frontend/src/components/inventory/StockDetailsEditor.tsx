"use client";

import { Button } from "@/components/ui/button";
import { InventoryChangePreview } from "./InventoryChangePreview";
import { InventoryRegimenFields } from "./InventoryRegimenFields";
import { inputClass } from "./workspace-model";
import { MedicineNameFields } from "./MedicineNameFields";
import { MEDICINE_FORMS, medicineNameProblems, standardMedicineName, type MedicineFormKey } from "@/lib/medicine-names";
import { useState } from "react";

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
  ["itemCode", "Item code"],
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
const namingFields = [
  ["form", "Form"],
  ["brandName", "Medicine name"],
  ["strength", "Strength"],
  ["isCombination", "Combination product"],
] as const;
const fieldValue = (value: unknown, key: string) =>
  key === "expiryDate"
    ? String(value || "").slice(0, 10)
    : key === "isCombination"
      ? (value ? "Yes" : "No")
      : key === "form"
        ? MEDICINE_FORMS[value as MedicineFormKey]?.label ?? ""
        : String(value ?? "");
const printedName = (value: Record<string, any>) =>
  value.form ? standardMedicineName({ ...value, name: value.brandName || value.name }) : String(value.name ?? "");

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
  focusField,
}: {
  item: Record<string, any>;
  focusField?: string;
  value: Record<string, any>;
  busy: boolean;
  onChange: (value: Record<string, any>) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  const original = { ...item, ...item.metadata };
  const [nameErrors, setNameErrors] = useState<Partial<Record<"form" | "name" | "strength", string>>>({});
  const naming = item.type === "MEDICINE" || Boolean(original.form) || Boolean(value.form);
  const beforeName = printedName(original), afterName = printedName(value);
  const changes = [
    ...(beforeName !== afterName ? [{ label: "Printed name", before: beforeName, after: afterName }] : []),
    ...[
      ...basicFields.filter(([key]) => key !== "name"),
      ...(naming ? namingFields : []),
      ...extraFields,
      ...regimenFields,
      ["status", "Availability"],
    ].flatMap(([key, label]) => {
      const before = fieldValue(original[key], key),
        after = fieldValue(value[key], key);
      return before === after ? [] : [{ label, before, after }];
    }),
  ];
  const suggestion = !original.form && !value.form ? item.nameSuggestion : null;
  const problems = () =>
    medicineNameProblems({ ...value, name: value.form ? value.brandName : value.name }).filter(
      (p) => p.field === "name" || (p.field === "form" && original.form) || (p.field === "strength" && String(original.strength || "").trim()),
    );
  const fields = (entries: readonly (readonly [string, string])[]) =>
    entries.map(([key, label]) => (
      <label key={key} className="block text-sm">
        {label}
        <input
          id={key === "name" ? "edit-name" : undefined}
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
          autoFocus={key === focusField}
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
        const found = problems();
        setNameErrors(Object.fromEntries(found.map((p) => [p.field, p.message])));
        if (found.length) return void document.getElementById(value.form ? `medicine-${found[0].field}` : "edit-name")?.focus();
        if (!busy && changes.length && value.reason?.trim()) void onSave();
      }}
    >
      <h3 className="text-lg font-semibold">Correct saved details</h3>
      <p className="text-sm text-muted-foreground">
        Check the pack or original bill. These changes apply to this batch; the
        original bill stays in history.
      </p>
      <fieldset disabled={busy} className="space-y-4">
        {naming && (
          <>
            {suggestion && (
              <p className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3 text-sm">
                <span>Suggested from the recorded name: <strong>{suggestion.standardName}</strong></span>
                <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...value, form: suggestion.form, brandName: suggestion.brandName, strength: suggestion.strength, isCombination: suggestion.isCombination, itemCode: value.itemCode || suggestion.itemCode })}>
                  Use suggestion
                </Button>
              </p>
            )}
            <MedicineNameFields
              value={value}
              errors={nameErrors}
              formRequired={Boolean(original.form)}
              onChange={(patch) => {
                setNameErrors({});
                onChange({ ...value, ...(patch.form && !value.form && !value.brandName && { brandName: value.name }), ...patch });
              }}
            />
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-2">{fields(value.form ? basicFields.filter(([key]) => key !== "name") : basicFields)}</div>
        <details open={extraFields.some(([key]) => key === focusField) || undefined}>
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
