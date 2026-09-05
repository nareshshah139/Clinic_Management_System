import { encounterDay } from './patient-history';
const administrativeKeys = new Set(['status', 'completed', 'completedAt', 'completedBy', 'deleted', 'deletedAt', 'deletedBy', 'capturedBy', 'progress', 'sections']);
function meaningful(value: unknown): boolean {
  if (typeof value === 'string') {
    if (!value.trim()) return false;
    try { return meaningful(JSON.parse(value)); } catch { return true; }
  }
  if (Array.isArray(value)) return value.some(meaningful);
  if (value && typeof value === 'object') return Object.entries(value).some(([key, v]) => !administrativeKeys.has(key) && meaningful(v));
  return typeof value === 'number' || typeof value === 'boolean';
}
/** Visibility only: retain appointments and every visit except a strictly past, empty visit. */
export function isEmptyHistoryEntry(entry: Record<string, any>, now = new Date()): boolean {
  if (entry.entryType !== 'visit') return false;
  const day = encounterDay(entry);
  const today = encounterDay({ createdAt: now });
  if (!day || !today || day >= today) return false;
  if (['labOrders', 'deviceLogs', 'consents', 'complaints', 'history', 'exam', 'plan', 'diagnosis', 'vitals', 'scribeJson', 'followUp', 'appointmentNotes', 'prescription', 'prescriptionItems', 'attachments', 'photoPreviewUrls'].some(key => meaningful(entry[key]))) return false;
  if (Number(entry.photos) > 0 || meaningful(entry.appointment?.notes)) return false;
  return true;
}
