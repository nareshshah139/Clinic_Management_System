"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  History,
  List,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { inputClass } from "./workspace-model";

const movementTypes = {
  PURCHASE: "Purchase",
  SALE: "Sale",
  RETURN: "Return",
  ADJUSTMENT: "Adjustment",
  TRANSFER: "Transfer",
  EXPIRED: "Expired stock",
  DAMAGED: "Damaged stock",
};

export interface StockMovementEntry {
  id: string;
  itemId: string;
  itemName: string;
  batchNumber: string | null;
  unit: string;
  type: keyof typeof movementTypes;
  quantity: number;
  delta: number | null;
  reference: string | null;
  reason: string | null;
  actorName: string;
  createdAt: string;
}

interface StockMovementPage {
  rows: StockMovementEntry[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface MovementFilters {
  search: string;
  type: string;
  dateFrom: string;
  dateTo: string;
}
const emptyFilters: MovementFilters = {
  search: "",
  type: "",
  dateFrom: "",
  dateTo: "",
};
type MovementState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: StockMovementPage };
const timestamp = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
const unitLabel = (value: string) => value.toLowerCase().replaceAll("_", " ");

/**
 * @cc [owner:nareshshah139] truthful-movement-history
 * Timeline and ledger MUST show the same filtered, paginated server movements.
 */
/**
 * @cc [owner:nareshshah139] honest-movement-balances
 * Unknown directions MUST remain explicit, and this view MUST NOT invent running balances.
 */
/**
 * @cc [owner:nareshshah139] current-movement-response
 * A failed or superseded request MUST NOT display stale rows as the active result.
 */
/**
 * @cc [owner:nareshshah139] movement-route-state
 * Applied search, type, dates, page and layout MUST live in the URL and restore after
 * batch-detail navigation, in-app Back, browser back and reload.
 */
export function InventoryMovements({
  onBatch,
  query,
  navigate,
}: {
  onBatch: (id: string) => void;
  query: Record<string, string>;
  navigate: (changes: Record<string, string>) => void;
}) {
  const view = query.historyLayout === "ledger" ? "ledger" : "timeline";
  const filters = useMemo<MovementFilters>(
    () => ({
      search: query.historySearch || "",
      type: query.historyType || "",
      dateFrom: query.historyFrom || "",
      dateTo: query.historyTo || "",
    }),
    [
      query.historySearch,
      query.historyType,
      query.historyFrom,
      query.historyTo,
    ],
  );
  const requestedPage = Number(query.historyPage || 1);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  const [draft, setDraft] = useState<MovementFilters>(filters);
  const navigateRef = useRef(navigate);
  const [refresh, setRefresh] = useState(0);
  const [validation, setValidation] = useState("");
  const [state, setState] = useState<MovementState>({ status: "loading" });

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);
  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    let dateFrom: string | undefined, dateTo: string | undefined;
    try {
      dateFrom = dateBoundary(filters.dateFrom, false);
      dateTo = dateBoundary(filters.dateTo, true);
    } catch {
      setState({
        status: "error",
        message: "Choose valid dates for stock history.",
      });
      return;
    }
    apiClient
      .get<StockMovementPage>("/inventory/workspace/movements", {
        search: filters.search,
        type: filters.type,
        page,
        limit: 30,
        dateFrom,
        dateTo,
      })
      .then((data) => {
        if (!current) return;
        if (page > Math.max(1, data.totalPages)) {
          navigateRef.current({
            historyPage: String(Math.max(1, data.totalPages)),
          });
          return;
        }
        setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (current)
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load stock history.",
          });
      });
    return () => {
      current = false;
    };
  }, [filters, page, refresh]);

  useEffect(() => {
    const reload = () => setRefresh((value) => value + 1);
    window.addEventListener("inventory-stock-refresh", reload);
    return () => window.removeEventListener("inventory-stock-refresh", reload);
  }, []);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    if (draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo) {
      setValidation("Start date must be on or before end date.");
      return;
    }
    setValidation("");
    navigate({
      historySearch: draft.search.trim(),
      historyType: draft.type,
      historyFrom: draft.dateFrom,
      historyTo: draft.dateTo,
      historyPage: "1",
    });
  }

  const hasFilters = Object.values(filters).some(Boolean);
  const result = state.status === "ready" ? state.data : null;
  const groups = new Map<string, StockMovementEntry[]>();
  for (const movement of result?.rows ?? []) {
    const day = new Date(movement.createdAt).toLocaleDateString("en-IN", {
      dateStyle: "full",
    });
    groups.set(day, [...(groups.get(day) ?? []), movement]);
  }

  return (
    <section aria-label="Stock history" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Stock history</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Follow recorded stock movements across your inventory. Open a
            medicine to inspect its batch balance and reconciled ledger.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div
            role="group"
            aria-label="History layout"
            className="flex gap-1 rounded-lg border p-1"
          >
            <Button
              variant={view === "timeline" ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={view === "timeline"}
              onClick={() => navigate({ historyLayout: "timeline" })}
            >
              <History className="mr-2 h-4 w-4" aria-hidden="true" />
              Timeline
            </Button>
            <Button
              variant={view === "ledger" ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={view === "ledger"}
              onClick={() => navigate({ historyLayout: "ledger" })}
            >
              <List className="mr-2 h-4 w-4" aria-hidden="true" />
              Ledger
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={() => setRefresh((value) => value + 1)}
            disabled={state.status === "loading"}
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </div>

      <form onSubmit={applyFilters} className="space-y-3 rounded-lg border p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-sm font-medium">
            Medicine, batch or reference
            <input
              className={inputClass}
              value={draft.search}
              maxLength={200}
              placeholder="Search stock movements"
              onChange={(event) =>
                setDraft({ ...draft, search: event.target.value })
              }
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Movement type
            <select
              className={inputClass}
              value={draft.type}
              onChange={(event) =>
                setDraft({ ...draft, type: event.target.value })
              }
            >
              <option value="">All movements</option>
              {Object.entries(movementTypes).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">
            From date
            <input
              className={inputClass}
              type="date"
              value={draft.dateFrom}
              onChange={(event) =>
                setDraft({ ...draft, dateFrom: event.target.value })
              }
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            To date
            <input
              className={inputClass}
              type="date"
              value={draft.dateTo}
              onChange={(event) =>
                setDraft({ ...draft, dateTo: event.target.value })
              }
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit">Apply filters</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft(emptyFilters);
              navigate({
                historySearch: "",
                historyType: "",
                historyFrom: "",
                historyTo: "",
                historyPage: "1",
              });
              setValidation("");
            }}
          >
            Clear filters
          </Button>
          <p className="text-xs text-muted-foreground">
            Dates and times use your device timezone.
          </p>
        </div>
        {validation && (
          <p role="alert" className="text-sm text-destructive">
            {validation}
          </p>
        )}
      </form>

      {state.status === "loading" && (
        <p role="status" className="py-12 text-center text-muted-foreground">
          Loading stock history…
        </p>
      )}
      {state.status === "error" && (
        <div role="alert" className="space-y-3 rounded-lg border p-6">
          <p>{state.message}</p>
          <Button
            variant="outline"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Retry history
          </Button>
        </div>
      )}
      {result && result.rows.length === 0 && (
        <div className="space-y-2 py-12 text-center">
          <h3 className="font-semibold">
            {hasFilters
              ? "No movements match these filters"
              : "No stock movements recorded yet"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {hasFilters
              ? "Try another medicine, movement type or date range."
              : "Purchases, sales and stock corrections will appear here when posted."}
          </p>
        </div>
      )}

      {result && result.rows.length > 0 && (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            {result.total.toLocaleString("en-IN")} recorded{" "}
            {result.total === 1 ? "movement" : "movements"} · Newest first
          </p>
          {view === "timeline" ? (
            <div className="space-y-7">
              {[...groups].map(([day, movements]) => (
                <section key={day} aria-label={day}>
                  <h3 className="mb-3 text-sm font-semibold">{day}</h3>
                  <ol className="ml-3 border-l pl-6">
                    {movements.map((movement) => (
                      <li
                        key={movement.id}
                        className="relative border-b py-4 last:border-0"
                      >
                        <span
                          aria-hidden="true"
                          className="absolute -left-[31px] top-5 h-3 w-3 rounded-full border-2 border-background bg-primary"
                        />
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <button
                              onClick={() => onBatch(movement.itemId)}
                              className="text-left font-semibold text-primary underline-offset-4 hover:underline focus-visible:underline"
                            >
                              {movement.itemName}
                            </button>
                            <p className="mt-1 text-sm">
                              {movementTypes[movement.type]} · Batch{" "}
                              {movement.batchNumber || "not recorded"}
                            </p>
                            <p className="mt-1 break-words text-xs text-muted-foreground">
                              <time dateTime={movement.createdAt}>
                                {timestamp(movement.createdAt)}
                              </time>
                              {movement.actorName && ` · ${movement.actorName}`}
                            </p>
                            {(movement.reference || movement.reason) && (
                              <p className="mt-2 break-words text-sm text-muted-foreground">
                                {[movement.reference, movement.reason]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            )}
                          </div>
                          <MovementQuantity movement={movement} />
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          ) : (
            <div
              className="overflow-x-auto rounded-lg border"
              tabIndex={0}
              aria-label="Scrollable stock movement ledger"
            >
              <table className="w-full min-w-[880px] text-sm">
                <caption className="sr-only">
                  Recorded stock movements, newest first. Quantities use each
                  batch's stock unit.
                </caption>
                <thead className="bg-muted/50 text-left">
                  <tr>
                    {[
                      "Date & time",
                      "Medicine / batch",
                      "Movement",
                      "Stock in",
                      "Stock out",
                      "Reference / reason",
                      "Recorded by",
                    ].map((label) => (
                      <th key={label} scope="col" className="p-3 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((movement) => (
                    <tr key={movement.id} className="border-t align-top">
                      <td className="whitespace-nowrap p-3">
                        <time dateTime={movement.createdAt}>
                          {timestamp(movement.createdAt)}
                        </time>
                      </td>
                      <td className="max-w-64 p-3">
                        <button
                          onClick={() => onBatch(movement.itemId)}
                          className="text-left font-medium text-primary underline-offset-4 hover:underline focus-visible:underline"
                        >
                          {movement.itemName}
                        </button>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Batch {movement.batchNumber || "not recorded"} ·{" "}
                          {unitLabel(movement.unit)}
                        </p>
                      </td>
                      <td className="p-3">
                        {movementTypes[movement.type]}
                        {movement.delta === null && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Direction unknown · {movement.quantity} recorded
                          </p>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {movement.delta === null
                          ? "Unknown"
                          : Math.max(0, movement.delta).toLocaleString("en-IN")}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {movement.delta === null
                          ? "Unknown"
                          : Math.max(0, -movement.delta).toLocaleString(
                              "en-IN",
                            )}
                      </td>
                      <td className="max-w-64 break-words p-3">
                        {movement.reference || "No reference"}
                        {movement.reason && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {movement.reason}
                          </p>
                        )}
                      </td>
                      <td className="p-3">
                        {movement.actorName || "Not recorded"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav
            aria-label="Stock history pages"
            className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
          >
            <p className="text-sm text-muted-foreground">
              Page {result.page} of {Math.max(1, result.totalPages)} · Showing{" "}
              {(result.page - 1) * result.limit + 1}–
              {(result.page - 1) * result.limit + result.rows.length}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => navigate({ historyPage: String(page - 1) })}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={page >= result.totalPages}
                onClick={() => navigate({ historyPage: String(page + 1) })}
              >
                Next
              </Button>
            </div>
          </nav>
        </>
      )}
    </section>
  );
}

function dateBoundary(value: string, end: boolean): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00"}`);
  const [year, month, day] = value.split("-").map(Number);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day
  ) {
    throw new Error("Invalid history date");
  }
  return date.toISOString();
}

function MovementQuantity({ movement }: { movement: StockMovementEntry }) {
  if (movement.delta === null)
    return (
      <p className="text-right text-sm">
        <span className="font-medium">Direction unknown</span>
        <br />
        <span className="text-xs text-muted-foreground">
          {movement.quantity} {unitLabel(movement.unit)} recorded
        </span>
      </p>
    );
  const incoming = movement.delta >= 0;
  const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
  return (
    <p className="flex items-center gap-1 whitespace-nowrap text-sm font-semibold tabular-nums">
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>
        {incoming ? "+" : ""}
        {movement.delta.toLocaleString("en-IN")} {unitLabel(movement.unit)}
        <span className="sr-only"> {incoming ? "stock in" : "stock out"}</span>
      </span>
    </p>
  );
}
