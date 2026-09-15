"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { downloadCsv, inputClass } from "./workspace-model";
const template = {
  distributorName: "",
  distributorGstin: "",
  distributorDlNo: "",
  invoiceNumber: "",
  invoiceDate: "YYYY-MM-DD",
  goodsReceivedDate: "YYYY-MM-DD",
  billType: "CASH or CREDIT",
  dueDate: "",
  productName: "",
  manufacturer: "",
  packSize: "",
  packUnitType: "",
  hsnCode: "",
  batchNumber: "",
  expiryMonth: "",
  expiryYear: "",
  quantityPurchased: "",
  freeQuantity: "0",
  mrp: "",
  purchaseRate: "",
  discountPercent: "0",
  specialDiscountPercent: "0",
  schemeAmount: "0",
  taxableAmount: "",
  cgstPercent: "",
  sgstPercent: "",
  igstPercent: "0",
  gstAmount: "",
  lineTotal: "",
  rounding: "0",
  netPayable: "",
};
/**
 * @cc [owner:nareshshah139,label:product;target] purchase-intake-channel-equivalence
 * Purchase CSV and explicitly connected Gmail imports MUST enter the same invoice validation and
 * duplicate-checking flow as manual/OCR intake; a disconnected Gmail account MUST perform no
 * fetch.
 * Acceptance: INV-23. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
export function AlternateInvoiceIntake({
  mode,
  onDraft,
  onInvoice,
}: {
  mode: "csv" | "gmail";
  onDraft: (d: any) => void;
  onInvoice: (id: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [status, setStatus] = useState<any>(null),
    [data, setData] = useState<any>(null),
    [query, setQuery] = useState("newer_than:30d"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const loadStatus = () => {
    setError("");
    return apiClient
      .get("/inventory/workspace/gmail/status")
      .then(setStatus)
      .catch((e: any) => setError(e.message));
  };
  useEffect(() => {
    if (mode === "gmail") {
      const p = new URLSearchParams(location.search),
        code = p.get("code"),
        state = p.get("state");
      if (code && state) {
        setBusy(true);
        apiClient
          .post("/inventory/workspace/gmail/exchange", { code, state })
          .then(() => {
            const url = new URL(location.href);
            url.searchParams.delete("code");
            url.searchParams.delete("state");
            history.replaceState(null, "", url);
            return loadStatus();
          })
          .catch((e: any) => setError(e.message))
          .finally(() => setBusy(false));
      } else loadStatus();
    }
  }, [mode]);
  const run = async (callback: () => Promise<any>) => {
    setBusy(true);
    setError("");
    try {
      return await callback();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const accept = (result: any) => {
    if (result.duplicateInvoiceId) onInvoice(result.duplicateInvoiceId);
    else if (result.draft) onDraft(result);
    else throw new Error("The import did not return a draft");
  };
  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-2xl font-semibold">
          {mode === "csv"
            ? "Import purchase CSV"
            : "Invoice attachments from Gmail"}
        </h2>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          {mode === "csv"
            ? "One row per invoice item. Repeat the same bill header on every row. Imported lines open in the invoice review screen before stock is added."
            : "Connect your account, find the supplier message and choose an invoice attachment. The original file is retained and opens for invoice review."}
        </p>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive p-3 text-destructive"
        >
          {error}
        </p>
      )}
      {mode === "csv" ? (
        <div className="space-y-4">
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv("purchase-invoice-template.csv", [template])
            }
          >
            Download CSV template
          </Button>
          <label className="block max-w-xl text-sm">
            Purchase invoice CSV
            <input
              className={inputClass}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={busy}
            />
          </label>
          <Button
            disabled={!file || busy}
            onClick={() =>
              run(async () => {
                const body = new FormData();
                body.append("file", file!);
                const response = await fetch(
                  "/api/inventory/workspace/intake/csv",
                  { method: "POST", body, credentials: "include" },
                );
                const result = await response.json();
                if (!response.ok)
                  throw new Error(result.message || "CSV import failed");
                accept(result);
              })
            }
          >
            {busy ? "Reading CSV…" : "Open review draft"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Required before posting: supplier identity, bill number and dates,
            product/pack, batch/expiry, paid/free quantities and reconciled
            prices and tax. Manufacturer is optional. The source CSV is retained
            in the database.
          </p>
        </div>
      ) : (
        <>
          {!status ? (
            error ? (
              <Button variant="outline" onClick={loadStatus}>
                Retry connection check
              </Button>
            ) : (
              <p role="status">Checking Gmail connection…</p>
            )
          ) : !status.configured ? (
            <p className="rounded-md border p-4">
              Gmail is not configured for this deployment. The administrator
              must set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI
              and a 32-byte base64 INVENTORY_TOKEN_KEY. The redirect should
              return to this Gmail intake screen. Photo/PDF and CSV intake
              remain available.
            </p>
          ) : !status.connected ? (
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await apiClient.post<any>(
                    "/inventory/workspace/gmail/connect",
                    {},
                  );
                  location.assign(r.url);
                })
              }
            >
              Connect Gmail
            </Button>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
                <p>
                  Connected: <strong>{status.email}</strong>
                  <span className="block text-sm text-muted-foreground">
                    Last attachment search:{" "}
                    {status.lastSyncAt
                      ? new Date(status.lastSyncAt).toLocaleString("en-IN")
                      : "Not searched yet"}{" "}
                    · current account and search query
                  </span>
                </p>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await apiClient.post(
                        "/inventory/workspace/gmail/disconnect",
                        {},
                      );
                      setData(null);
                      loadStatus();
                    })
                  }
                >
                  Disconnect Gmail
                </Button>
              </div>
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(async () => {
                    setData(
                      await apiClient.get(
                        "/inventory/workspace/gmail/messages?" +
                          new URLSearchParams({ search: query }),
                      ),
                    );
                    await loadStatus();
                  });
                }}
              >
                <label className="min-w-64 flex-1">
                  <span className="sr-only">Gmail search</span>
                  <input
                    className={inputClass}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="from:supplier@example.com newer_than:30d"
                  />
                </label>
                <Button disabled={busy}>
                  {busy ? "Loading…" : "Find invoice attachments"}
                </Button>
              </form>
              <ul className="divide-y border-y">
                {data?.messages.map((m: any) => (
                  <li key={m.id} className="space-y-3 py-4">
                    <div>
                      <strong>{m.subject}</strong>
                      <p className="text-sm text-muted-foreground">
                        {m.from} · {m.date}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {m.attachments.map((a: any) => (
                        <Button
                          key={a.id}
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            run(async () =>
                              accept(
                                await apiClient.post(
                                  "/inventory/workspace/gmail/import",
                                  { messageId: m.id, attachmentId: a.id },
                                ),
                              ),
                            )
                          }
                        >
                          Review {a.name}
                        </Button>
                      ))}
                    </div>
                  </li>
                ))}
                {data && !data.messages.length && (
                  <li className="py-5 text-muted-foreground">
                    No invoice attachments match this search.
                  </li>
                )}
              </ul>
              {data?.nextPageToken && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const next = await apiClient.get<any>(
                        "/inventory/workspace/gmail/messages?" +
                          new URLSearchParams({
                            search: query,
                            pageToken: data.nextPageToken,
                          }),
                      );
                      setData({
                        ...next,
                        messages: [...data.messages, ...next.messages],
                      });
                    })
                  }
                >
                  Load more messages
                </Button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
