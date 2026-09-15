"use client";
import { useDashboardUser } from "@/components/layout/dashboard-user-context";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  FileDown,
  Printer,
  Loader2,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  workflowKinds,
  fmtMoney,
  fmtDate,
  labelStatus,
  requestKey,
  inputClass,
  downloadCsv,
} from "./workspace-model";

type Props = {
  kind: string;
  id?: string;
  draftKey?: string;
  initial?: any;
  capabilities: any;
  onBack: () => void;
  onOpen: (kind: string, id: string) => void;
  onInvoice: (receipt: any) => void;
};
/**
 * @cc [owner:nareshshah139,label:product;target] sales-batch-visible-before-confirm
 * Before a sale is confirmed, the operator MUST be able to verify the item, quantity unit,
 * allocated batch and expiry; insufficient or ineligible batch stock MUST prevent stock
 * deduction.
 * Acceptance: INV-24. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
/**
 * @cc [owner:nareshshah139,label:product;target] sales-draft-quotation-no-posting
 * Saving a sales draft or quotation MUST NOT be represented as a completed dispense or posted
 * stock movement; any reservation effect MUST be separately visible and reversible.
 * Acceptance: INV-25. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
/**
 * @cc [owner:nareshshah139,label:product;target] supplier-return-stage-effects
 * The supplier-return workflow MUST distinguish Draft, Challan and Return invoice and display
 * their stock and supplier-ledger effects; Challan-to-invoice conversion MUST NOT deduct stock a
 * second time.
 * Acceptance: INV-28. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
/**
 * @cc [owner:nareshshah139,label:product;target] inventory-shelf-blank-count-not-zero
 * A blank physical-count input MUST remain uncounted and MUST NOT be converted to a zero-stock
 * adjustment; invalid negative or unsupported fractional counts must fail before submission.
 * Acceptance: INV-31.2. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
/**
 * @cc [owner:nareshshah139,label:product;target] inventory-audit-blank-count-not-zero
 * A blank physical-count input MUST NOT be sent as zero; only explicitly entered valid counts may
 * be submitted for audit adjustment.
 * Acceptance: INV-31.2. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
export function WorkflowDocumentEditor({
  kind,
  id,
  draftKey,
  initial,
  capabilities,
  onBack,
  onOpen,
  onInvoice,
}: Props) {
  const { user } = useDashboardUser();
  const recoveryKey = `inventory-document:${user?.branchId}:${user?.id}:${kind}:${id || draftKey || "new"}:${initial?.purchaseInvoiceId || initial?.sourceId || ""}`;
  const [ready, setReady] = useState(false);
  const definition = workflowKinds[kind],
    [doc, setDoc] = useState<any>(null),
    [linkedSource, setLinkedSource] = useState<any>(null),
    [form, setForm] = useState<any>(() => ({
      kind,
      reference: `${kind.replaceAll("_", "-")}-${new Date().toISOString().slice(0, 10)}`,
      requestKey: requestKey(),
      supplierId: "",
      sourceId: "",
      payload: {
        date: new Date().toISOString().slice(0, 10),
        reason: "",
        lines: [],
        ...initial?.payload,
      },
      ...initial,
    }));
  const [suppliers, setSuppliers] = useState<any[]>([]),
    [search, setSearch] = useState(""),
    [matches, setMatches] = useState<any[]>([]),
    [sources, setSources] = useState<any[]>([]),
    [holds, setHolds] = useState<any[]>([]),
    [sales, setSales] = useState<any[]>([]),
    [saleSearch, setSaleSearch] = useState(""),
    [salePage, setSalePage] = useState(1),
    [salePages, setSalePages] = useState(1),
    [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [reversal, setReversal] = useState(""),
    [showReverse, setShowReverse] = useState(false);
  const lock = useRef(false),
    feedback = useRef<HTMLDivElement>(null);
  const canWrite = !!capabilities?.kinds?.[kind]?.write,
    editable = canWrite && (!doc || ["DRAFT", "CHALLAN"].includes(doc.status));
  const apply = (v: any) => {
    setDoc(v);
    setForm({
      kind: v.kind,
      reference: v.reference,
      requestKey: v.requestKey,
      supplierId: v.supplierId || "",
      sourceId: v.sourceId || "",
      purchaseInvoiceId: v.purchaseInvoiceId || undefined,
      salesInvoiceId: v.salesInvoiceId || undefined,
      version: v.version,
      payload: v.payload,
    });
    setSelected(v.payload.lines.map((l: any) => l.id));
  };
  useEffect(() => {
    let active = true;
    const initialise = async () => {
      let recovered: any = null;
      try {
        recovered = JSON.parse(sessionStorage.getItem(recoveryKey) || "null");
      } catch {
        setNotice(
          "Browser draft recovery is unavailable. Save the draft before leaving.",
        );
      }
      try {
        if (id) {
          const saved = await apiClient.get<any>(
            `/inventory/workspace/documents/${id}`,
          );
          if (!active) return;
          apply(saved);
          if (saved.sourceId)
            apiClient
              .get<any>(`/inventory/workspace/documents/${saved.sourceId}`)
              .then((v) => {
                if (active) setLinkedSource(v);
              })
              .catch((e: any) => setError(e.message));
          if (
            recovered?.version === saved.version &&
            ["DRAFT", "CHALLAN"].includes(saved.status)
          ) {
            setForm(recovered.form);
            setNotice("Restored unsaved edits from this tab.");
          }
        } else if (recovered?.form) {
          setForm(recovered.form);
          setNotice(
            "Restored this unfinished document. Stock has not changed.",
          );
        } else if (initial?.purchaseInvoiceId) {
          const invoice = await apiClient.get<any>(
            `/pharmacy/purchase-invoices/${initial.purchaseInvoiceId}`,
          );
          const suppliers = await apiClient.get<any[]>(
            "/inventory/workspace/suppliers",
          );
          if (!active) return;
          const supplier = suppliers.find(
            (v) => v.gstNumber === invoice.distributorGstin,
          );
          setForm((f: any) => ({
            ...f,
            purchaseInvoiceId: invoice.id,
            supplierId: supplier?.id || "",
            payload: {
              ...f.payload,
              reason: `Return against ${invoice.invoiceNumber}`,
              lines:
                kind === "CREDIT_NOTE"
                  ? [
                      {
                        id: requestKey(),
                        inventoryId: "",
                        name: "Price adjustment credit",
                        quantity: 1,
                        freeQuantity: 0,
                        unitPrice: 0,
                        gstRate: 0,
                      },
                    ]
                  : invoice.items.map((l: any) => ({
                      id: requestKey(),
                      inventoryId: l.inventoryItemId || "",
                      sourceLineId: l.id,
                      name: l.productName,
                      batchNumber: l.batchNumber,
                      unit: l.packUnitType,
                      quantity: l.quantityPurchased,
                      freeQuantity: l.freeQuantity,
                      unitPrice: l.purchaseRate,
                      mrp: l.mrp,
                      gstRate:
                        Number(l.cgstPercent) +
                        Number(l.sgstPercent) +
                        Number(l.igstPercent),
                    })),
            },
          }));
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        if (active) setReady(true);
      }
    };
    void initialise();
    if (capabilities?.itemRead || capabilities?.kinds?.[kind]?.read)
      apiClient
        .get<any[]>("/inventory/workspace/suppliers")
        .then((v) => {
          if (active) setSuppliers(v);
        })
        .catch(() => {});
    if (
      ["INWARD_CHALLAN", "GATE_PASS"].includes(kind) &&
      capabilities?.kinds?.PURCHASE_ORDER?.read
    )
      (async () => {
        let rows: any[] = [];
        for (let page = 1; ; page++) {
          const result = await apiClient.get<any>(
            `/inventory/workspace/documents?kind=PURCHASE_ORDER&status=OPEN&limit=100&page=${page}`,
          );
          rows.push(...result.rows);
          if (page >= result.totalPages) break;
        }
        if (active)
          setSources(
            rows.filter((d: any) =>
              ["APPROVED", "SENT", "PART_RECEIVED"].includes(d.status),
            ),
          );
      })().catch((e: any) => setError(e.message));
    if (["LOSS", "SUPPLIER_RETURN"].includes(kind))
      (async () => {
        const rows: any[] = [];
        for (let page = 1; ; page++) {
          const r = await apiClient.get<any>(
            `/inventory/workspace/hold-sources?page=${page}&limit=100`,
          );
          rows.push(...r.rows);
          if (page >= r.totalPages) break;
        }
        if (active) setHolds(rows);
      })().catch((e: any) => setError(e.message));
    return () => {
      active = false;
    };
  }, [id, recoveryKey]);
  useEffect(() => {
    if (!ready) return;
    try {
      if (editable)
        sessionStorage.setItem(
          recoveryKey,
          JSON.stringify({ version: doc?.version, form }),
        );
      else sessionStorage.removeItem(recoveryKey);
    } catch {
      setNotice(
        "Browser draft recovery is unavailable. Save the draft before leaving.",
      );
    }
  }, [ready, recoveryKey, form, editable, doc?.version]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (kind === "SALES_RETURN" || search.length < 2) {
        setMatches([]);
        return;
      }
      apiClient
        .get<any>(
          `/inventory/workspace/stock?search=${encodeURIComponent(search)}&limit=30${["COUNTER_SALE", "QUOTATION"].includes(kind) ? "&saleEligible=true&sortBy=expiryDate&sortOrder=asc" : ""}`,
        )
        .then((r) => {
          if (active)
            setMatches(
              r.rows.sort((a: any, b: any) =>
                (a.expiryDate || "9999").localeCompare(b.expiryDate || "9999"),
              ),
            );
        })
        .catch((e: any) => setError(e.message));
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search]);
  useEffect(() => {
    if (kind !== "SALES_RETURN") return;
    let active = true;
    const timer = setTimeout(() => {
      apiClient
        .get<any>(
          `/inventory/workspace/sale-movements?page=${salePage}&search=${encodeURIComponent(saleSearch)}`,
        )
        .then((r) => {
          if (active) {
            setSales((old) => (salePage === 1 ? r.rows : [...old, ...r.rows]));
            setSalePages(r.totalPages);
          }
        })
        .catch((e: any) => setError(e.message));
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [kind, saleSearch, salePage]);
  const payload = (key: string, value: any) =>
    setForm((f: any) => ({ ...f, payload: { ...f.payload, [key]: value } }));
  const updateLine = (index: number, key: string, value: any) =>
    setForm((f: any) => ({
      ...f,
      payload: {
        ...f.payload,
        lines: f.payload.lines.map((l: any, i: number) =>
          i === index ? { ...l, [key]: value } : l,
        ),
      },
    }));
  const add = (item: any, source?: any) => {
    payload("lines", [
      ...form.payload.lines,
      {
        id: requestKey(),
        inventoryId: item.id,
        name: item.name,
        batchNumber: item.batchNumber,
        unit: item.unit,
        expiryDate: item.expiryDate,
        quantity: 1,
        freeQuantity: 0,
        unitPrice:
          kind === "SALES_RETURN"
            ? (source?.saleTerms?.unitPrice ?? source?.unitPrice ?? 0)
            : ["COUNTER_SALE", "QUOTATION"].includes(kind)
              ? Math.round(
                  (item.sellingPrice / (1 + (item.gstRate || 0) / 100)) * 100,
                ) / 100
              : item.costPrice,
        mrp: item.mrp,
        gstRate:
          kind === "SALES_RETURN"
            ? source?.saleTerms?.gstRate || 0
            : item.gstRate || 0,
        discountPercent: source?.saleTerms?.discountPercent || 0,
        schemeAmount: source?.saleTerms?.schemePerUnit || 0,
        originalTerms: source?.saleTerms,
        disposition: "RESTOCK",
        sourceLineId: source?.id || "",
        location: item.storageLocation || "",
        available: item.available,
        systemStock: item.currentStock,
      },
    ]);
    setSearch("");
  };
  const perform = async (action?: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    let saved = doc;
    try {
      if (editable && action !== "CANCEL" && action !== "REVERSE") {
        saved = doc
          ? await apiClient.patch<any>(
              `/inventory/workspace/documents/${doc.id}`,
              { ...form, version: doc.version },
            )
          : await apiClient.post<any>("/inventory/workspace/documents", form);
        apply(saved);
      }
      if (action) {
        saved = await apiClient.post<any>(
          `/inventory/workspace/documents/${saved.id}/transition`,
          {
            version: saved.version,
            action,
            reason: reversal || form.payload.reason,
            ...(kind === "TARGET_REVIEW" ? { lineIds: selected } : {}),
          },
        );
        if (["CREATE_PO", "CONVERT_SALE"].includes(action)) {
          onOpen(saved.kind, saved.id);
          return;
        }
        apply(
          await apiClient.get(`/inventory/workspace/documents/${saved.id}`),
        );
      }
      if (saved?.id && !id) {
        sessionStorage.removeItem(recoveryKey);
        onOpen(saved.kind, saved.id);
      }
      window.dispatchEvent(new CustomEvent("inventory-workspace-refresh"));
      setNotice(
        action
          ? `Confirmed: ${labelStatus(saved.status)}. ${["DRAFT", "AWAITING_APPROVAL", "APPROVED"].includes(saved.status) ? "Stock has not changed." : kind === "GATE_PASS" ? "Delivery record saved; stock unchanged." : kind === "CREDIT_NOTE" ? "Supplier credit is available for allocation." : "The saved history below shows the exact stock effects."}`
          : "Draft saved. Stock and supplier balances have not changed.",
      );
    } catch (e: any) {
      setError(e.message);
      if (saved?.id) {
        try {
          const latest = await apiClient.get<any>(
            `/inventory/workspace/documents/${saved.id}`,
          );
          setDoc(latest);
          if (latest.status !== "DRAFT") apply(latest);
        } catch {
          setError(
            `${e.message} Current status could not be confirmed. Reload this record before retrying.`,
          );
        }
      }
    } finally {
      lock.current = false;
      setBusy(false);
      feedback.current?.focus();
    }
  };
  const primary = () => {
    if (!doc || doc.status === "DRAFT") {
      if (kind === "SUPPLIER_RETURN") return "CHALLAN";
      if (kind === "PURCHASE_ORDER") return "SUBMIT";
      if (kind === "SHORTBOOK") return "CREATE_PO";
      if (kind === "QUOTATION") return "CONVERT_SALE";
      if (kind === "TARGET_REVIEW") return "ACCEPT";
      return "POST";
    }
    if (doc.status === "CHALLAN") return "POST";
    if (doc.status === "AWAITING_APPROVAL")
      return capabilities?.approve ? "APPROVE" : null;
    if (doc.status === "APPROVED" && kind !== "PURCHASE_ORDER") return "POST";
    return null;
  };
  const action = primary();
  const primaryText =
    doc?.status === "CHALLAN"
      ? "Finalise supplier credit"
      : doc?.status === "AWAITING_APPROVAL"
        ? "Approve document"
        : definition.primary;
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const totals = form.payload.lines.reduce(
    (t: any, l: any) => {
      const taxable =
        l.originalTerms?.taxablePerUnit != null
          ? round(
              (Number(l.quantity || 0) + Number(l.freeQuantity || 0)) *
                l.originalTerms.taxablePerUnit,
            )
          : round(
              Number(l.quantity || 0) *
                Number(l.unitPrice || 0) *
                (1 - Number(l.discountPercent || 0) / 100) -
                Number(l.schemeAmount || 0),
            );
      return {
        taxable: round(t.taxable + taxable),
        tax: round(
          t.tax +
            (l.originalTerms?.taxPerUnit != null
              ? round(
                  (Number(l.quantity || 0) + Number(l.freeQuantity || 0)) *
                    l.originalTerms.taxPerUnit,
                )
              : round((taxable * Number(l.gstRate || 0)) / 100)),
        ),
      };
    },
    { taxable: 0, tax: 0 },
  );
  if (!ready) return <p role="status">Loading document…</p>;
  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background py-3 print:hidden">
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          <ArrowLeft className="h-4 w-4" />
          Back to {definition.label.toLowerCase()}
        </Button>
        <span role="status" className="text-sm font-semibold">
          {doc ? labelStatus(doc.status) : "Unsaved draft • no stock change"}
        </span>
        <div className="flex flex-wrap gap-2">
          {canWrite && editable && (
            <Button variant="outline" onClick={() => perform()} disabled={busy}>
              Save draft
            </Button>
          )}
          {canWrite && action && (
            <Button
              disabled={busy || (kind === "TARGET_REVIEW" && !selected.length)}
              onClick={() => perform(action)}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {primaryText}
            </Button>
          )}
        </div>
      </div>
      {linkedSource && (
        <Button
          variant="link"
          className="px-0"
          onClick={() => onOpen(linkedSource.kind, linkedSource.id)}
        >
          View linked {workflowKinds[linkedSource.kind]?.label.toLowerCase()}:{" "}
          {linkedSource.reference}
        </Button>
      )}
      <header>
        <h2 className="text-2xl font-semibold">
          {doc?.reference || definition.label}
        </h2>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          {definition.help}
        </p>
      </header>
      <div ref={feedback} tabIndex={-1} aria-live="polite">
        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive p-3 text-destructive"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-md border border-green-600 bg-green-50 p-3 text-green-900"
          >
            {notice}
          </p>
        )}
      </div>
      <fieldset
        disabled={!editable || !canWrite || busy}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="text-sm">
          Reference
          <input
            className={inputClass}
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Date
          <input
            type="date"
            className={inputClass}
            value={form.payload.date}
            onChange={(e) => payload("date", e.target.value)}
          />
        </label>
        {[
          "SUPPLIER_RETURN",
          "INWARD_CHALLAN",
          "GATE_PASS",
          "PURCHASE_ORDER",
          "SHORTBOOK",
          "CREDIT_NOTE",
        ].includes(kind) && (
          <label className="text-sm">
            Supplier
            <select
              className={inputClass}
              value={form.supplierId}
              onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
            >
              <option value="">Select supplier</option>
              {suppliers
                .filter((s) => s.isActive)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.gstNumber || "GSTIN missing"}
                  </option>
                ))}
            </select>
          </label>
        )}
        {["INWARD_CHALLAN", "GATE_PASS"].includes(kind) && (
          <label className="text-sm">
            Approved purchase order
            <select
              className={inputClass}
              value={form.sourceId}
              onChange={(e) => {
                const source = sources.find((s) => s.id === e.target.value);
                setForm({
                  ...form,
                  sourceId: e.target.value,
                  supplierId: source?.supplierId || form.supplierId,
                });
              }}
            >
              <option value="">No order linked</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.reference}
                </option>
              ))}
            </select>
          </label>
        )}
        {["LOSS", "SUPPLIER_RETURN"].includes(kind) && (
          <label className="text-sm">
            Use held stock from
            <select
              className={inputClass}
              value={form.payload.sourceHoldId || ""}
              onChange={(e) => payload("sourceHoldId", e.target.value)}
            >
              <option value="">Available stock (no hold)</option>
              {holds.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.reference} · {workflowKinds[h.kind]?.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {["COUNTER_SALE", "QUOTATION", "SALES_RETURN"].includes(kind) && (
          <>
            <label className="text-sm">
              Customer name (optional)
              <input
                className={inputClass}
                value={form.payload.customerName || ""}
                placeholder="Walk-in customer"
                onChange={(e) => payload("customerName", e.target.value)}
              />
            </label>
            <label className="text-sm">
              Phone (optional)
              <input
                className={inputClass}
                value={form.payload.customerPhone || ""}
                onChange={(e) => payload("customerPhone", e.target.value)}
              />
            </label>
            <label className="text-sm">
              Payment / refund method
              <select
                className={inputClass}
                value={
                  (kind === "SALES_RETURN"
                    ? form.payload.refundMode
                    : form.payload.paymentMode) ||
                  (kind === "SALES_RETURN" ? "CREDIT" : "CASH")
                }
                onChange={(e) =>
                  payload(
                    kind === "SALES_RETURN" ? "refundMode" : "paymentMode",
                    e.target.value,
                  )
                }
              >
                {["CASH", "UPI", "CARD", "CREDIT"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          </>
        )}
        {["COUNTER_SALE", "QUOTATION"].includes(kind) && (
          <>
            <label className="text-sm">
              Doctor (optional)
              <input
                className={inputClass}
                value={form.payload.doctorName || ""}
                onChange={(e) => payload("doctorName", e.target.value)}
              />
            </label>
            <label className="text-sm">
              Order type
              <select
                className={inputClass}
                value={form.payload.orderType || "PICKUP"}
                onChange={(e) => payload("orderType", e.target.value)}
              >
                <option value="PICKUP">Pickup</option>
                <option value="DELIVERY">Delivery</option>
                <option value="IN_CLINIC">In clinic</option>
              </select>
            </label>
          </>
        )}
        {kind === "SUPPLIER_RETURN" && (
          <>
            <label className="text-sm">
              Return type
              <select
                className={inputClass}
                value={form.payload.returnType || "OTHER"}
                onChange={(e) => payload("returnType", e.target.value)}
              >
                <option value="EXPIRY">Expired / near expiry</option>
                <option value="DAMAGE">Damage</option>
                <option value="EXCESS">Excess stock</option>
                <option value="OTHER">Other agreed return</option>
              </select>
            </label>
            <label className="text-sm">
              Return price basis
              <select
                className={inputClass}
                value={form.payload.returnBase || "PURCHASE_RATE"}
                onChange={(e) => payload("returnBase", e.target.value)}
              >
                <option value="PURCHASE_RATE">
                  Purchase rate per stock unit
                </option>
                <option value="AGREED_RATE">Agreed rate entered below</option>
              </select>
            </label>
          </>
        )}
        {kind === "QUOTATION" && (
          <label className="text-sm">
            Request source
            <select
              className={inputClass}
              value={form.payload.source || "MANUAL"}
              onChange={(e) => payload("source", e.target.value)}
            >
              <option value="MANUAL">Manual quotation</option>
              <option value="BOUNCE">Unfilled customer demand</option>
              <option value="REFILL">Requested refill</option>
            </select>
          </label>
        )}
        {["SHORTBOOK", "PURCHASE_ORDER", "QUOTATION"].includes(kind) && (
          <>
            <label className="text-sm">
              Expected date
              <input
                type="date"
                className={inputClass}
                value={form.payload.expectedDate || ""}
                onChange={(e) => payload("expectedDate", e.target.value)}
              />
            </label>
            <label className="text-sm">
              Priority
              <select
                className={inputClass}
                value={form.payload.priority || "NORMAL"}
                onChange={(e) => payload("priority", e.target.value)}
              >
                {["NORMAL", "HIGH", "URGENT"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          </>
        )}
        <label className="text-sm sm:col-span-2">
          Reason / delivery notes
          <input
            className={inputClass}
            value={form.payload.reason || ""}
            onChange={(e) => payload("reason", e.target.value)}
            placeholder={
              ["COUNT", "LOSS", "HOLD", "SALES_RETURN"].includes(kind)
                ? "Required before posting"
                : "Optional context"
            }
          />
        </label>
      </fieldset>
      {editable &&
        canWrite &&
        !["COUNT", "TARGET_REVIEW", "CORRECTION"].includes(kind) && (
          <section className="space-y-2 print:hidden">
            {kind === "SALES_RETURN" ? (
              <div className="space-y-2">
                <label className="block text-sm">
                  Search original sale
                  <input
                    className={inputClass}
                    value={saleSearch}
                    onChange={(e) => {
                      setSaleSearch(e.target.value);
                      setSalePage(1);
                    }}
                    placeholder="Sale reference, product, barcode or SKU"
                  />
                </label>
                <label className="block text-sm">
                  Add from original sale
                  <select
                    className={inputClass}
                    value=""
                    onChange={(e) => {
                      const sale = sales.find((s) => s.id === e.target.value);
                      if (sale) add(sale.item, sale);
                    }}
                  >
                    <option value="">
                      Select sold batch · remaining return quantity
                    </option>
                    {sales
                      .filter((s) => s.availableReturn > 0)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.reference} · {s.item.name} · {s.batchNumber} ·{" "}
                          {s.availableReturn} {s.item.unit}
                        </option>
                      ))}
                  </select>
                </label>
                {salePage < salePages && (
                  <Button
                    variant="outline"
                    onClick={() => setSalePage(salePage + 1)}
                  >
                    Load more original sales
                  </Button>
                )}
              </div>
            ) : kind === "CREDIT_NOTE" ? (
              <Button
                variant="outline"
                onClick={() =>
                  payload("lines", [
                    ...form.payload.lines,
                    {
                      id: requestKey(),
                      inventoryId: "",
                      name: "Supplier credit",
                      quantity: 1,
                      unitPrice: 0,
                      gstRate: 0,
                    },
                  ])
                }
              >
                <Plus className="h-4 w-4" />
                Add credit line
              </Button>
            ) : (
              <label className="block max-w-xl text-sm">
                Add a batch
                <input
                  className={inputClass}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search product, batch, barcode or SKU"
                />
              </label>
            )}
            {search.length >= 2 && (
              <ul className="max-h-64 overflow-y-auto divide-y rounded-md border">
                {matches.length ? (
                  matches.map((i) => (
                    <li key={i.id}>
                      <button
                        className="flex w-full flex-wrap justify-between gap-2 p-3 text-left text-sm hover:bg-muted"
                        onClick={() => add(i)}
                      >
                        <span>
                          <strong>{i.name}</strong> ·{" "}
                          {i.batchNumber || "No batch"} · expires{" "}
                          {fmtDate(i.expiryDate)}
                        </span>
                        <span>
                          {i.available} {i.unit} available ·{" "}
                          {fmtMoney(i.costPrice)}
                        </span>
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="p-3 text-sm">
                    No matching batch. Add the product/batch in Stock, then
                    return here.
                  </li>
                )}
              </ul>
            )}
          </section>
        )}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{definition.label} line items</caption>
          <thead className="bg-muted">
            <tr>
              {kind === "TARGET_REVIEW" && <th className="p-3">Accept</th>}
              <th className="p-3">Product & batch</th>
              {kind === "COUNT" ? (
                <>
                  <th className="p-3">System</th>
                  <th className="p-3">Physical count</th>
                  <th className="p-3">Difference</th>
                </>
              ) : kind === "TARGET_REVIEW" ? (
                <>
                  <th className="p-3">Saved min / max</th>
                  <th className="p-3">Proposed min</th>
                  <th className="p-3">Proposed max</th>
                </>
              ) : (
                <>
                  <th className="p-3">Quantity</th>
                  <th className="p-3">Free</th>
                  <th className="p-3">Rate excl. GST</th>
                  <th className="p-3">Discount %</th>
                  <th className="p-3">Scheme ₹</th>
                  <th className="p-3">GST %</th>
                  <th className="p-3">Total</th>
                </>
              )}
              {kind === "SALES_RETURN" && <th className="p-3">Disposition</th>}
              {kind === "INWARD_CHALLAN" && form.sourceId && (
                <th className="p-3">Order line</th>
              )}
              {editable && <th className="p-3 print:hidden">Remove</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {form.payload.lines.map((l: any, index: number) => (
              <tr key={l.id || index}>
                {kind === "TARGET_REVIEW" && (
                  <td className="p-3">
                    <input
                      type="checkbox"
                      aria-label={`Accept targets for ${l.name}`}
                      checked={selected.includes(l.id)}
                      disabled={!editable}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, l.id]
                            : selected.filter((id) => id !== l.id),
                        )
                      }
                    />
                  </td>
                )}
                <td className="min-w-52 p-3">
                  <strong>{l.name}</strong>
                  {kind === "COUNTER_SALE" && (
                    <label className="mt-2 block text-xs">
                      Batch-selection reason (if bypassing earlier expiry)
                      <input
                        className={inputClass}
                        value={l.fefoOverrideReason || ""}
                        disabled={!editable}
                        onChange={(e) =>
                          updateLine(
                            index,
                            "fefoOverrideReason",
                            e.target.value,
                          )
                        }
                      />
                    </label>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {l.batchNumber || "—"} · {l.unit || "Amount"}
                    {l.expiryDate && ` · ${fmtDate(l.expiryDate)}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    MRP {fmtMoney(l.mrp)} ·{" "}
                    {l.location || "Location not recorded"}
                    {l.available != null
                      ? ` · ${l.available} ${l.unit} available at selection`
                      : ""}
                  </p>
                </td>
                {kind === "COUNT" ? (
                  <>
                    <td className="p-3">
                      {l.systemStock} {l.unit}
                    </td>
                    <td className="p-3">
                      <input
                        aria-label={`Physical count ${index + 1}`}
                        className={`${inputClass} w-28`}
                        type="number"
                        min="0"
                        step="1"
                        placeholder="Not counted"
                        value={l.physicalStock ?? ""}
                        disabled={!editable || busy}
                        onChange={(e) =>
                          updateLine(
                            index,
                            "physicalStock",
                            e.target.value === "" ? "" : Number(e.target.value),
                          )
                        }
                      />
                    </td>
                    <td className="p-3">
                      {l.physicalStock == null || l.physicalStock === ""
                        ? "Not counted"
                        : Number(l.physicalStock) - l.systemStock}
                    </td>
                  </>
                ) : kind === "TARGET_REVIEW" ? (
                  <>
                    <td className="p-3">
                      {l.beforeMin ?? "—"} / {l.beforeMax ?? "—"}
                    </td>
                    {["minStockLevel", "maxStockLevel"].map((f) => (
                      <td key={f} className="p-3">
                        <input
                          className={`${inputClass} w-24`}
                          type="number"
                          min="0"
                          aria-label={`${f} ${index + 1}`}
                          value={l[f] ?? 0}
                          disabled={!editable || busy}
                          onChange={(e) =>
                            updateLine(index, f, Number(e.target.value))
                          }
                        />
                      </td>
                    ))}
                  </>
                ) : (
                  <>
                    {[
                      "quantity",
                      "freeQuantity",
                      "unitPrice",
                      "discountPercent",
                      "schemeAmount",
                      "gstRate",
                    ].map((f) => (
                      <td key={f} className="p-2">
                        <input
                          className={`${inputClass} w-24`}
                          type="number"
                          min="0"
                          step={
                            ["quantity", "freeQuantity"].includes(f) ? 1 : 0.01
                          }
                          aria-label={`${f} ${index + 1}`}
                          value={l[f] ?? 0}
                          disabled={
                            !editable ||
                            busy ||
                            (kind === "SALES_RETURN" &&
                              !["quantity", "freeQuantity"].includes(f))
                          }
                          onChange={(e) =>
                            updateLine(index, f, Number(e.target.value))
                          }
                        />
                      </td>
                    ))}
                    <td className="whitespace-nowrap p-3">
                      {fmtMoney(
                        !editable && l.total != null
                          ? l.total
                          : l.originalTerms?.taxablePerUnit != null
                            ? round(
                                (Number(l.quantity || 0) +
                                  Number(l.freeQuantity || 0)) *
                                  (l.originalTerms.taxablePerUnit +
                                    l.originalTerms.taxPerUnit),
                              )
                            : (Number(l.quantity) *
                                Number(l.unitPrice) *
                                (1 - Number(l.discountPercent || 0) / 100) -
                                Number(l.schemeAmount || 0)) *
                              (1 + Number(l.gstRate || 0) / 100),
                      )}
                    </td>
                  </>
                )}
                {kind === "SALES_RETURN" && (
                  <td className="p-3">
                    <select
                      className={`${inputClass} w-36`}
                      disabled={!editable}
                      value={l.disposition}
                      onChange={(e) =>
                        updateLine(index, "disposition", e.target.value)
                      }
                    >
                      <option value="RESTOCK">Restock</option>
                      <option value="QUARANTINE">Quarantine</option>
                      <option value="LOSS">Record as loss</option>
                    </select>
                  </td>
                )}
                {kind === "INWARD_CHALLAN" && form.sourceId && (
                  <td className="p-3">
                    <select
                      className={`${inputClass} w-44`}
                      disabled={!editable}
                      value={l.sourceLineId || ""}
                      onChange={(e) =>
                        updateLine(index, "sourceLineId", e.target.value)
                      }
                    >
                      <option value="">Match order line</option>
                      {sources
                        .find((s) => s.id === form.sourceId)
                        ?.payload.lines.map((s: any) => (
                          <option key={s.id} value={s.id}>
                            {s.name} · {s.quantity} {s.unit}
                          </option>
                        ))}
                    </select>
                  </td>
                )}
                {editable && (
                  <td className="p-3 print:hidden">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove line ${index + 1}`}
                      onClick={() =>
                        payload(
                          "lines",
                          form.payload.lines.filter(
                            (_: any, i: number) => i !== index,
                          ),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {!form.payload.lines.length && (
              <tr>
                <td
                  colSpan={12}
                  className="p-8 text-center text-muted-foreground"
                >
                  No lines yet. Add the batches above to begin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!["COUNT", "HOLD", "TARGET_REVIEW", "CORRECTION"].includes(kind) && (
        <p className="text-right text-lg">
          Taxable {fmtMoney(totals.taxable)}{" "}
          <span className="mx-3 text-muted-foreground">+</span> GST{" "}
          {fmtMoney(totals.tax)}{" "}
          <strong className="ml-5">
            Total{" "}
            {fmtMoney(
              !editable && doc ? doc.totalAmount : totals.taxable + totals.tax,
            )}
          </strong>
        </p>
      )}
      {doc && (
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv(`${doc.reference}.csv`, form.payload.lines)
            }
          >
            <FileDown className="h-4 w-4" />
            Export lines
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              window.open(
                `/api/inventory/workspace/labels/${doc.id}?document=true`,
                "_blank",
              )
            }
          >
            <Printer className="h-4 w-4" />
            Print QR label
          </Button>
          {["HOLD", "SALES_RETURN"].includes(kind) &&
            doc.status === "POSTED" &&
            doc.effects?.some((e: any) => e.heldDelta > 0) &&
            canWrite && (
              <Button onClick={() => perform("RELEASE")} disabled={busy}>
                Release held stock
              </Button>
            )}
          {kind === "INWARD_CHALLAN" && doc.status === "POSTED" && (
            <Button onClick={() => onInvoice(doc)}>
              Create linked purchase bill
            </Button>
          )}
          {["DRAFT", "AWAITING_APPROVAL", "APPROVED", "CHALLAN"].includes(
            doc.status,
          ) &&
            canWrite && (
              <Button
                variant="outline"
                onClick={() => perform("CANCEL")}
                disabled={busy}
              >
                {doc.status === "PART_RECEIVED"
                  ? "Cancel remaining order"
                  : "Cancel document"}
              </Button>
            )}
          {doc.status === "AWAITING_APPROVAL" && capabilities?.approve && (
            <Button
              variant="outline"
              onClick={() => perform("REJECT")}
              disabled={busy}
            >
              Reject proposal
            </Button>
          )}
          {(["POSTED", "CHALLAN"].includes(doc.status) ||
            (kind === "SALES_RETURN" && doc.status === "RELEASED")) &&
            capabilities?.approve &&
            !["CORRECTION", "TARGET_REVIEW"].includes(kind) && (
              <Button
                variant="outline"
                onClick={() => setShowReverse(!showReverse)}
              >
                Correct by reversal
              </Button>
            )}
        </div>
      )}
      {showReverse && (
        <div className="flex flex-wrap gap-3 rounded-md border p-4">
          <label className="min-w-64 flex-1 text-sm">
            Reversal reason
            <input
              className={inputClass}
              value={reversal}
              onChange={(e) => setReversal(e.target.value)}
            />
          </label>
          <Button
            className="self-end"
            disabled={!reversal.trim() || busy}
            onClick={() => perform("REVERSE")}
          >
            Reverse posted effects
          </Button>
        </div>
      )}
      {doc?.refundAccounting && (
        <section
          aria-label="Refund accounting"
          className="rounded-md border p-4"
        >
          <h3 className="text-lg font-semibold">Refund / credit recorded</h3>
          <p>
            {fmtMoney(doc.refundAccounting.amount)} ·{" "}
            {doc.refundAccounting.mode} ·{" "}
            {labelStatus(doc.refundAccounting.status)}
          </p>
          <p className="text-sm text-muted-foreground">
            This records the refund in the ledger. Settle cash or the chosen
            payment method separately.
          </p>
        </section>
      )}
      {doc?.effects?.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg font-semibold">
            Confirmed stock effects
          </h3>
          <ul className="divide-y border-y">
            {doc.effects.map((e: any) => (
              <li
                key={e.id}
                className="flex flex-wrap justify-between gap-2 py-3 text-sm"
              >
                <span>
                  {form.payload.lines.find((l: any) => l.id === e.lineId)
                    ?.name || "Linked correction"}
                </span>
                <span>
                  Physical {e.quantityDelta > 0 ? "+" : ""}
                  {e.quantityDelta} · Held {e.heldDelta > 0 ? "+" : ""}
                  {e.heldDelta}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {doc?.events?.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg font-semibold">Document history</h3>
          <ol className="divide-y border-y">
            {doc.events.map((e: any) => (
              <li key={e.id} className="py-3 text-sm">
                {new Date(e.createdAt).toLocaleString("en-IN")} ·{" "}
                {e.actorName || e.actorId} · {e.action} ·{" "}
                {labelStatus(e.toStatus)}
                {e.reason && ` · ${e.reason}`}
                {e.detail && (
                  <details className="mt-2">
                    <summary className="cursor-pointer underline">
                      View recorded changes
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {JSON.stringify(e.detail, null, 2)}
                    </pre>
                  </details>
                )}{" "}
                <span className="text-muted-foreground">
                  (revision {e.version})
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
