"use client";
import { displayClinicDate } from '@/lib/date-display';
import { getISTDateString } from '@/lib/utils';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import "./inventory-readability.css";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, RefreshCw, Plus } from "lucide-react";
import { InventoryAction } from "./InventoryPresentation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { useInventoryResource } from "./useInventoryResource";
import { PurchaseInvoiceWorkbench } from "@/components/pharmacy/PurchaseInvoiceWorkbench";
import { PurchaseLedger } from "@/components/pharmacy/PurchaseLedger";
import { DistributorAnalytics } from "@/components/pharmacy/DistributorAnalytics";
import { PharmacyInventoryStarterImport } from "@/components/pharmacy/PharmacyInventoryStarterImport";
import { PharmacyInvoiceList } from "@/components/pharmacy/PharmacyInvoiceList";
import { TradeTermsWorkspace } from "@/components/pharmacy/TradeTermsWorkspace";
import { SupplierCreditPanel } from "./SupplierCreditPanel";
import { ReplenishmentCenter } from "./ReplenishmentCenter";
import { AlternateInvoiceIntake } from "./AlternateInvoiceIntake";
import { WorkflowDocumentEditor } from "./WorkflowDocumentEditor";
import { WorkspaceStock } from "./WorkspaceStock";
import { PurchaseBills } from "./purchase/PurchaseBills";
import { canRecordSupplierPayments } from "./purchase/purchase-register-model";
import { StockCounts } from "./counts/StockCounts";
import { splitText, type ReconciliationCards } from "./counts/count-model";
import { Split } from "./counts/count-parts";
import { InventoryApprovals } from "./InventoryApprovals";
import { InventoryLedger } from "./InventoryLedger";
import { usePendingItemRequestCount } from "./use-pending-item-requests";
import { ITEM_REQUEST_APPROVER_ROLES } from "@/lib/inventory-item-requests";
import { useDashboardUser } from "@/components/layout/dashboard-user-context";
import {
  fmtMoney,
  inputClass,
  requestKey,
  workflowKinds,
  labelStatus,
  downloadCsv,
  returnDestination,
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
    ["register", "Purchase bills"],
    ["intake", "Scan or enter bill"],
    ["csv", "Import CSV"],
    ["gmail", "Gmail intake"],
    ["suppliers", "Suppliers"],
    ["terms", "Terms of Trade"],
    ["ledger", "Payments & dues"],
    ["credits", "Credits & vouchers"],
    ["INWARD_CHALLAN", "Inward challans"],
    ["GATE_PASS", "Gate passes"],
    ["analytics", "Purchase costs"],
  ],
  stock: [
    ["list", "Stock list"],
    ["ledger", "Stock ledger"],
    ["approvals", "Approve corrections"],
    ["COUNT", "Stock counts"],
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
/**
 * @cc [owner:nareshshah139,label:accessibility] inventory-readable-scope
 * Inventory content MUST use scalable text of at least 14px at the default root size,
 * with 18px phone inputs. Increasing text size MUST leave actions reachable and wide tables
 * scrollable within the workspace, without changing typography on unrelated routes.
 */
/**
 * @cc [owner:nareshshah139,label:product] inventory-permission-retry
 * Failed capability reads MUST hide stale access and expose an explicit retry. Refresh and
 * actor changes MUST fetch capabilities again; older responses cannot restore superseded access.
 */
/** Reports moved to Pharmacy Report (CR-33); old Inventory links land on the same report there. */
const MOVED_REPORTS: Record<string, string> = {
  reports: "/dashboard/pharmacy/reports?report=gst-summary",
  daywise: "/dashboard/pharmacy/reports?report=day-wise-summary",
  margin: "/dashboard/pharmacy/reports?report=item-margin",
};

export function InventoryWorkspace() {
  const { user } = useDashboardUser();
  const canReadEdits = ["OWNER", "ADMIN", "DOCTOR", "PHARMACIST"].includes(user?.role || "");
  const canSeeApprovals = canReadEdits || user?.role === "RECEPTION";
  const taskVisible = ([id]: string[]) => id !== "approvals" || canSeeApprovals;
  const pendingItems = usePendingItemRequestCount(ITEM_REQUEST_APPROVER_ROLES.includes(user?.role || ""));
  const taskLabel = (id: string, label: string) => (id === "approvals" && pendingItems > 0 ? `${label} (${pendingItems})` : label);
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
      if ('document' in changes || 'new' in changes || 'invoice' in changes || 'item' in changes || 'view' in changes) {
        for (const key of ['recoverRequest', 'recoverVersion', 'recoverOperation']) if (!(key in changes)) next.delete(key);
      }
      if ('invoice' in changes || 'new' in changes || (changes.view && changes.view !== 'intake')) {
        for (const key of ['attempt', 'actor', 'sources']) if (!(key in changes)) next.delete(key);
      }
      router.push(`${path}?${next.toString()}`, { scroll: false });
    },
    [params, path, router],
  );
  const origin = () => query.return || params.toString();
  const back = () => {
    const destination = returnDestination(query.return, path, window.location.origin);
    if (destination) router.push(destination, { scroll: false });
    else
      navigate({
        return: "",
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
  const permissionRequest = useRef(0);
  const loadPermissions = useCallback(async () => {
    const request = ++permissionRequest.current;
    setCaps(null);
    setError("");
    try {
      const capabilities = await apiClient.get("/inventory/workspace/capabilities");
      if (request === permissionRequest.current) setCaps(capabilities);
    } catch {
      if (request === permissionRequest.current) setError("Inventory permissions could not be loaded. Loading permissions does not change stock. Retry when your connection is available; if access remains unavailable, ask an inventory administrator to check your account.");
    }
  }, [user?.id, user?.branchId]);
  useEffect(() => {
    void loadPermissions();
    return () => { permissionRequest.current += 1; };
  }, [loadPermissions]);
  const availableTasks = (menus[area] || []).filter((task) => taskVisible(task)
    && (task[0] !== "ledger" || area !== "purchases" || caps?.ledger)
    && (task[0] !== "COUNT" || caps?.kinds?.COUNT?.read));
  const primaryCount = area === "stock" ? 4 : 3;
  const primaryTasks = availableTasks.slice(0, primaryCount);
  const moreTasks = availableTasks.slice(primaryCount);
  const switchTask = (id: string, extra: Record<string, string> = {}) => navigate({ sourceId: "", view: id, document: "", new: "", invoice: "", item: "", receipt: "", intake: "", return: "", status: "", page: "1", ...extra });
  const purchaseRegisterParams = (next: URLSearchParams) => {
    const merged = new URLSearchParams({ area: "purchases", view: "register" });
    next.forEach((value, key) => merged.set(key, value));
    if (merged.toString() !== window.location.search.slice(1)) router.replace(`${path}?${merged}`, { scroll: false });
  };
  const countRegisterParams = (tab: string, next: URLSearchParams) => {
    const merged = new URLSearchParams({ area: "stock", view: "COUNT", tab });
    next.forEach((value, key) => merged.set(key, value));
    if (merged.toString() !== window.location.search.slice(1)) router.replace(`${path}?${merged}`, { scroll: false });
  };
  const switchArea = (a: string) => {
    router.push(`${path}?area=${a}`, { scroll: false });
    setInitial(null);
  };
  return (
    <main className="inventory-surface min-w-0 space-y-5 pb-12 dark:bg-background dark:text-foreground">
      <PageHeader title={<>Inventory</>} description={<>Receive, review and manage pharmacy stock.</>} actions={<><InventoryAction
          label="Refresh inventory"
          onClick={() => {
            void loadPermissions();
            router.refresh();
            window.dispatchEvent(
              new CustomEvent("inventory-workspace-refresh"),
            );
          }}
        >
          <RefreshCw className="h-4 w-4" />
        </InventoryAction></>} />
      <nav
        aria-label="Inventory areas"
        className="flex flex-wrap gap-1 border-b pb-2 print:hidden"
      >
        {areas.map(([id, label]) => (
          <Button
            key={id}
            className="min-w-24 flex-1 px-2 text-xs sm:flex-none sm:text-sm"
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
            {availableTasks.map(([id, label]) => (
              <option key={id} value={id}>
                {taskLabel(id, label)}
              </option>
            ))}
          </select>
        </label>
      )}
      {area === "stock" && (
        <button type="button" className="block text-left text-sm underline underline-offset-4 md:hidden"
          onClick={() => router.push(`${path}?area=purchases&view=register&tab=returns`, { scroll: false })}>
          Supplier returns are now in Purchase bills › Returns
        </button>
      )}
      {menus[area]?.length > 0 && (
        <nav
          aria-label={`${area} tasks`}
          className="hidden flex-wrap gap-2 md:flex print:hidden"
        >
          {primaryTasks.map(([id, label]) => (
            <Button key={id} size="sm" variant={view === id ? "secondary" : "ghost"}
              aria-current={view === id ? "page" : undefined} onClick={() => switchTask(id)}>{taskLabel(id, label)}</Button>
          ))}
          {area === "stock" && (
            <button type="button" className="self-center rounded-sm px-2 text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onClick={() => router.push(`${path}?area=purchases&view=register&tab=returns`, { scroll: false })}>
              Supplier returns are now in Purchase bills › Returns
            </button>
          )}
          {moreTasks.length > 0 && <select aria-label="More inventory tasks" className="max-w-64 rounded-md border bg-background px-3 py-2 text-sm"
            value={moreTasks.some(([id]) => id === view) ? view : ""} onChange={event => switchTask(event.target.value)}>
            <option value="" disabled>More tasks…</option>
            {moreTasks.map(([id, label]) => <option key={id} value={id}>{taskLabel(id, label)}</option>)}
          </select>}
        </nav>
      )}
      {error && (
        <p
          role="alert"
          className="border border-destructive p-3 text-destructive"
        >
          {error}{" "}
          <Button variant="outline" onClick={() => void loadPermissions()}>Retry permissions</Button>
        </p>
      )}
      {!caps && !error && <LoadingSkeleton variant="cards" label="Loading inventory permissions…" />}
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
          {area === "stock" && view === "COUNT" && (
            <StockCounts searchParams={params} navigate={navigate} onRegisterParams={countRegisterParams} />
          )}
          {area === "stock" && view === "ledger" && (
            <InventoryLedger
              query={query}
              navigate={navigate}
              onDocument={open}
              onInvoice={invoice}
              onItem={(id) => navigate({ return: origin(), view: "list", item: id })}
            />
          )}
          {area === "stock" && view === "approvals" && (
            canSeeApprovals ? <InventoryApprovals canReadEdits={canReadEdits} pendingItems={pendingItems} /> : <p role="alert">You do not have access to price/stock approvals.</p>
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
              recoveryAttemptId={query.attempt}
              recoveryActorId={query.actor}
              recoverySourceIds={query.sources?.split(",").filter(Boolean)}
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
            <PurchaseBills
              searchParams={params}
              onParamsChange={purchaseRegisterParams}
              onTabChange={(next) => router.push(`${path}?${new URLSearchParams({ area: "purchases", view: "register", ...Object.fromEntries(next) })}`, { scroll: false })}
              canSettle={canRecordSupplierPayments(caps, user?.role)}
              onOpen={invoice}
              onOpenReturn={open}
              onNewReturn={() => task("SUPPLIER_RETURN")}
              onNew={() => navigate({ return: origin(), view: "intake", new: requestKey(), invoice: "", receipt: "", intake: "", document: "", item: "" })}
              onLedger={caps.ledger ? (gstin?: string) => switchTask("ledger", { gstin: gstin ?? "" }) : null}
              onSuppliers={() => switchTask("suppliers")}
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
          {area === "purchases" && view === "terms" && <TradeTermsWorkspace />}
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
          {area === "purchases" && MOVED_REPORTS[view] && <MovedReport href={MOVED_REPORTS[view]} />}
          {area === "purchases" && view === "analytics" && (
            <DistributorAnalytics />
          )}
          {area === "sales" && view === "history" && <PharmacyInvoiceList />}

          {view !== "TARGET_REVIEW" &&
          view !== "COUNT" &&
          workflowKinds[view] &&
          (query.document || query.new || query.recoverRequest) ? (
            <WorkflowDocumentEditor
              key={`${query.document || view + "-" + (query.new || query.recoverRequest)}:${query.recoverVersion || ""}:${query.recoverOperation || ""}`}
              kind={view}
              id={query.document}
              draftKey={query.new}
              recoveryRequestKey={query.recoverRequest || undefined}
              recoveryVersion={query.recoverVersion?.trim() && Number.isSafeInteger(Number(query.recoverVersion)) && Number(query.recoverVersion) > 0 ? Number(query.recoverVersion) : undefined}
              recoveryOperation={query.recoverOperation === "save" || query.recoverOperation === "transition" ? query.recoverOperation : undefined}
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
            view !== "COUNT" &&
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
                      date: getISTDateString(),
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
/**
 * @cc [owner:nareshshah139,label:product] reconciliation-today-cards
 * Today MUST remind, never block: the signed-in counter's count due, an approver's queue with its
 * net value, and a cycle that is short or behind for whoever configures it.
 */
const due = ({ counts, documentId }: NonNullable<ReconciliationCards["due"]>) =>
  documentId ? "Open your count and sign off when every batch is counted." : `${counts} lists to count. Sign off each one when every batch is counted.`;
export function reconciliationRows(cards: ReconciliationCards | null) {
  if (!cards) return [];
  const counts = { area: "stock", view: "COUNT" };
  return [
    ...(cards.due ? [{
      label: "Stock count due today",
      count: cards.due.items,
      detail: due(cards.due),
      note: due(cards.due),
      target: cards.due.documentId ? { ...counts, document: cards.due.documentId } : counts,
    }] : []),
    ...(cards.approvals?.count ? [{
      label: "Counts awaiting your approval",
      count: cards.approvals.count,
      detail: `${splitText(cards.approvals)}. Stock changes only when you approve.`,
      note: <><Split figures={cards.approvals} />. Stock changes only when you approve.</>,
      target: { ...counts, tab: "approvals" },
    }] : []),
    ...(cards.behind ? [{
      label: "Batches not counted this cycle",
      count: cards.behind.remaining,
      detail: cards.behind.message,
      note: cards.behind.message,
      target: { ...counts, tab: "settings" },
    }] : []),
  ];
}
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
    ...(data?.pendingEdits != null ? [{
      label: `Price/stock edits awaiting approval (${data.pendingEdits})`,
      count: data.pendingEdits,
      detail: "Review the reason and proposed changes before updating clinic stock.",
      target: { area: "stock", view: "approvals" },
    }] : []),
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
      count: data?.pendingPurchase || 0,
      detail:
        "Open the invoice, resolve highlighted checks and confirm stock status.",
      target: { area: "purchases", view: "register", pay: "NOT_POSTED" },
    },
    {
      label: "Original files awaiting intake",
      count: data?.unlinked || 0,
      detail: "Continue from a retained photo or PDF.",
      target: { area: "purchases", view: "intake" },
    },
    ...reconciliationRows(data?.reconciliation ?? null),
    ...(data?.creditNotesAwaited != null
      ? [
          {
            label: "Credit notes awaited",
            count: data.creditNotesAwaited,
            detail: "Record the distributor’s credit note when it arrives.",
            target: { area: "purchases", view: "register", tab: "returns", state: "AWAITED" },
          },
        ]
      : []),
    {
      label: "Orders awaiting receipt",
      count: queue("PURCHASE_ORDER"),
      detail: "Receive the actual batches against the approved order.",
      target: { area: "reorder", view: "PURCHASE_ORDER", status: "OPEN" },
    },
  ];
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap gap-3" aria-label="Everyday inventory tasks">
        <Button onClick={() => navigate({ area: "purchases", view: "intake" })}><Plus className="h-4 w-4" /> Scan or enter bill</Button>
        <Button variant="outline" onClick={() => navigate({ area: "stock", view: "list" })}>Find or correct stock <ArrowRight className="h-4 w-4" /></Button>
      </div>
      <header>
        <h2 className="text-2xl font-semibold">What needs attention</h2>
        <p className="text-muted-foreground">
          Every action opens the matching records.{" "}
          {data && `As of ${displayClinicDate(data.asOf)} · current branch`}
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
          <LoadingSkeleton variant="cards" label="Loading branch queues…" />
        )
      ) : (
        <>
          <ul className="divide-y border-y">
            {rows.map((r) => (
              <li key={r.label}>
                <button
                  className="flex w-full items-center gap-4 py-4 text-left hover:bg-muted/50"
                  title={r.detail}
                  onClick={() => navigate(r.target)}
                >
                  <span className="min-w-10 text-2xl font-semibold">
                    {r.count ?? "—"}
                  </span>
                  <span className="flex-1">
                    <strong>{r.label}</strong>
                    {"note" in r && r.note && <span className="mt-0.5 block text-sm">{r.note}</span>}
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
function WorkflowRegister({
  kind,
  query,
  navigate,
  capabilities,
  onNew,
  onOpen,
  onReceive,
}: any) {
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const definition = workflowKinds[kind];
  const q = new URLSearchParams({
    kind, page: query.page || "1",
    ...(query.status ? { status: query.status } : {}),
    ...Object.fromEntries(["search", "from", "to", "gstin", "sourceId"].filter(k => query[k]).map(k => [k, query[k]])),
  });
  const { data, error: readError, status, reload: load } = useInventoryResource<any>("/inventory/workspace/documents?" + q);
  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const path = kind === "SHORTBOOK" ? "shortbook/refresh" : "targets/propose";
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
      {query.sourceId && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          Showing records linked to the selected source document.
          <Button variant="outline" onClick={() => navigate({ sourceId: "", page: "1" })}>Show all records</Button>
        </p>
      )}
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{definition.label}</h2>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            {definition.help}
          </p>
        </div>
        {capabilities?.kinds?.[kind]?.write && (
          <div className="flex flex-wrap gap-2">
            {["SHORTBOOK", "TARGET_REVIEW"].includes(kind) && (
              <Button disabled={busy} onClick={generate}>
                {kind === "SHORTBOOK" ? "Add low-stock demand" : "Generate target proposal"}
              </Button>
            )}
            {!["TARGET_REVIEW", "CORRECTION"].includes(kind) && (
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
      {readError && <div role="alert"><p>{readError}</p><Button variant="outline" onClick={() => void load()}>Retry records</Button></div>}
      {status === "loading" && <p role="status">Loading records…</p>}
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
                {displayClinicDate(d.createdAt)} · {d.payload.lines.length} lines ·{" "}
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
            No {definition.label.toLowerCase()} match these filters.
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
        <span className="text-sm">{data ? `${data.total} records` : status === "error" ? "Records unavailable" : "Loading…"}</span>
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
  const [selected, setSelected] = useState<any>(null), [error, setError] = useState("");
  const { data: rows, error: readError, status, reload: load } = useInventoryResource<any[]>("/inventory/workspace/suppliers");
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
      {readError && <div role="alert"><p>{readError}</p><Button variant="outline" onClick={() => void load()}>Retry suppliers</Button></div>}
      {status === "loading" && <p role="status">Loading suppliers…</p>}
      {rows && !rows.length && <p className="py-4 text-muted-foreground">No suppliers yet.{canCreate ? " Add a supplier to start recording purchases." : " Ask an administrator to add a supplier."}</p>}
      {selected && (
        <form
          className="space-y-4 border-y py-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
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
        {rows?.map((s) => (
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
              <InventoryAction label={`Edit supplier ${s.name}`} onClick={() => setSelected(s)}>
                <Pencil className="h-4 w-4" />
              </InventoryAction>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function MovedReport({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [href, router]);
  return (
    <p className="text-base">
      This report is now under <Link href={href} className="font-medium underline">Pharmacy Report</Link>. Opening it…
    </p>
  );
}
