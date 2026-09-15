"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, RefreshCw, Plus, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { PurchaseInvoiceWorkbench } from "@/components/pharmacy/PurchaseInvoiceWorkbench";
import { PurchaseLedger } from "@/components/pharmacy/PurchaseLedger";
import { ComplianceCenter } from "@/components/pharmacy/ComplianceCenter";
import { DistributorAnalytics } from "@/components/pharmacy/DistributorAnalytics";
import { PharmacyInventoryStarterImport } from "@/components/pharmacy/PharmacyInventoryStarterImport";
import { PharmacyInvoiceList } from "@/components/pharmacy/PharmacyInvoiceList";
import { SupplierCreditPanel } from "./SupplierCreditPanel";
import { ReplenishmentCenter } from "./ReplenishmentCenter";
import { AlternateInvoiceIntake } from "./AlternateInvoiceIntake";
import { WorkflowDocumentEditor } from "./WorkflowDocumentEditor";
import { WorkspaceStock } from "./WorkspaceStock";
import {
  fmtMoney,
  fmtDate,
  inputClass,
  requestKey,
  workflowKinds,
  labelStatus,
  downloadCsv,
} from "./workspace-model";

const areas = [
  ["today", "Today"],
  ["purchases", "Purchases"],
  ["stock", "Stock"],
  ["sales", "Sales"],
  ["reorder", "Reorder"],
];
const menus: Record<string, string[][]> = {
  today: [],
  purchases: [
    ["intake", "Scan / enter invoice"],
    ["register", "Purchase register"],
    ["csv", "Import CSV"],
    ["gmail", "Gmail intake"],
    ["suppliers", "Suppliers"],
    ["ledger", "Payments & dues"],
    ["credits", "Credits & vouchers"],
    ["INWARD_CHALLAN", "Inward challans"],
    ["GATE_PASS", "Gate passes"],
    ["reports", "GST & monthly reports"],
    ["analytics", "Purchase costs"],
  ],
  stock: [
    ["list", "Stock list"],
    ["COUNT", "Counts & audit"],
    ["SUPPLIER_RETURN", "Supplier returns"],
    ["LOSS", "Loss & breakage"],
    ["HOLD", "Blocked stock"],
    ["CORRECTION", "Corrections"],
    ["OPENING_STOCK", "Manual opening stock"],
    ["opening", "Opening stock import"],
  ],
  sales: [
    ["COUNTER_SALE", "Counter sales"],
    ["QUOTATION", "Quotations"],
    ["SALES_RETURN", "Customer returns"],
    ["history", "Patient invoice history"],
  ],
  reorder: [
    ["SHORTBOOK", "Shortbook"],
    ["PURCHASE_ORDER", "Purchase orders"],
    ["TARGET_REVIEW", "Target proposals"],
    ["targets", "Manual targets & exclusions"],
    ["settings", "Automation settings"],
    ["monitor", "Monitor"],
  ],
};
/**
 * @cc [owner:nareshshah139,label:product] workspace-named-task-navigation
 * Every inventory task MUST have an in-app route back to its list; area, view, page and filters
 * MUST survive item-detail navigation and browser back. Posted outcomes come from the server.
 */
/**
 * @cc [owner:nareshshah139,label:product;target] inventory-workspace-navigation
 * The inventory workspace MUST expose named, reachable destinations for Today, Purchases,
 * Stock, Sales and Reorder; the user MUST be able to return to the originating list without
 * browser-only navigation.
 * Acceptance: INV-01. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
export function InventoryWorkspace() {
  const params = useSearchParams(),
    router = useRouter(),
    path = usePathname(),
    query = Object.fromEntries(params.entries()),
    area = query.area || "today",
    view = query.view || menus[area]?.[0]?.[0] || "";
  const [caps, setCaps] = useState<any>(null),
    [error, setError] = useState(""),
    [initial, setInitial] = useState<any>(null),
    [importedDraft, setImportedDraft] = useState<any>(null);
  const navigate = useCallback(
    (changes: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, val] of Object.entries(changes))
        val ? next.set(key, val) : next.delete(key);
      router.push(`${path}?${next.toString()}`, { scroll: false });
    },
    [params, path, router],
  );
  const origin = () => query.return || params.toString();
  const back = () => {
    const destination = query.return;
    if (destination) router.push(`${path}?${destination}`, { scroll: false });
    else
      navigate({
        document: "",
        new: "",
        invoice: "",
        item: "",
        receipt: "",
        intake: "",
      });
  };
  const open = (kind: string, id: string) => {
    setInitial(null);
    navigate({
      return: origin(),
      area: workflowKinds[kind].area,
      view: kind,
      document: id,
      new: "",
      item: "",
      invoice: "",
      receipt: "",
      intake: "",
      purchaseInvoiceId: "",
    });
  };
  const task = (kind: string, data?: any) => {
    setInitial(data || null);
    navigate({
      return: origin(),
      area: workflowKinds[kind].area,
      view: kind,
      new: requestKey(),
      document: "",
      item: "",
      invoice: "",
      receipt: "",
      intake: "",
      purchaseInvoiceId: "",
    });
  };
  const invoice = (id: string) =>
    navigate({
      return: origin(),
      area: "purchases",
      view: "intake",
      invoice: id,
      document: "",
      new: "",
      item: "",
      receipt: "",
      intake: "",
      purchaseInvoiceId: "",
    });
  const linkedInvoice = (receipt: any) => {
    sessionStorage.setItem("inventory-linked-receipt", JSON.stringify(receipt));
    navigate({
      return: origin(),
      area: "purchases",
      view: "intake",
      receipt: receipt.id,
      invoice: "",
      document: "",
      new: "",
      item: "",
      intake: "",
      purchaseInvoiceId: "",
    });
  };
  useEffect(() => {
    apiClient
      .get("/inventory/workspace/capabilities")
      .then(setCaps)
      .catch((e: any) => setError(e.message));
  }, []);
  const switchArea = (a: string) => {
    router.push(`${path}?area=${a}`, { scroll: false });
    setInitial(null);
  };
  return (
    <main className="min-w-0 space-y-5 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Inventory</h1>
          <p className="mt-1 text-muted-foreground">
            Receive, review and manage pharmacy stock.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            router.refresh();
            window.dispatchEvent(
              new CustomEvent("inventory-workspace-refresh"),
            );
          }}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </header>
      <nav
        aria-label="Inventory areas"
        className="flex gap-1 overflow-x-auto border-b pb-2 print:hidden"
      >
        {areas.map(([id, label]) => (
          <Button
            key={id}
            className="min-w-0 flex-1 px-2 text-xs sm:min-w-24 sm:flex-none sm:text-sm"
            aria-current={area === id ? "page" : undefined}
            variant={area === id ? "default" : "ghost"}
            onClick={() => switchArea(id)}
          >
            {label}
          </Button>
        ))}
      </nav>
      {menus[area]?.length > 0 && (
        <label className="block text-sm md:hidden">
          Task
          <select
            aria-label="Inventory task"
            className={inputClass}
            value={view}
            onChange={(e) =>
              navigate({
                view: e.target.value,
                document: "",
                new: "",
                invoice: "",
                item: "",
                receipt: "",
                intake: "",
                return: "",
                status: "",
                page: "1",
              })
            }
          >
            {menus[area].map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      {menus[area]?.length > 0 && (
        <nav
          aria-label={`${area} tasks`}
          className="hidden flex-wrap gap-2 md:flex print:hidden"
        >
          {menus[area].map(([id, label]) => (
            <Button
              key={id}
              size="sm"
              variant={view === id ? "secondary" : "ghost"}
              aria-current={view === id ? "page" : undefined}
              onClick={() =>
                navigate({
                  view: id,
                  document: "",
                  new: "",
                  invoice: "",
                  item: "",
                  receipt: "",
                  intake: "",
                  return: "",
                  status: "",
                  page: "1",
                })
              }
            >
              {label}
            </Button>
          ))}
        </nav>
      )}
      {error && (
        <p
          role="alert"
          className="border border-destructive p-3 text-destructive"
        >
          {error}
        </p>
      )}
      {!caps && !error && <p role="status">Loading inventory permissions…</p>}
      {caps && (
        <>
          {area === "today" && (
            <WorkspaceToday navigate={navigate} open={open} />
          )}
          {area === "stock" && view === "list" && (
            <WorkspaceStock
              onBack={back}
              query={query}
              navigate={navigate}
              itemId={query.item}
              capabilities={caps}
              onTask={task}
              onDocument={open}
              onInvoice={invoice}
            />
          )}
          {area === "stock" && view === "opening" && (
            <>
              <h2 className="text-2xl font-semibold">Opening stock import</h2>
              <PharmacyInventoryStarterImport />
            </>
          )}
          {area === "purchases" && view === "intake" && (
            <PurchaseInvoiceWorkbench
              invoiceId={query.invoice}
              receiptId={query.receipt}
              intakeId={query.intake}
              importedDraft={importedDraft}
              onImported={() => setImportedDraft(null)}
              onBack={back}
              onInvoice={invoice}
              draftKey={query.new}
              onNew={() => {
                setImportedDraft(null);
                navigate({
                  invoice: "",
                  receipt: "",
                  intake: "",
                  new: requestKey(),
                });
              }}
            />
          )}
          {area === "purchases" && ["csv", "gmail"].includes(view) && (
            <AlternateInvoiceIntake
              mode={view as "csv" | "gmail"}
              onInvoice={invoice}
              onDraft={(draft) => {
                setImportedDraft(draft);
                navigate({
                  view: "intake",
                  invoice: "",
                  receipt: "",
                  intake: "",
                });
              }}
            />
          )}
          {area === "purchases" && view === "register" && (
            <PurchaseRegister
              query={query}
              navigate={navigate}
              onOpen={invoice}
            />
          )}
          {area === "purchases" && view === "suppliers" && (
            <SupplierWorkspace
              canCreate={caps.supplierWrite}
              canUpdate={caps.supplierUpdate}
              onAccount={(gstin: string) => navigate({ view: "ledger", gstin })}
              onBills={(gstin: string) => navigate({ view: "register", gstin })}
            />
          )}
          {area === "purchases" &&
            view === "ledger" &&
            (caps.ledger ? (
              <PurchaseLedger
                initialGstin={query.gstin}
                canWrite={caps.creditWrite}
                onInvoice={invoice}
              />
            ) : (
              <p>Supplier payments require purchase-ledger permission.</p>
            ))}
          {area === "purchases" &&
            view === "credits" &&
            (caps.ledger ? (
              <SupplierCreditPanel
                purchaseInvoiceId={query.bill}
                supplierGstin={query.gstin}
                canWrite={caps.creditWrite}
                onNew={() => task("CREDIT_NOTE")}
                onOpen={open}
              />
            ) : (
              <p>Supplier credits require purchase-ledger permission.</p>
            ))}
          {area === "purchases" && view === "reports" && (
            <ComplianceCenter reportsOnly />
          )}
          {area === "purchases" && view === "analytics" && (
            <DistributorAnalytics />
          )}
          {area === "sales" && view === "history" && <PharmacyInvoiceList />}

          {view !== "TARGET_REVIEW" &&
          workflowKinds[view] &&
          (query.document || query.new) ? (
            <WorkflowDocumentEditor
              key={query.document || view + "-" + query.new}
              kind={view}
              id={query.document}
              draftKey={query.new}
              initial={
                initial ||
                (query.purchaseInvoiceId
                  ? { purchaseInvoiceId: query.purchaseInvoiceId }
                  : undefined)
              }
              capabilities={caps}
              onBack={back}
              onOpen={open}
              onInvoice={linkedInvoice}
            />
          ) : (
            area !== "reorder" &&
            workflowKinds[view] && (
              <WorkflowRegister
                key={view}
                kind={view}
                query={query}
                navigate={navigate}
                capabilities={caps}
                onNew={() => task(view)}
                onOpen={open}
                onReceive={(doc: any) =>
                  task("INWARD_CHALLAN", {
                    sourceId: doc.id,
                    supplierId: doc.supplierId,
                    payload: {
                      date: new Date().toISOString().slice(0, 10),
                      reason: "Purchase order receipt",
                      lines: doc.payload.lines.map((l: any) => ({
                        ...l,
                        id: requestKey(),
                        sourceLineId: l.id,
                      })),
                    },
                  })
                }
              />
            )
          )}
          {area === "reorder" && !query.new && (
            <ReplenishmentCenter
              query={query}
              navigate={navigate}
              view={view}
              documentId={query.document}
              caps={caps}
              onOpen={open}
              onCreate={task}
              onBack={view === "TARGET_REVIEW" ? back : undefined}
              onReceive={(ctx: any) =>
                task("INWARD_CHALLAN", {
                  supplierId: ctx.supplierId,
                  sourceId: ctx.id,
                  payload: {
                    lines: ctx.lines
                      .filter((l: any) => l.remainingQuantity > 0)
                      .map((l: any) => ({
                        ...l,
                        id: requestKey(),
                        sourceLineId: l.id,
                        quantity: l.remainingQuantity,
                        freeQuantity: 0,
                      })),
                    reason: `Receipt against ${ctx.reference}`,
                  },
                })
              }
            />
          )}
        </>
      )}
    </main>
  );
}
/**
 * @cc [owner:nareshshah139,label:product;target] inventory-daily-action-queues
 * The daily view MUST distinguish unresolved receipts, low stock, expiring stock, unfinished
 * returns and overdue supplier balances, with each count opening its matching records.
 * Acceptance: INV-02. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
function WorkspaceToday({ navigate, open }: any) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const load = () =>
      apiClient
        .get("/inventory/workspace/overview")
        .then(setData)
        .catch((e: any) => setError(e.message));
    load();
    window.addEventListener("inventory-workspace-refresh", load);
    return () =>
      window.removeEventListener("inventory-workspace-refresh", load);
  }, []);
  const queue = (kind: string) =>
    data?.queues
      ?.filter(
        (q: any) =>
          q.kind === kind &&
          ![
            "POSTED",
            "RELEASED",
            "RECEIVED",
            "REJECTED",
            "CANCELLED",
            "REVERSED",
            "CONVERTED",
          ].includes(q.status),
      )
      .reduce((n: number, q: any) => n + q._count, 0) || 0;
  const rows = [
    ...(data?.supplierOverdue
      ? [
          {
            label: "Overdue supplier bills",
            count: data.supplierOverdue.count,
            detail: `Outstanding ${fmtMoney(data.supplierOverdue.amount)}. Open the supplier account to review and allocate payment.`,
            target: { area: "purchases", view: "ledger" },
          },
        ]
      : []),
    {
      label: "Low stock",
      count: data?.lowStock,
      detail: "Available quantity is at or below this batch’s saved minimum.",
      target: { area: "stock", view: "list", stock: "LOW" },
    },
    {
      label: "Expiring in the next 3 months",
      count: data?.expiring,
      detail: "Current stock in batches expiring within three months.",
      target: { area: "stock", view: "list", expiryMonths: "3" },
    },
    {
      label: "Purchase invoices to review",
      count:
        data?.purchases
          ?.filter(
            (p: any) => !["STOCK_COMMITTED", "CANCELLED"].includes(p.status),
          )
          .reduce((n: number, p: any) => n + p._count, 0) || 0,
      detail:
        "Open the invoice, resolve highlighted checks and confirm stock status.",
      target: { area: "purchases", view: "register", status: "UNPOSTED" },
    },
    {
      label: "Original files awaiting intake",
      count: data?.unlinked || 0,
      detail: "Continue from a retained photo or PDF.",
      target: { area: "purchases", view: "intake" },
    },
    {
      label: "Counts awaiting completion",
      count: queue("COUNT"),
      detail: "Enter physical counts or approve a reviewed variance.",
      target: { area: "stock", view: "COUNT", status: "OPEN" },
    },
    {
      label: "Supplier returns in progress",
      count: queue("SUPPLIER_RETURN"),
      detail: "Complete the challan and supplier credit.",
      target: { area: "stock", view: "SUPPLIER_RETURN", status: "OPEN" },
    },
    {
      label: "Orders awaiting receipt",
      count: queue("PURCHASE_ORDER"),
      detail: "Receive the actual batches against the approved order.",
      target: { area: "reorder", view: "PURCHASE_ORDER", status: "OPEN" },
    },
  ];
  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-2xl font-semibold">What needs attention</h2>
        <p className="text-muted-foreground">
          Every action opens the matching records.{" "}
          {data && `As of ${fmtDate(data.asOf)} · current branch`}
        </p>
      </header>
      {error && (
        <p role="alert">
          {error}{" "}
          <Button
            variant="outline"
            onClick={() => {
              setError("");
              window.dispatchEvent(
                new CustomEvent("inventory-workspace-refresh"),
              );
            }}
          >
            Retry queues
          </Button>
        </p>
      )}
      {!data ? (
        error ? (
          <p>Branch queues are unavailable. Retry to see current work.</p>
        ) : (
          <p role="status">Loading branch queues…</p>
        )
      ) : (
        <>
          <ul className="divide-y border-y">
            {rows.map((r) => (
              <li key={r.label}>
                <button
                  className="flex w-full items-center gap-4 py-5 text-left hover:bg-muted/50"
                  onClick={() => navigate(r.target)}
                >
                  <span className="min-w-10 text-2xl font-semibold">
                    {r.count ?? "—"}
                  </span>
                  <span className="flex-1">
                    <strong>{r.label}</strong>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {r.detail}
                    </span>
                  </span>
                  <ArrowRight className="h-5 w-5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                navigate({ area: "stock", view: "list", stock: "LOW" })
              }
            >
              Check low stock
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                navigate({ area: "stock", view: "list", expiryMonths: "3" })
              }
            >
              Check next 3 months’ expiry
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate({ area: "purchases", view: "ledger" })}
            >
              Check overdue supplier balances
            </Button>
          </div>
          <h3 className="text-lg font-semibold">Recent activity</h3>
          <ul className="divide-y">
            {data.recent.map((d: any) => (
              <li key={d.id} className="py-3">
                <button
                  className="flex w-full flex-wrap justify-between gap-2 text-left"
                  onClick={() => open(d.kind, d.id)}
                >
                  <span className="underline">{d.reference}</span>
                  <span className="text-sm text-muted-foreground">
                    {workflowKinds[d.kind]?.label} · {labelStatus(d.status)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
/**
 * @cc [owner:nareshshah139,label:product;target] purchase-register-complete
 * The purchase register MUST allow retrieval of every authorized saved invoice and unfinished
 * upload, including records beyond the recent-preview limit, with status and source retained.
 * Acceptance: INV-18. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
function PurchaseRegister({ query, navigate, onOpen }: any) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        page: query.page || "1",
        limit: "30",
        ...(query.status === "UNPOSTED"
          ? { unposted: "true" }
          : query.status
            ? { status: query.status }
            : {}),
        ...(query.from ? { startDate: query.from } : {}),
        ...(query.to ? { endDate: query.to } : {}),
        ...(query.gstin ? { distributorGstin: query.gstin } : {}),
        ...(query.search ? { search: query.search } : {}),
        ...(query.source ? { source: query.source } : {}),
      });
      setData(await apiClient.get("/pharmacy/purchase-invoices?" + q));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [
    query.status,
    query.page,
    query.from,
    query.to,
    query.gstin,
    query.search,
    query.source,
  ]);
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Purchase register</h2>
      <div className="flex flex-wrap gap-3">
        <label className="flex-1 text-sm">
          Invoice number or supplier
          <input
            className={inputClass}
            value={query.search || ""}
            onChange={(e) => navigate({ search: e.target.value, page: "1" })}
          />
        </label>
        <label className="text-sm">
          Source
          <select
            className={inputClass}
            value={query.source || ""}
            onChange={(e) => navigate({ source: e.target.value, page: "1" })}
          >
            <option value="">All sources</option>
            {["MANUAL", "OCR", "CSV", "GMAIL"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          className="self-end"
          onClick={() =>
            window.open(
              "/api/inventory/workspace/purchases/export?" +
                new URLSearchParams({
                  format: "xlsx",
                  ...(query.status === "UNPOSTED"
                    ? { unposted: "true" }
                    : query.status
                      ? { status: query.status }
                      : {}),
                  ...(query.from ? { startDate: query.from } : {}),
                  ...(query.to ? { endDate: query.to } : {}),
                  ...(query.gstin ? { distributorGstin: query.gstin } : {}),
                  ...(query.search ? { search: query.search } : {}),
                  ...(query.source ? { source: query.source } : {}),
                }),
              "_blank",
            )
          }
        >
          Export full register
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          Status
          <select
            className={inputClass}
            value={query.status || ""}
            onChange={(e) => navigate({ status: e.target.value, page: "1" })}
          >
            <option value="">All</option>
            {[
              "UNPOSTED",
              "DRAFT",
              "OCR_REVIEW_REQUIRED",
              "RECONCILIATION_FAILED",
              "REVIEWED",
              "STOCK_COMMITTED",
              "CANCELLED",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Supplier GSTIN
          <input
            className={inputClass}
            value={query.gstin || ""}
            onChange={(e) =>
              navigate({ gstin: e.target.value.toUpperCase(), page: "1" })
            }
          />
        </label>
        {["from", "to"].map((k) => (
          <label key={k} className="text-sm">
            {k === "from" ? "From date" : "To date"}
            <input
              type="date"
              className={inputClass}
              value={query[k] || ""}
              onChange={(e) => navigate({ [k]: e.target.value, page: "1" })}
            />
          </label>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <p role="status" className="text-sm">
        {loading
          ? "Loading invoices…"
          : error
            ? "Invoices unavailable"
            : `${data?.pagination?.total ?? 0} invoices`}
      </p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              {[
                "Invoice",
                "Supplier",
                "Date",
                "Status",
                "Amount",
                "Original",
              ].map((t) => (
                <th className="p-3" key={t}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {data?.data.map((d: any) => (
              <tr key={d.id}>
                <td className="p-3">
                  <button
                    className="font-medium underline"
                    onClick={() => onOpen(d.id)}
                  >
                    {d.invoiceNumber}
                  </button>
                </td>
                <td className="p-3">
                  {d.distributorName}
                  <p className="text-xs text-muted-foreground">
                    {d.distributorGstin}
                  </p>
                </td>
                <td className="p-3">{fmtDate(d.invoiceDate)}</td>
                <td className="p-3">
                  {d.status === "STOCK_COMMITTED"
                    ? "Stock added"
                    : d.status.replaceAll("_", " ").toLowerCase()}
                </td>
                <td className="p-3">{fmtMoney(d.netPayable)}</td>
                <td className="p-3">
                  {d.documents?.map((f: any) => (
                    <a
                      key={f.id}
                      href={`/api/pharmacy/purchase-invoices/documents/${f.id}`}
                      className="block underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {f.fileName}
                    </a>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between gap-3">
        <Button
          variant="outline"
          disabled={loading || !(data?.pagination.page > 1)}
          onClick={() => navigate({ page: String(data.pagination.page - 1) })}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          disabled={
            loading ||
            !data?.pagination ||
            data.pagination.page >= data.pagination.pages
          }
          onClick={() => navigate({ page: String(data.pagination.page + 1) })}
        >
          Next
        </Button>
      </div>
    </section>
  );
}
function WorkflowRegister({
  kind,
  query,
  navigate,
  capabilities,
  onNew,
  onOpen,
  onReceive,
}: any) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const definition = workflowKinds[kind];
  const load = async () => {
    try {
      setData(
        await apiClient.get(
          "/inventory/workspace/documents?" +
            new URLSearchParams({
              kind,
              page: query.page || "1",
              ...(query.status ? { status: query.status } : {}),
              ...Object.fromEntries(
                ["search", "from", "to", "gstin"]
                  .filter((k) => query[k])
                  .map((k) => [k, query[k]]),
              ),
            }),
        ),
      );
    } catch (e: any) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
  }, [
    kind,
    query.status,
    query.page,
    query.search,
    query.from,
    query.to,
    query.gstin,
  ]);
  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const path =
        kind === "COUNT"
          ? "counts"
          : kind === "SHORTBOOK"
            ? "shortbook/refresh"
            : "targets/propose";
      const d = await apiClient.post<any>("/inventory/workspace/" + path, {
        requestKey: requestKey(),
      });
      if (d.id) onOpen(d.kind, d.id);
      else {
        await load();
        setError(d.message || "Shortbook refreshed.");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!capabilities?.kinds?.[kind]?.read)
    return (
      <p>
        You do not have permission to view {definition.label.toLowerCase()}.
      </p>
    );
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{definition.label}</h2>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            {definition.help}
          </p>
        </div>
        {capabilities?.kinds?.[kind]?.write && (
          <div className="flex flex-wrap gap-2">
            {["COUNT", "SHORTBOOK", "TARGET_REVIEW"].includes(kind) && (
              <Button disabled={busy} onClick={generate}>
                {kind === "COUNT"
                  ? "Start stock count"
                  : kind === "SHORTBOOK"
                    ? "Add low-stock demand"
                    : "Generate target proposal"}
              </Button>
            )}
            {!["COUNT", "TARGET_REVIEW", "CORRECTION"].includes(kind) && (
              <Button
                variant={kind === "SHORTBOOK" ? "outline" : "default"}
                onClick={onNew}
              >
                <Plus className="h-4 w-4" />
                New{" "}
                {kind === "PURCHASE_ORDER"
                  ? "order"
                  : kind === "QUOTATION"
                    ? "quotation"
                    : "document"}
              </Button>
            )}
          </div>
        )}
      </header>
      <label className="block max-w-xs text-sm">
        Status
        <select
          className={inputClass}
          value={query.status || ""}
          onChange={(e) => navigate({ status: e.target.value, page: "1" })}
        >
          <option value="">All statuses</option>
          {[
            "OPEN",
            "DRAFT",
            "AWAITING_APPROVAL",
            "APPROVED",
            "CHALLAN",
            "POSTED",
            "PART_RECEIVED",
            "RECEIVED",
            "RELEASED",
            "REVERSED",
            "CANCELLED",
            "REJECTED",
          ].map((v) => (
            <option key={v} value={v}>
              {labelStatus(v)}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          Reference
          <input
            className={inputClass}
            value={query.search || ""}
            onChange={(e) => navigate({ search: e.target.value, page: "1" })}
          />
        </label>
        {["from", "to"].map((k) => (
          <label key={k} className="text-sm">
            {k === "from" ? "From date" : "To date"}
            <input
              type="date"
              className={inputClass}
              value={query[k] || ""}
              onChange={(e) => navigate({ [k]: e.target.value, page: "1" })}
            />
          </label>
        ))}
        {[
          "SUPPLIER_RETURN",
          "INWARD_CHALLAN",
          "GATE_PASS",
          "CREDIT_NOTE",
        ].includes(kind) && (
          <label className="text-sm">
            Supplier GSTIN
            <input
              className={inputClass}
              value={query.gstin || ""}
              onChange={(e) =>
                navigate({ gstin: e.target.value.toUpperCase(), page: "1" })
              }
            />
          </label>
        )}
      </div>
      {error && (
        <p role="alert" className="border p-3">
          {error}
        </p>
      )}
      <ul className="divide-y border-y">
        {data?.rows.map((d: any) => (
          <li
            key={d.id}
            className="flex flex-wrap items-center justify-between gap-3 py-4"
          >
            <button
              onClick={() => onOpen(d.kind, d.id)}
              className="min-w-52 flex-1 text-left"
            >
              <strong className="underline underline-offset-4">
                {d.reference}
              </strong>
              <span className="mt-1 block text-sm text-muted-foreground">
                {fmtDate(d.createdAt)} · {d.payload.lines.length} lines ·{" "}
                {labelStatus(d.status)}
              </span>
            </button>
            <span>{fmtMoney(d.totalAmount)}</span>
            {kind === "PURCHASE_ORDER" &&
              ["APPROVED", "PART_RECEIVED"].includes(d.status) &&
              capabilities?.kinds?.INWARD_CHALLAN?.write && (
                <Button variant="outline" onClick={() => onReceive(d)}>
                  Receive against order
                </Button>
              )}
          </li>
        ))}
        {data && !data.rows.length && (
          <li className="py-8 text-center text-muted-foreground">
            No {definition.label.toLowerCase()} match this status.
          </li>
        )}
      </ul>
      <div className="flex justify-between">
        <Button
          variant="outline"
          disabled={!data || data.page <= 1}
          onClick={() => navigate({ page: String(data.page - 1) })}
        >
          Previous
        </Button>
        <span className="text-sm">{data?.total || 0} records</span>
        <Button
          variant="outline"
          disabled={!data || data.page >= data.totalPages}
          onClick={() => navigate({ page: String(data.page + 1) })}
        >
          Next
        </Button>
      </div>
    </section>
  );
}
function SupplierWorkspace({ canCreate, canUpdate, onAccount, onBills }: any) {
  const [rows, setRows] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
    [error, setError] = useState("");
  const load = () =>
    apiClient
      .get<any[]>("/inventory/workspace/suppliers")
      .then(setRows)
      .catch((e: any) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  return (
    <section className="space-y-4">
      <div className="flex justify-between">
        <h2 className="text-2xl font-semibold">Suppliers</h2>
        {canCreate && (
          <Button
            onClick={() =>
              setSelected({ name: "", gstNumber: "", isActive: true })
            }
          >
            Add supplier
          </Button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {selected && (
        <form
          className="space-y-4 border-y py-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const allowed = Object.fromEntries(
                [
                  "name",
                  "gstNumber",
                  "drugLicenseNo",
                  "foodLicenseNo",
                  "contactPerson",
                  "email",
                  "phone",
                  "address",
                  "city",
                  "state",
                  "pincode",
                  "paymentTerms",
                  "notes",
                  "isActive",
                ]
                  .filter((k) => selected[k] !== undefined)
                  .map((k) => [k, selected[k]]),
              );
              if (selected.id)
                await apiClient.patch(
                  `/inventory/suppliers/${selected.id}`,
                  allowed,
                );
              else await apiClient.post("/inventory/suppliers", allowed);
              setSelected(null);
              load();
            } catch (e: any) {
              setError(e.message);
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["name", "Supplier name"],
              ["gstNumber", "GSTIN"],
              ["drugLicenseNo", "Drug licence"],
              ["foodLicenseNo", "Food licence"],
              ["contactPerson", "Contact person"],
              ["email", "Email"],
              ["phone", "Phone"],
              ["address", "Address"],
              ["paymentTerms", "Payment terms"],
              ["notes", "Notes"],
            ].map(([k, t]) => (
              <label key={k} className="text-sm">
                {t}
                <input
                  className={inputClass}
                  value={selected[k] || ""}
                  required={["name", "gstNumber"].includes(k)}
                  onChange={(e) =>
                    setSelected({ ...selected, [k]: e.target.value })
                  }
                />
              </label>
            ))}
          </div>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.isActive}
              onChange={(e) =>
                setSelected({ ...selected, isActive: e.target.checked })
              }
            />
            Active supplier
          </label>
          <div className="flex gap-2">
            <Button>Save supplier</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelected(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      <ul className="divide-y border-y">
        {rows.map((s) => (
          <li key={s.id} className="flex flex-wrap justify-between gap-3 py-4">
            <div>
              <strong>{s.name}</strong>
              <p className="text-sm text-muted-foreground">
                {s.gstNumber || "GSTIN missing"} ·{" "}
                {s.phone || s.email || "Contact not saved"} ·{" "}
                {s.isActive ? "Active" : "Inactive"}
              </p>
            </div>
            {s.gstNumber && (
              <>
                <Button variant="outline" onClick={() => onBills(s.gstNumber)}>
                  Bills
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onAccount(s.gstNumber)}
                >
                  Account & dues
                </Button>
              </>
            )}
            {canUpdate && (
              <Button variant="outline" onClick={() => setSelected(s)}>
                Edit supplier
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
