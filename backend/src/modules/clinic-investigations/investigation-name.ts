export const MAX_INVESTIGATION_NAME_LENGTH = 100;

export function collapseWhitespace(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * @cc [owner:nareshshah139,label:integrity] investigation-name-normalization
 * A name MUST be trimmed with every whitespace run collapsed to one space and keep the typed case
 * for display; the uniqueness key MUST be that name lower-cased. Names that differ only in case or
 * whitespace MUST therefore share one key.
 */
export function normalizeInvestigationName(raw: string): {
  name: string;
  normalizedName: string;
} {
  const name = collapseWhitespace(raw);
  return { name, normalizedName: name.toLowerCase() };
}
