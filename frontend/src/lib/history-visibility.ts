const emptyComplaints = new Set(['general consultation', 'photo documentation visit']);
const administrativeKeys = new Set(['status', 'completed', 'completedAt', 'completedBy', 'deleted', 'deletedAt', 'deletedBy', 'capturedBy', 'progress', 'sections']);
function meaningful(value: unknown): boolean {
  if (typeof value === 'string') {
    if (!value.trim()) return false;
    try { return meaningful(JSON.parse(value)); } catch { return true; }
  }
  if (Array.isArray(value)) return value.some(meaningful);
  if (value && typeof value === 'object') return Object.entries(value).some(([key, v]) => !administrativeKeys.has(key) && meaningful(v));
  return typeof value === 'number' || value === true;
}
/** Visibility only: empty records remain available, and are never classified as proven failed saves. */
export function isEmptyHistoryEntry(entry: Record<string, any>): boolean {
  if (!('entryType' in entry || 'complaints' in entry || 'history' in entry || 'plan' in entry)) return false;
  if (['history', 'exam', 'plan', 'diagnosis', 'vitals', 'scribeJson', 'followUp', 'appointmentNotes', 'prescription', 'prescriptionItems', 'attachments', 'photoPreviewUrls'].some(key => meaningful(entry[key]))) return false;
  if (Number(entry.photos) > 0 || meaningful(entry.appointment?.notes)) return false;
  let complaints = entry.complaints;
  if (typeof complaints === 'string') { try { complaints = JSON.parse(complaints); } catch { return !meaningful(complaints); } }
  return !((Array.isArray(complaints) ? complaints : []).some((item: any) => {
    const { complaint, ...details } = typeof item === 'string' ? { complaint: item } : item || {};
    return (typeof complaint === 'string' && complaint.trim() && !emptyComplaints.has(complaint.trim().toLowerCase())) || meaningful(details);
  }));
}
