export function inventoryNameAliases(metadata: Record<string, any>): string[] {
  const aliases = metadata.nameNormalization?.aliases;
  return Array.isArray(aliases) ? aliases.filter((v): v is string => typeof v === 'string' && !!v.trim()) : [];
}

/**
 * @cc [owner:nareshshah139,label:product] inventory-reviewed-name-is-presentation
 * An explicitly reviewed inventory name MUST be displayed. Naming MUST NOT establish product
 * identity, combine batches, change selling units, or rename the drug catalogue. Loose
 * tablet/capsule labels MUST remain visible.
 */
export function inventoryProductName(item: { name: string; drugs?: { name: string }[] }, metadata: Record<string, any>): string {
  const linkedName = item.drugs?.length === 1 ? item.drugs[0].name : undefined;
  if (metadata.nameNormalization?.version !== 1) return linkedName || item.name;
  const looseLabel = linkedName?.match(/ \(loose (?:tablets|capsules)\)$/i)?.[0];
  return item.name + (looseLabel && !/\(loose (?:tablets|capsules)\)$/i.test(item.name) ? looseLabel : '');
}

export function retainPreviousInventoryName(metadata: Record<string, any>, previousName: string): void {
  metadata.nameNormalization = {
    ...metadata.nameNormalization,
    version: 1,
    aliases: [...new Set([...inventoryNameAliases(metadata), previousName])],
  };
}
