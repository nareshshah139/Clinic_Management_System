/**
 * @cc [owner:nareshshah139,label:product] workspace-url-layers
 * A workspace URL has three layers: area and view, the view's own filters, and at most one open
 * subject with details that only mean something while it is open. Entering a view MUST start from
 * only the params the caller hands it, so one view's filters never reach another; opening or
 * closing a subject MUST drop the previous subject's details. Back to a recorded origin restores
 * that origin exactly.
 */
const SUBJECTS = ["document", "new", "invoice", "item", "receipt", "intake"];
const SUBJECT_DETAILS = ["itemTab", "recoverRequest", "recoverVersion", "recoverOperation", "attempt", "actor", "sources", "purchaseInvoiceId"];

export function nextWorkspaceSearch(current: URLSearchParams, changes: Record<string, string>) {
  const entersView = "area" in changes || "view" in changes;
  const changesSubject = SUBJECTS.some((key) => key in changes);
  const next = new URLSearchParams();
  current.forEach((value, key) => {
    const keep = key === "area" || (!entersView && !(changesSubject && SUBJECT_DETAILS.includes(key)));
    if (keep) next.set(key, value);
  });
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  return next;
}
