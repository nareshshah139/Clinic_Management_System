export function doctorLabel(name?: string | null): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '';
  return /^dr\b\.?/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
}
