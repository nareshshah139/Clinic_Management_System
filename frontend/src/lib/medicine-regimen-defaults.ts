export const regimenFields = ['duration', 'frequency', 'timing', 'instructions'] as const;
export type RegimenField = typeof regimenFields[number];
export const regimenLabels: Record<RegimenField, string> = { duration: 'Duration', frequency: 'Frequency', timing: 'When', instructions: 'Instructions' };
export interface RegimenRow {
  drugId?: string;
  duration: number | '';
  durationUnit: string;
  frequency: string;
  dosePattern?: string;
  timing?: string;
  instructions?: string;
  regimenState?: {
    selection?: string;
    suggested?: RegimenField[];
    touched?: RegimenField[];
    source?: string;
    loading?: boolean;
    failed?: boolean;
  };
}
const keys: Record<RegimenField, (keyof RegimenRow)[]> = {
  duration: ['duration', 'durationUnit'], frequency: ['frequency', 'dosePattern'], timing: ['timing'], instructions: ['instructions'],
};
const blank: Pick<RegimenRow, 'duration' | 'durationUnit' | 'frequency' | 'dosePattern' | 'timing' | 'instructions'> = {
  duration: '', durationUnit: 'DAYS', frequency: '', dosePattern: '', timing: '', instructions: '',
};
const hasValue = (row: RegimenRow, field: RegimenField) => field === 'duration'
  ? row.duration !== '' && row.duration != null
  : field === 'frequency' ? Boolean(row.frequency?.trim() || row.dosePattern?.trim()) : Boolean(row[field]?.trim());

export function editRegimenRow<T extends RegimenRow>(row: T, patch: Partial<T>): T {
  const state = row.regimenState || {};
  const edited = regimenFields.filter(field => keys[field].some(key => Object.prototype.hasOwnProperty.call(patch, key)));
  let next = { ...row, ...patch, regimenState: { ...state,
    touched: [...new Set([...(state.touched || []), ...edited])],
    suggested: (state.suggested || []).filter(field => !edited.includes(field)),
  } };
  if (Object.prototype.hasOwnProperty.call(patch, 'drugName')) {
    // Invalidate requests when the user types a new name, even before choosing it.
    next = clearSuggestions(next);
    next.drugId = undefined;
    next.regimenState = { ...next.regimenState, selection: undefined, loading: false, failed: false };
  }
  return next;
}
function clearSuggestions<T extends RegimenRow>(row: T): T {
  const next = { ...row };
  for (const field of row.regimenState?.suggested || []) {
    for (const key of keys[field]) (next as any)[key] = blank[key as keyof typeof blank];
  }
  next.regimenState = { ...row.regimenState, suggested: [] };
  return next;
}
export function beginRegimenSelection<T extends RegimenRow>(row: T, selection: string): T {
  const state = row.regimenState || {};
  const touched = regimenFields.filter(field => state.touched?.includes(field) || (hasValue(row, field) && !state.suggested?.includes(field)));
  return { ...clearSuggestions(row), regimenState: { selection, touched, suggested: [], loading: true } };
}
export function applyRegimenSuggestion<T extends RegimenRow>(row: T, values: Partial<RegimenRow>, source: string): T {
  const next = { ...row };
  const state = row.regimenState || {};
  const suggested: RegimenField[] = [];
  for (const field of regimenFields) {
    if (state.touched?.includes(field) || !hasValue(values as RegimenRow, field)) continue;
    for (const key of keys[field]) (next as any)[key] = values[key] ?? blank[key as keyof typeof blank];
    suggested.push(field);
  }
  next.regimenState = { ...state, source, suggested, loading: false, failed: false };
  return next;
}
export function acceptRegimenField<T extends RegimenRow>(row: T, field: RegimenField): T {
  return { ...row, regimenState: { ...row.regimenState,
    suggested: (row.regimenState?.suggested || []).filter(value => value !== field),
    touched: [...new Set([...(row.regimenState?.touched || []), field])],
  } };
}
