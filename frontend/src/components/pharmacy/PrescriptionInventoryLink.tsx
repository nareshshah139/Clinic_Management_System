"use client";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type InventorySuggestion = {
  inventoryItemId: string;
  name: string;
  unit: string;
  packSizeLabel?: string;
  totalStock: number;
  manufacturerName?: string;
};

/**
 * @cc [owner:nareshshah139,label:product] inventory-link-explicit-selection-ui
 * A suggested match MUST only be remembered after the pharmacist selects an inventory item
 * and confirms it. Errors MUST remain visible and MUST NOT be reported as successful links.
 */
export function PrescriptionInventoryLink({
  prescriptionId,
  lineIndex,
  name,
  prescriptionVersion,
  linked = false,
  suggestions = [],
  onLinked,
}: {
  prescriptionId: string;
  lineIndex: number;
  name: string;
  prescriptionVersion?: string;
  linked?: boolean;
  suggestions?: InventorySuggestion[];
  onLinked: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(name);
  const [results, setResults] = useState<InventorySuggestion[]>(suggestions),
    [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false),
    [searching, setSearching] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await apiClient.get<InventorySuggestion[]>(
          "/pharmacy/prescription-queue/inventory-suggestions",
          { q: query },
        );
        if (!cancelled) {
          setResults(rows);
          setError("");
        }
      } catch {
        if (!cancelled) setError("Unable to search inventory. Try again.");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query]);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await apiClient.post(
        `/pharmacy/prescription-queue/${prescriptionId}/link-inventory`,
        { lineIndex, inventoryItemId: selected, prescriptionVersion },
      );
      await onLinked();
      setOpen(false);
    } catch (e: any) {
      setError(e.message || "Unable to remember match");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        size="sm"
        variant="link"
        className="ml-2 h-auto px-1 py-0 underline"
        onClick={() => {
          setOpen(true);
          setSelected("");
          setQuery(name);
        }}
        aria-label={`${linked ? "Change inventory link" : "Link inventory"} for ${name}`}
      >
        {linked ? "Change link" : "Link item"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Link {name}</DialogTitle>
            <DialogDescription>
              Choose the exact product, strength and stock unit. This choice
              will be remembered for the same medicine across patients.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-1">
            Search clinic inventory
            <input
              className="w-full rounded border p-2"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected("");
              }}
            />
          </label>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {searching && <p role="status">Searching inventory…</p>}
          <div className="max-h-72 space-y-2 overflow-auto">
            {!searching && results.length === 0 && (
              <p>
                No inventory candidates. Try another spelling or add the product
                in Inventory.
              </p>
            )}
            {results.map((item) => (
              <label
                key={item.inventoryItemId}
                className="flex cursor-pointer gap-3 rounded border p-3"
              >
                <input
                  type="radio"
                  name="inventory-match"
                  checked={selected === item.inventoryItemId}
                  onChange={() => setSelected(item.inventoryItemId)}
                />
                <span>
                  <strong>{item.name}</strong>
                  <span className="block text-sm text-muted-foreground">
                    {item.manufacturerName} · {item.packSizeLabel} ·{" "}
                    {item.totalStock} {item.unit.toLowerCase()} available
                  </span>
                </span>
              </label>
            ))}
          </div>
          <Button disabled={!selected || busy || searching} onClick={save}>
            {busy ? "Saving…" : "Confirm and remember match"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
