export const MAX_INVESTIGATION_NAME_LENGTH = 100;

export function collapseWhitespace(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function normalizeInvestigationName(raw: string): {
  name: string;
  normalizedName: string;
} {
  const name = collapseWhitespace(raw);
  return { name, normalizedName: name.toLowerCase() };
}
