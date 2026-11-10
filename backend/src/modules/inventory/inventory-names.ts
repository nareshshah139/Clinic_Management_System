import { BadRequestException } from '@nestjs/common';
import { parseRecordedName } from './medicine-name-parser';
import {
  MEDICINE_FORM_KEYS,
  medicineNameProblems,
  normalizeStrength,
  standardMedicineName,
  strengthMissing,
} from './medicine-names';

export function inventoryNameAliases(metadata: Record<string, any>): string[] {
  const aliases = metadata.nameNormalization?.aliases;
  return Array.isArray(aliases) ? aliases.filter((v): v is string => typeof v === 'string' && !!v.trim()) : [];
}

/**
 * @cc [owner:nareshshah139,label:product] inventory-reviewed-name-is-presentation
 * An item with a medicine form MUST display its stored standard name, without codes, pack sizes or
 * dispensing notes. Otherwise an explicitly reviewed inventory name MUST be displayed, and loose
 * tablet/capsule labels MUST remain visible. Naming MUST NOT establish product identity, combine
 * batches, change selling units, or rename the drug catalogue.
 */
export function inventoryProductName(
  item: { name: string; form?: string | null; drugs?: { name: string }[] },
  metadata: Record<string, any>,
): string {
  if (item.form) return item.name;
  const linkedName = item.drugs?.length === 1 ? item.drugs[0].name : undefined;
  if (metadata.nameNormalization?.version !== 1) return linkedName || item.name;
  const looseLabel = linkedName?.match(/ \(loose (?:tablets|capsules)\)$/i)?.[0];
  return item.name + (looseLabel && !/\(loose (?:tablets|capsules)\)$/i.test(item.name) ? looseLabel : '');
}

/** The name staff saw before the item was put in the standard format, while it still differs. */
export function inventoryRecordedName(item: { name: string; form?: string | null }, metadata: Record<string, any>, productName: string): string | null {
  const recorded = item.form ? metadata.nameNormalization?.recordedName : productName !== item.name ? item.name : null;
  return typeof recorded === 'string' && recorded.trim() && recorded !== productName ? recorded : null;
}

export function retainPreviousInventoryName(metadata: Record<string, any>, previousName: string, standardized = false): void {
  metadata.nameNormalization = {
    ...metadata.nameNormalization,
    version: 1,
    aliases: [...new Set([...inventoryNameAliases(metadata), previousName])],
    ...(standardized && !metadata.nameNormalization?.recordedName ? { recordedName: previousName } : {}),
  };
}

type NamingInput = {
  type?: string | null;
  name?: string | null;
  brandName?: string | null;
  form?: string | null;
  strength?: string | null;
  isCombination?: boolean | null;
  itemCode?: string | null;
};

const tidy = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

/**
 * @cc [owner:nareshshah139,label:product] medicine-standard-name
 * An item with a form MUST be named from its form, own name and strength in the clinic's format,
 * with the strength stored normalized and a combination product printing no strength. Item codes
 * and pack sizes MUST stay in their own fields. An item without a form keeps its typed name.
 */
export function withStandardName<T extends NamingInput>(input: T): T {
  const itemCode = input.itemCode === undefined ? undefined : tidy(input.itemCode) || null;
  if (!input.form) return { ...input, ...(itemCode !== undefined && { itemCode }) };
  const brandName = tidy(input.brandName || input.name);
  const isCombination = Boolean(input.isCombination);
  const strength = normalizeStrength(input.strength) || null;
  return {
    ...input,
    ...(itemCode !== undefined && { itemCode }),
    brandName,
    strength,
    isCombination,
    name: standardMedicineName({ form: input.form, name: brandName, strength, isCombination }) || tidy(input.name),
  };
}

/** New items from the clinic's form: medicines need a form, a name, and a strength where the format prints one. */
export function assertNewItemNaming(input: NamingInput): void {
  if (input.form != null && !MEDICINE_FORM_KEYS.includes(input.form as any))
    throw new BadRequestException('Choose a listed form');
  const problems = medicineNameProblems({ ...input, name: input.brandName || input.name });
  if (problems.length) throw new BadRequestException(problems.map((p) => p.message).join(' '));
}

export function inventoryNamePresentation(item: any, metadata: Record<string, any>, productName: string) {
  const suggestion = item.form
    ? null
    : parseRecordedName(item.name, {
        dosageForm: item.drugs?.length === 1 ? item.drugs[0].dosageForm : null,
        packUnit: item.packUnit,
        unit: item.unit,
        genericName: item.genericName,
        ingredients: item.drugs?.length === 1 ? [item.drugs[0].composition1, item.drugs[0].composition2] : [],
      });
  return {
    recordedName: inventoryRecordedName(item, metadata, productName),
    strengthMissing: strengthMissing(item),
    nameSuggestion: suggestion?.ok
      ? {
          form: suggestion.form,
          brandName: suggestion.name,
          strength: suggestion.strength,
          isCombination: suggestion.isCombination,
          itemCode: suggestion.itemCode,
          standardName: suggestion.standardName,
        }
      : null,
  };
}
