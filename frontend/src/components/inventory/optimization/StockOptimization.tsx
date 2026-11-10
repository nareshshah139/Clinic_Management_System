"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PackageOpen, Play } from "lucide-react";
import { apiClient } from "@/lib/api";
import { formatRupees } from "@/lib/pharmacy-invoice-print";
import { displayClinicDateTime } from "@/lib/date-display";
import { Button } from "@/components/ui/button";
import { InventoryHelp } from "../InventoryPresentation";
import { inputClass, requestKey } from "../workspace-model";
import {
  ddmmyyyy,
  lastSoldText,
  shelfLifeText,
  shelfLifeTone,
  type DistributorGroup,
  type OptimizationRow,
  type OptimizationRules,
  type OptimizationRun,
} from "./stock-optimization-model";

type Props = {
  canWrite: boolean;
  ran: boolean;
  onRan: () => void;
  onDocument: (kind: string, id: string) => void;
  onReturns: () => void;
};

const batches = (n: number) => `${n} ${n === 1 ? "batch" : "batches"}`;
const gst = (rate: number | null) => (rate === null ? "GST not set" : `${rate}%`);
const STATUS: Record<string, string> = { DRAFT: "Draft", AWAITING_APPROVAL: "Awaiting approval", APPROVED: "Approved" };

function RulesPanel({ canWrite, onSaved }: { canWrite: boolean; onSaved: () => void }) {
  const [rules, setRules] = useState<OptimizationRules | null>(null);
  const [form, setForm] = useState({ nonMovingDays: "", minimumBatchValue: "" });
  const [state, setState] = useState<{ busy: boolean; error: string; notice: string }>({ busy: false, error: "", notice: "" });
  const load = useCallback(async () => {
    const loaded = await apiClient.get<OptimizationRules>("/inventory/workspace/optimization/rules");
    setRules(loaded);
    setForm({ nonMovingDays: String(loaded.nonMovingDays), minimumBatchValue: String(loaded.minimumBatchValue) });
  }, []);
  useEffect(() => {
    load().catch((e: any) => setState((s) => ({ ...s, error: e.message })));
  }, [load]);
  const changed = rules && (form.nonMovingDays !== String(rules.nonMovingDays) || form.minimumBatchValue !== String(rules.minimumBatchValue));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rules) return;
    setState({ busy: true, error: "", notice: "" });
    try {
      const saved = await apiClient.patch<OptimizationRules>("/inventory/workspace/optimization/rules", {
        nonMovingDays: form.nonMovingDays,
        minimumBatchValue: form.minimumBatchValue,
        version: rules.version,
      });
      setRules(saved);
      setForm({ nonMovingDays: String(saved.nonMovingDays), minimumBatchValue: String(saved.minimumBatchValue) });
      setState({ busy: false, error: "", notice: `Saved: ${saved.nonMovingDays} non-moving days, minimum ${formatRupees(saved.minimumBatchValue)}.` });
      onSaved();
    } catch (e: any) {
      setState({ busy: false, error: e.message, notice: "" });
      if (e.status === 409) await load().catch(() => undefined);
    }
  };
  return (
    <form onSubmit={save} aria-label="Optimization rules" className="space-y-3 rounded-lg border bg-muted/40 p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold">Rules</h3>
        <InventoryHelp label="Optimization rules">
          Saved for this branch. Anyone who can raise a supplier return can change them.
        </InventoryHelp>
      </div>
      <div className="grid gap-3 sm:grid-cols-[repeat(2,minmax(0,16rem))_auto] sm:items-end">
        <div className="text-sm">
          <label htmlFor="non-moving-days" className="mb-1 block font-medium">Non-moving days</label>
          <input id="non-moving-days" className={inputClass} inputMode="numeric" disabled={!canWrite || !rules} value={form.nonMovingDays}
            onChange={(e) => setForm({ ...form, nonMovingDays: e.target.value })} aria-describedby="non-moving-help" />
          <p id="non-moving-help" className="mt-1 text-muted-foreground">Flag stock not sold for this many days.</p>
        </div>
        <div className="text-sm">
          <label htmlFor="minimum-batch-value" className="mb-1 block font-medium">Minimum batch value (₹)</label>
          <input id="minimum-batch-value" className={inputClass} inputMode="decimal" disabled={!canWrite || !rules} value={form.minimumBatchValue}
            onChange={(e) => setForm({ ...form, minimumBatchValue: e.target.value })} aria-describedby="minimum-help" />
          <p id="minimum-help" className="mt-1 text-muted-foreground">Below this, a return costs more than it recovers.</p>
        </div>
        {canWrite && (
          <Button type="submit" variant="outline" className="sm:mb-6" disabled={!changed || state.busy}>
            {state.busy ? "Saving…" : "Save rules"}
          </Button>
        )}
      </div>
      {!canWrite && <p className="text-sm text-muted-foreground">Ask someone who raises supplier returns to change these.</p>}
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state.notice && <p role="status" className="text-sm">{state.notice}</p>}
    </form>
  );
}

function Rows({ rows, returnable }: { rows: OptimizationRow[]; returnable: boolean }) {
  return (
    <>
      <table className="hidden w-full text-sm md:table" aria-label={returnable ? "Returnable batches" : "Non-returnable batches"}>
        <thead className="text-left text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="py-2 pr-3 font-medium">Item · batch</th>
            <th scope="col" className="py-2 pr-3 font-medium">Shelf life left</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Qty</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">PTR</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">GST</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Value at PTR</th>
            <th scope="col" className="py-2 font-medium">{returnable ? "Bought on" : "Movement"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.inventoryId}:${row.source?.lineId ?? "kept"}`} className="border-b last:border-0 align-top">
              <td className="py-2 pr-3">
                <span className="font-medium">{row.name}</span>
                <span className="block text-muted-foreground">Batch {row.batchNumber || "not recorded"} · exp {ddmmyyyy(row.expiryDate)}</span>
                {row.openReturn && <span className="block text-sm">On return {row.openReturn.reference} ({STATUS[row.openReturn.status] ?? row.openReturn.status})</span>}
              </td>
              <td className={`py-2 pr-3 ${shelfLifeTone(row.shelfLifeDays)}`}>{shelfLifeText(row.shelfLifeDays)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{row.quantity}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatRupees(row.ptr)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{gst(row.gstRate)}</td>
              <td className="py-2 pr-3 text-right font-medium tabular-nums">{formatRupees(row.value)}</td>
              <td className="py-2 text-muted-foreground">
                {row.source ? <>Bill {row.source.invoiceNumber} · {ddmmyyyy(row.source.invoiceDate)}</> : null}
                <span className="block">{lastSoldText(row)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="space-y-2 md:hidden" aria-label={returnable ? "Returnable batches" : "Non-returnable batches"}>
        {rows.map((row) => (
          <li key={`${row.inventoryId}:${row.source?.lineId ?? "kept"}`} className="rounded-md border p-3 text-sm">
            <p className="font-medium">{row.name}</p>
            <p className="text-muted-foreground">Batch {row.batchNumber || "not recorded"} · exp {ddmmyyyy(row.expiryDate)}</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt>Shelf life left</dt><dd className={`text-right ${shelfLifeTone(row.shelfLifeDays)}`}>{shelfLifeText(row.shelfLifeDays)}</dd>
              <dt>Qty × PTR</dt><dd className="text-right tabular-nums">{row.quantity} × {formatRupees(row.ptr)}</dd>
              <dt>GST</dt><dd className="text-right tabular-nums">{gst(row.gstRate)}</dd>
              <dt className="font-medium">Value at PTR</dt><dd className="text-right font-medium tabular-nums">{formatRupees(row.value)}</dd>
            </dl>
            <p className="mt-2 text-muted-foreground">
              {row.source ? `Bill ${row.source.invoiceNumber} · ${ddmmyyyy(row.source.invoiceDate)} · ` : ""}{lastSoldText(row)}
            </p>
            {row.openReturn && <p className="mt-1">On return {row.openReturn.reference} ({STATUS[row.openReturn.status] ?? row.openReturn.status})</p>}
          </li>
        ))}
      </ul>
    </>
  );
}

function Group({ group, returnable, action }: { group: DistributorGroup; returnable: boolean; action?: React.ReactNode }) {
  return (
    <section aria-label={`${group.name} ${returnable ? "returnable" : "non-returnable"}`} className="space-y-3 rounded-lg border p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-base font-semibold">{group.name}</h4>
          <p className="text-sm text-muted-foreground">
            {group.gstin ? `GSTIN ${group.gstin} · ` : ""}{batches(group.rows.length)} · <span className="font-semibold text-foreground">{formatRupees(group.value)}</span> at PTR, excluding GST
          </p>
        </div>
        {action}
      </header>
      <Rows rows={group.rows} returnable={returnable} />
    </section>
  );
}

/**
 * @cc [owner:nareshshah139,label:product] stock-optimization-screen
 * Run optimization MUST show returnable and non-returnable slow stock grouped by distributor with
 * shelf life left on every row; a returnable group below the minimum MUST show its flag and no draft
 * button; one press of Create return draft MUST create at most one draft and link to it.
 */
export function StockOptimization({ canWrite, ran, onRan, onDocument, onReturns }: Props) {
  const [run, setRun] = useState<OptimizationRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drafting, setDrafting] = useState<string | null>(null);
  const [created, setCreated] = useState<{ gstin: string; id: string; reference: string } | null>(null);
  const keys = useRef(new Map<string, string>());
  const inFlight = useRef(false);
  const execute = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setRun(await apiClient.post<OptimizationRun>("/inventory/workspace/optimization/run"));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (ran) void execute();
  }, [ran, execute]);
  const start = () => {
    setCreated(null);
    if (ran) void execute();
    else onRan();
  };
  const draft = async (group: DistributorGroup) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const key = keys.current.get(group.gstin) ?? requestKey();
    keys.current.set(group.gstin, key);
    setDrafting(group.gstin);
    setError("");
    try {
      const doc = await apiClient.post<{ id: string; reference: string }>("/inventory/workspace/optimization/return-drafts", {
        distributorGstin: group.gstin,
        requestKey: key,
      });
      keys.current.delete(group.gstin);
      setCreated({ gstin: group.gstin, id: doc.id, reference: doc.reference });
      await execute();
    } catch (e: any) {
      setError(e.message);
    } finally {
      inFlight.current = false;
      setDrafting(null);
    }
  };
  const draftAction = (group: DistributorGroup) => {
    if (group.belowMinimum)
      return <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">{group.blocker}</p>;
    const open = group.openReturns ?? [];
    return (
      <div className="flex flex-col items-stretch gap-2 max-sm:w-full sm:items-end">
        {open.map((doc) => (
          <Button key={doc.id} type="button" variant="outline" onClick={() => onDocument("SUPPLIER_RETURN", doc.id)}>
            Open {doc.reference} ({STATUS[doc.status] ?? doc.status})
          </Button>
        ))}
        {group.draftable && canWrite ? (
          <Button type="button" disabled={drafting !== null} onClick={() => void draft(group)}>
            {drafting === group.gstin ? "Creating draft…" : open.length ? "Draft the remaining batches" : "Create return draft"}
          </Button>
        ) : group.blocker && !open.length ? (
          <p className="max-w-xs text-sm text-muted-foreground">{group.blocker}</p>
        ) : null}
      </div>
    );
  };
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl space-y-1">
          <h2 className="text-2xl font-semibold">Stock optimization</h2>
          <p className="text-sm text-muted-foreground">
            Finds stock that has not sold for a while. What was bought from a distributor in the last year can go back to them on a return draft; the rest stays here with its shelf life so you can discount it or use it in the clinic first.
          </p>
        </div>
        <Button type="button" onClick={start} disabled={busy}>
          <Play className="h-4 w-4" />
          {busy ? "Running…" : run ? "Run again" : "Run optimization"}
        </Button>
      </header>
      <RulesPanel canWrite={canWrite} onSaved={() => { if (run) void execute(); }} />
      {error && <p role="alert" className="rounded-md border border-destructive p-3 text-destructive">{error}</p>}
      {created && (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
          Return draft {created.reference} created with batch, PTR and GST filled in.
          <Button type="button" size="sm" variant="outline" onClick={() => onDocument("SUPPLIER_RETURN", created.id)}>Open draft</Button>
          <Button type="button" size="sm" variant="link" onClick={onReturns}>See it in Purchase bills › Returns</Button>
        </p>
      )}
      {!run && !busy && (
        <div className="flex items-center gap-3 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          <PackageOpen aria-hidden="true" className="h-6 w-6 shrink-0" />
          Run optimization to check every batch on the shelf against its sales and purchase bills.
        </div>
      )}
      {run && (
        <div aria-busy={busy} className="space-y-6">
          <p role="status" aria-live="polite" className="text-sm">
            Checked {batches(run.scanned)} on the shelf on {displayClinicDateTime(run.asOf)}: <strong>{batches(run.slow)}</strong> not sold for {run.rules.nonMovingDays} days.
            Returnable <strong>{formatRupees(run.totals.returnable)}</strong> · non-returnable <strong>{formatRupees(run.totals.nonReturnable)}</strong>, at PTR excluding GST.
          </p>
          <section aria-labelledby="returnable-heading" className="space-y-3">
            <h3 id="returnable-heading" className="text-lg font-semibold">Returnable · bought in the last {run.rules.returnWindowDays} days</h3>
            {run.returnable.length ? (
              run.returnable.map((group) => <Group key={group.gstin} group={group} returnable action={draftAction(group)} />)
            ) : (
              <p className="text-sm text-muted-foreground">Nothing slow-moving can go back to a distributor.</p>
            )}
          </section>
          <section aria-labelledby="kept-heading" className="space-y-3">
            <h3 id="kept-heading" className="text-lg font-semibold">Non-returnable · view only</h3>
            <p className="text-sm text-muted-foreground">No purchase from the distributor in the last year. Discount it, bundle it or use it in the clinic before it expires.</p>
            {run.nonReturnable.length ? (
              run.nonReturnable.map((group) => <Group key={group.gstin || "none"} group={group} returnable={false} />)
            ) : (
              <p className="text-sm text-muted-foreground">No slow stock is past its return window.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
