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

type Move = { params: Record<string, string>; listOnly?: true } | { href: string; label: string };
type WorkspaceMove = { search: URLSearchParams } | { href: string; label: string };

const OPENS_RECORD = ["document", "new", "recoverRequest"];
const SUPPLIER_RETURNS: Move = { params: { area: "purchases", view: "register", tab: "returns", type: "SUPPLIER_RETURN" }, listOnly: true };

/**
 * @cc [owner:nareshshah139,label:product] workspace-moved-views
 * A retired `area/view` link MUST land on its new home: an in-app move rewrites only the named
 * params and keeps the rest (filters, OAuth code/state); a move out of Inventory names its page.
 * A list-only move leaves a link that opens a record where it is.
 */
const MOVED_VIEWS: Record<string, Move> = {
  "purchases/csv": { params: { view: "intake", method: "csv" } },
  "purchases/gmail": { params: { view: "intake", method: "gmail" } },
  "purchases/ledger": { params: { view: "register", tab: "payments" } },
  "purchases/credits": { params: { view: "register", tab: "credits" } },
  "purchases/SUPPLIER_RETURN": SUPPLIER_RETURNS,
  "stock/SUPPLIER_RETURN": SUPPLIER_RETURNS,
  "purchases/CREDIT_NOTE": { params: { view: "register", tab: "returns", type: "CREDIT_NOTE" }, listOnly: true },
  "purchases/reports": { href: "/dashboard/pharmacy/reports?report=gst-summary", label: "Pharmacy Report" },
  "purchases/daywise": { href: "/dashboard/pharmacy/reports?report=day-wise-summary", label: "Pharmacy Report" },
  "purchases/margin": { href: "/dashboard/pharmacy/reports?report=item-margin", label: "Pharmacy Report" },
  "sales/history": { href: "/dashboard/pharmacy/sales", label: "Sales" },
};

export function movedWorkspaceView(current: URLSearchParams): WorkspaceMove | null {
  const move = MOVED_VIEWS[`${current.get("area") || "today"}/${current.get("view") || ""}`];
  if (!move) return null;
  if ("href" in move) return move;
  if (move.listOnly && OPENS_RECORD.some((key) => current.has(key))) return null;
  const search = new URLSearchParams(current);
  for (const [key, value] of Object.entries(move.params)) search.set(key, value);
  return { search };
}
