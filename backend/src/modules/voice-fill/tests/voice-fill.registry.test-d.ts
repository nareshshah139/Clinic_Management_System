import type { VoiceFillRowFieldSpec } from '../voice-fill.registry';

// Checked by `npm run typecheck`: fails if a row cell could ever hold another rows field or a list.
// @ts-expect-error a row cell cannot be another rows field
const nestedRows: VoiceFillRowFieldSpec = { type: 'rows', label: 'Nested', maxItems: 1, fields: {} };
// @ts-expect-error a row cell cannot be a list
const listCell: VoiceFillRowFieldSpec = { type: 'list', label: 'Tags' };
void [nestedRows, listCell];
