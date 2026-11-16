import { formatMedicineName, type MedicineNameFields } from '@cms/shared-types/medicine-name';
export function inventoryNameAliases(metadata: Record<string, any>): string[] {
  const aliases = metadata.nameNormalization?.aliases;
  return Array.isArray(aliases) ? aliases.filter((v): v is string => typeof v === 'string' && !!v.trim()) : [];
}

/**
 * @cc [owner:nareshshah139,label:product] inventory-reviewed-name-is-presentation
 * An explicitly reviewed inventory name MUST be displayed. Naming MUST NOT establish product
 * identity, combine batches, change selling units, or rename the drug catalogue. Loose
 * dispensing settings MUST remain stored separately from patient-facing names.
 */
export function inventoryProductName(item: MedicineNameFields & { name: string; drugs?: ({ name: string } & MedicineNameFields)[] }, metadata: Record<string, any>): string {
  const drug = item.drugs?.length === 1 ? item.drugs[0] : undefined;
  const reviewed = metadata.nameNormalization?.version === 1;
  const name = reviewed ? item.name : drug?.name || item.name;
  return formatMedicineName(name, reviewed ? { ...item, brandName: undefined } : item.brandName ? item : drug || item);
}

export function retainPreviousInventoryName(metadata: Record<string, any>, previousName: string): void {
  metadata.nameNormalization = {
    ...metadata.nameNormalization,
    version: 1,
    aliases: [...new Set([...inventoryNameAliases(metadata), previousName])],
  };
}
