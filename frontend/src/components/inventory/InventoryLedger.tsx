"use client";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight, Boxes, ClipboardCheck, FileDown, FileSpreadsheet, FileText, Handshake, PackageMinus,
  PackageOpen, PencilLine, Receipt, RotateCcw, ShieldAlert, ShoppingBag, Stethoscope, Truck, Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/skeleton";
import { displayClinicDate, displayClinicTime } from "@/lib/date-display";
import { useInventoryResource } from "./useInventoryResource";
import { downloadCsv, fmtMoney, inputClass, workflowKinds } from "./workspace-model";

type Channel =
  | "PURCHASE_INVOICE" | "PRESCRIPTION" | "PHARMACY_BILL" | "COUNTER_SALE" | "PARTNER_SALE" | "CUSTOMER_RETURN"
  | "SUPPLIER_RETURN" | "LOSS" | "HOLD" | "STOCK_COUNT" | "CORRECTION" | "OPENING_STOCK" | "APPROVED_EDIT"
  | "TRANSFER" | "INVENTORY_DOCUMENT" | "MANUAL";
type Direction = "IN" | "OUT" | "UNKNOWN";
type LedgerDocument =
  | { type: "PURCHASE_INVOICE"; id: string; number: string; status: string }
  | { type: "PHARMACY_INVOICE"; id: string; number: string; status: string; prescriptionId: string | null }
  | { type: "WORKFLOW"; id: string; kind: string; number: string; status: string }
  | { type: "IMPORT"; id: string; row: string | null }
  | { type: "APPROVAL"; id: string }
  | { type: "PARTNER_SALE"; id: string };
type Entry = {
  id: string; at: string; type: string; delta: number | null; direction: Direction;
  balance: { before: number; after: number } | null; unit: string | null; unitPrice: number; value: number;
  reference: string | null; reason: string | null; note: string | null; batchNumber: string | null;
  item: { id: string; name: string } | null; actor: { id: string; name: string } | null;
  source: { channel: Channel; label: string; document: LedgerDocument | null; counterparty: string | null };
};
type Timeline = {
  range: { from: string; to: string }; truncated: boolean; scanLimit: number; rows: Entry[];
  pagination: { page: number; limit: number; total: number; pages: number };
};

type Tone = "receipt" | "dispense" | "loss" | "adjust" | "neutral";
const CHANNEL: Record<Channel, { label: string; icon: LucideIcon; tone: Tone }> = {
  PURCHASE_INVOICE: { label: "Purchase invoice", icon: Truck, tone: "receipt" },
  OPENING_STOCK: { label: "Opening stock", icon: FileSpreadsheet, tone: "receipt" },
  CUSTOMER_RETURN: { label: "Customer return", icon: Undo2, tone: "receipt" },
  PRESCRIPTION: { label: "Prescription dispensed", icon: Stethoscope, tone: "dispense" },
  PHARMACY_BILL: { label: "Pharmacy bill", icon: Receipt, tone: "dispense" },
  COUNTER_SALE: { label: "Counter sale", icon: ShoppingBag, tone: "dispense" },
  PARTNER_SALE: { label: "Partner daily sale", icon: Handshake, tone: "dispense" },
  SUPPLIER_RETURN: { label: "Supplier return", icon: RotateCcw, tone: "loss" },
  LOSS: { label: "Loss or breakage", icon: PackageMinus, tone: "loss" },
  HOLD: { label: "Blocked stock", icon: ShieldAlert, tone: "loss" },
  STOCK_COUNT: { label: "Stock count", icon: ClipboardCheck, tone: "adjust" },
  CORRECTION: { label: "Movement correction", icon: PencilLine, tone: "adjust" },
  APPROVED_EDIT: { label: "Approved stock edit", icon: PencilLine, tone: "adjust" },
  TRANSFER: { label: "Location transfer", icon: ArrowLeftRight, tone: "neutral" },
  INVENTORY_DOCUMENT: { label: "Inventory document", icon: FileText, tone: "neutral" },
  MANUAL: { label: "Manual entry", icon: Boxes, tone: "neutral" },
};
const TONE: Record<Tone, string> = {
  receipt: "border-success-border bg-success-soft text-success-text",
  dispense: "border-info-border bg-info-soft text-info-text",
  loss: "border-destructive-border bg-destructive-soft text-destructive-text",
  adjust: "border-warning-border bg-warning-soft text-warning-text",
  neutral: "border-border bg-muted text-muted-foreground",
};
const DELTA: Record<Direction, string> = { IN: "text-success-text", OUT: "text-destructive-text", UNKNOWN: "text-muted-foreground" };
const PRESETS: [string, number][] = [["Today", 0], ["7 days", 6], ["30 days", 29], ["90 days", 89]];

const clinicToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const daysBefore = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const signed = (n: number | null) => (n === null ? "±?" : n > 0 ? `+${n}` : `−${-n}`);
const unitLabel = (unit: string | null) => (unit ? unit.toLowerCase() : "units");

function documentLabel(doc: LedgerDocument): string {
  switch (doc.type) {
    case "PURCHASE_INVOICE": return `Purchase bill ${doc.number}`;
    case "PHARMACY_INVOICE": return `${doc.prescriptionId ? "Rx bill" : "Bill"} ${doc.number}`;
    case "WORKFLOW": return `${workflowKinds[doc.kind]?.label || doc.kind} ${doc.number}`;
    case "IMPORT": return doc.row ? `Import row ${doc.row}` : "Excel import";
    case "APPROVAL": return "Approved change request";
    case "PARTNER_SALE": return "Partner sales sync";
  }
}

/**
 * @cc [owner:nareshshah139,label:product] inventory-ledger-view
 * The stock ledger MUST show every movement newest first, grouped by clinic day, with its signed
 * change, recorded balance, source method, counterparty and actor. Range, method, direction,
 * search and page MUST live in the workspace URL so item detail and browser back return to the
 * same view. The workspace refresh action MUST reload the ledger. Loading, failed and empty reads
 * MUST stay distinct, and a truncated range MUST say so.
 */
export function InventoryLedger({ query, navigate, onDocument, onInvoice, onItem }: {
  query: Record<string, string>;
  navigate: (changes: Record<string, string>) => void;
  onDocument: (kind: string, id: string) => void;
  onInvoice: (id: string) => void;
  onItem: (id: string) => void;
}) {
  const today = clinicToday();
  const to = query.ledgerTo || today, from = query.ledgerFrom || daysBefore(to, 29);
  const channel = (query.ledgerChannel in CHANNEL ? query.ledgerChannel : "") as Channel | "";
  const direction = (query.ledgerDirection || "") as Direction | "";
  const [search, setSearch] = useState(query.ledgerSearch || "");
  useEffect(() => setSearch(query.ledgerSearch || ""), [query.ledgerSearch]);
  useEffect(() => {
    if (search === (query.ledgerSearch || "")) return;
    const timer = setTimeout(() => navigate({ ledgerSearch: search, ledgerPage: "" }), 300);
    return () => clearTimeout(timer);
  }, [search, query.ledgerSearch, navigate]);

  const params = new URLSearchParams({ from, to, page: query.ledgerPage || "1", limit: "50" });
  if (channel) params.set("channel", channel);
  if (direction) params.set("direction", direction);
  if (query.ledgerSearch) params.set("search", query.ledgerSearch);
  const timeline = useInventoryResource<Timeline>(`/inventory/workspace/timeline?${params}`);
  const data = timeline.data;
  const { reload } = timeline;
  useEffect(() => {
    const refresh = () => void reload();
    window.addEventListener("inventory-workspace-refresh", refresh);
    return () => window.removeEventListener("inventory-workspace-refresh", refresh);
  }, [reload]);

  const days = useMemo(() => {
    const groups: { day: string; entries: Entry[] }[] = [];
    for (const entry of data?.rows || []) {
      const day = displayClinicDate(entry.at);
      const group = groups.at(-1)?.day === day ? groups.at(-1)! : (groups.push({ day, entries: [] }), groups.at(-1)!);
      group.entries.push(entry);
    }
    return groups;
  }, [data]);
  const exportRows = () => downloadCsv(`stock-ledger-${from}-to-${to}.csv`, (data?.rows || []).map(e => ({
    date: displayClinicDate(e.at), time: displayClinicTime(e.at), product: e.item?.name ?? "", batch: e.batchNumber ?? "",
    change: e.delta ?? "", unit: e.unit ?? "", before: e.balance?.before ?? "", after: e.balance?.after ?? "",
    method: e.source.label, document: e.source.document ? documentLabel(e.source.document) : e.reference ?? "",
    party: e.source.counterparty ?? "", by: e.actor?.name ?? "", reason: e.reason ?? "", value: e.value,
  })));

  const openDocument = (doc: LedgerDocument) => {
    if (doc.type === "PURCHASE_INVOICE") return onInvoice(doc.id);
    if (doc.type === "WORKFLOW" && workflowKinds[doc.kind]) return onDocument(doc.kind, doc.id);
    if (doc.type === "PHARMACY_INVOICE") window.location.assign(`/dashboard/pharmacy/invoices?search=${encodeURIComponent(doc.number)}`);
  };
  const linkable = (doc: LedgerDocument) =>
    doc.type === "PURCHASE_INVOICE" || doc.type === "PHARMACY_INVOICE" || (doc.type === "WORKFLOW" && !!workflowKinds[doc.kind]);

  return (
    <section aria-label="Stock ledger" className="space-y-5">
      <div className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-4 md:grid-cols-[auto_auto_minmax(14rem,1fr)_minmax(10rem,13rem)_auto] md:items-end">
        <label className="grid gap-1 text-sm font-medium">From
          <input type="date" className={inputClass} value={from} max={to} onChange={e => e.target.value && navigate({ ledgerFrom: e.target.value, ledgerPage: "" })} />
        </label>
        <label className="grid gap-1 text-sm font-medium">To
          <input type="date" className={inputClass} value={to} min={from} max={today} onChange={e => e.target.value && navigate({ ledgerTo: e.target.value, ledgerPage: "" })} />
        </label>
        <label className="col-span-2 grid gap-1 text-sm font-medium md:col-span-1">Search
          <input type="search" className={inputClass} placeholder="Product, batch or reference" value={search} onChange={e => setSearch(e.target.value)} />
        </label>
        <label className="col-span-2 grid gap-1 text-sm font-medium md:col-span-1">Method
          <select className={inputClass} value={channel} onChange={e => navigate({ ledgerChannel: e.target.value, ledgerPage: "" })}>
            <option value="">All methods</option>
            {(Object.keys(CHANNEL) as Channel[]).map(c => <option key={c} value={c}>{CHANNEL[c].label}</option>)}
          </select>
        </label>
        <div role="group" aria-label="Direction" className="col-span-2 flex rounded-md border p-0.5 md:col-span-1">
          {([["", "All"], ["IN", "Stock in"], ["OUT", "Stock out"]] as const).map(([value, label]) => (
            <button key={label} type="button" aria-pressed={direction === value}
              className={`rounded px-3 py-1.5 text-sm ${direction === value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => navigate({ ledgerDirection: value, ledgerPage: "" })}>{label}</button>
          ))}
        </div>
        <div className="col-span-2 flex flex-wrap gap-2 md:col-span-5">
          {PRESETS.map(([label, n]) => {
            const active = to === today && from === daysBefore(today, n);
            return (
              <button key={label} type="button" aria-pressed={active}
                className={`rounded-full border px-3 py-1 text-sm ${active ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"}`}
                onClick={() => navigate({ ledgerFrom: daysBefore(today, n), ledgerTo: today, ledgerPage: "" })}>{label}</button>
            );
          })}
          <Button size="sm" variant="outline" className="ml-auto" disabled={!data?.rows.length} onClick={exportRows}>
            <FileDown className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {timeline.status === "loading" && <LoadingSkeleton variant="table" label="Loading stock ledger…" />}
      {timeline.status === "error" && (
        <div role="alert" className="rounded-lg border border-destructive-border bg-destructive-soft p-4 text-destructive-text">
          <p>{timeline.error}</p>
          <p className="text-sm">Reading the ledger never changes stock.</p>
          <Button className="mt-2" variant="outline" onClick={() => void timeline.reload()}>Try again</Button>
        </div>
      )}
      {data && (
        <>
          {data.truncated && (
            <p role="status" className="rounded-md border border-warning-border bg-warning-soft p-3 text-sm text-warning-text">
              This range holds more than {data.scanLimit.toLocaleString("en-IN")} movements. Only the newest are shown. Narrow the dates or search for a product to see the rest.
            </p>
          )}

          {!data.rows.length ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <PackageOpen className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="mt-2 font-medium">No stock changes match these filters</p>
              <p className="text-sm text-muted-foreground">Widen the date range or clear the method and direction filters.</p>
            </div>
          ) : (
            <ol className="space-y-6" aria-label="Stock movements">
              {days.map(group => (
                <li key={group.day}>
                  <div className="sticky top-0 z-10 flex items-baseline justify-between border-b bg-background/95 py-2 backdrop-blur">
                    <h3 className="font-semibold">{group.day}</h3>
                    <span className="text-sm text-muted-foreground">{group.entries.length} {group.entries.length === 1 ? "change" : "changes"}</span>
                  </div>
                  <ol className="relative ml-3 border-l">
                    {group.entries.map(entry => <LedgerRow key={entry.id} entry={entry} onItem={onItem}
                      onDocument={entry.source.document && linkable(entry.source.document) ? () => openDocument(entry.source.document!) : undefined} />)}
                  </ol>
                </li>
              ))}
            </ol>
          )}

          {data.pagination.pages > 1 && (
            <nav aria-label="Ledger pages" className="flex items-center justify-between">
              <Button variant="outline" disabled={data.pagination.page <= 1} onClick={() => navigate({ ledgerPage: String(data.pagination.page - 1) })}>Newer</Button>
              <span className="text-sm text-muted-foreground">Page {data.pagination.page} of {data.pagination.pages} · {data.pagination.total} changes</span>
              <Button variant="outline" disabled={data.pagination.page >= data.pagination.pages} onClick={() => navigate({ ledgerPage: String(data.pagination.page + 1) })}>Older</Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

function LedgerRow({ entry, onItem, onDocument }: { entry: Entry; onItem: (id: string) => void; onDocument?: () => void }) {
  const { icon: Icon, tone } = CHANNEL[entry.source.channel];
  const doc = entry.source.document;
  return (
    <li className="relative py-3 pl-6">
      <span aria-hidden className={`absolute -left-[0.8rem] top-4 flex h-6 w-6 items-center justify-center rounded-full border ${TONE[tone]}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className={`text-lg font-semibold tabular-nums ${DELTA[entry.direction]}`}
              aria-label={entry.delta === null ? "Direction not recorded" : `${entry.delta > 0 ? "Added" : "Removed"} ${Math.abs(entry.delta)} ${unitLabel(entry.unit)}`}>
              {signed(entry.delta)} <span className="text-sm font-normal">{unitLabel(entry.unit)}</span>
            </span>
            {entry.item ? (
              <button type="button" className="truncate font-medium underline-offset-2 hover:underline" onClick={() => onItem(entry.item!.id)}>{entry.item.name}</button>
            ) : <span className="font-medium">Unknown product</span>}
            {entry.batchNumber && <span className="text-sm text-muted-foreground">Batch {entry.batchNumber}</span>}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONE[tone]}`}>{entry.source.label}</span>
            {doc && (onDocument
              ? <button type="button" className="underline underline-offset-2" onClick={onDocument}>{documentLabel(doc)}</button>
              : <span>{documentLabel(doc)}</span>)}
            {!doc && entry.reference && <span className="text-muted-foreground">Ref {entry.reference}</span>}
            {entry.source.counterparty && <span className="text-muted-foreground">· {entry.source.counterparty}</span>}
          </p>
          {(entry.reason || entry.note) && (
            <p className="mt-1 text-sm text-muted-foreground">{[entry.reason, entry.note].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        <div className="text-sm text-muted-foreground sm:text-right">
          <p><time dateTime={entry.at}>{displayClinicTime(entry.at)}</time>{entry.actor && <> · {entry.actor.name}</>}</p>
          {entry.balance
            ? <p className="tabular-nums" aria-label={`Balance went from ${entry.balance.before} to ${entry.balance.after}`}>{entry.balance.before} → <span className="font-medium text-foreground">{entry.balance.after}</span></p>
            : <p>Balance not recorded</p>}
          {entry.value > 0 && <p className="tabular-nums">{fmtMoney(entry.value)}</p>}
        </div>
      </div>
    </li>
  );
}
