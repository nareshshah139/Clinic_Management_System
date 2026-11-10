"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DayField } from "@/components/inventory/DayField";
import { inputClass } from "@/components/inventory/workspace-model";
import { cn } from "@/lib/utils";
import { exportHref, periodPresets, presetFor, shiftDay, type ReportEntry, type ReportParams } from "./report-catalog";

const fieldLabel = "text-base font-medium";

export function ExportMenu({ entry, params, disabled }: { entry: ReportEntry; params: ReportParams; disabled?: boolean }) {
  const formats = [
    { format: "xlsx" as const, label: "Excel (.xlsx)" },
    { format: "csv" as const, label: "CSV" },
    { format: "pdf" as const, label: "PDF" },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="h-11 text-base" disabled={disabled}>
          <FileDown aria-hidden="true" /> Download
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {formats.map(({ format, label }) => (
          <DropdownMenuItem key={format} asChild className="text-base">
            <a href={exportHref(entry, params, format)} download>
              {label}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Prints the report's PDF, which is laid out for paper, through a hidden frame. */
export function PrintButton({ entry, params, disabled }: { entry: ReportEntry; params: ReportParams; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 text-base"
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true);
        try {
          const response = await fetch(exportHref(entry, params, "pdf"), { credentials: "include" });
          if (!response.ok) throw new Error(String(response.status));
          const url = URL.createObjectURL(await response.blob());
          const frame = document.createElement("iframe");
          frame.style.position = "fixed";
          frame.style.width = "0";
          frame.style.height = "0";
          frame.style.border = "0";
          frame.src = url;
          frame.onload = () => {
            try {
              frame.contentWindow?.print();
            } catch {
              window.open(url, "_blank", "noopener");
            }
            setTimeout(() => {
              frame.remove();
              URL.revokeObjectURL(url);
            }, 60_000);
          };
          document.body.appendChild(frame);
        } catch {
          window.open(exportHref(entry, params, "pdf"), "_blank", "noopener");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Printer aria-hidden="true" /> Print
    </Button>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      <select id={id} className={cn(inputClass, "h-11 min-w-36 text-base")} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A month or quarter in one pick, or any range of days. */
export function PeriodPicker({ value, today, onChange }: { value: { from: string; to: string }; today: string; onChange: (range: { from: string; to: string }) => void }) {
  const presets = periodPresets(today);
  const selected = presetFor(value, today);
  const [custom, setCustom] = useState(selected === "custom");
  useEffect(() => {
    if (selected === "custom") setCustom(true);
  }, [selected]);
  return (
    <>
      <Select
        label="Period"
        value={custom ? "custom" : selected}
        options={[...presets.map((preset) => ({ value: preset.id, label: preset.label })), { value: "custom", label: "Choose dates…" }]}
        onChange={(id) => {
          if (id === "custom") return setCustom(true);
          setCustom(false);
          onChange(presets.find((preset) => preset.id === id)!.range);
        }}
      />
      {custom && (
        <>
          <div className={cn("[&_label]:flex [&_label]:flex-col [&_label]:gap-1 [&_label]:text-base [&_label]:font-medium [&_input]:h-11 [&_input]:text-base")}>
            <DayField label="From" value={value.from} onChange={(from) => onChange({ from, to: value.to })} />
          </div>
          <div className={cn("[&_label]:flex [&_label]:flex-col [&_label]:gap-1 [&_label]:text-base [&_label]:font-medium [&_input]:h-11 [&_input]:text-base")}>
            <DayField label="To" value={value.to} onChange={(to) => onChange({ from: value.from, to })} />
          </div>
        </>
      )}
    </>
  );
}

/** One clinic day, stepped a day at a time, as the drawer is counted. */
export function DayStepper({ value, today, onChange }: { value: string; today: string; onChange: (day: string) => void }) {
  return (
    <div className="flex items-end gap-1.5">
      <Button type="button" variant="outline" size="icon" className="size-11" aria-label="Previous day" onClick={() => onChange(shiftDay(value, -1))}>
        <ChevronLeft aria-hidden="true" />
      </Button>
      <div className="[&_label]:flex [&_label]:flex-col [&_label]:gap-1 [&_label]:text-base [&_label]:font-medium [&_input]:h-11 [&_input]:w-36 [&_input]:text-base">
        <DayField label="Day" value={value} onChange={onChange} />
      </div>
      <Button type="button" variant="outline" size="icon" className="size-11" aria-label="Next day" disabled={value >= today} onClick={() => onChange(shiftDay(value, 1))}>
        <ChevronRight aria-hidden="true" />
      </Button>
      {value !== today && (
        <Button type="button" variant="ghost" className="h-11 text-base" onClick={() => onChange(today)}>
          Today
        </Button>
      )}
    </div>
  );
}

/**
 * The filters every report shares. Changes are drafted here and applied with Go (or Enter), so a
 * half-typed date never fires a request; the applied filters live in the address bar.
 */
export function ReportToolbar({
  entry,
  params,
  today,
  loading,
  canExport,
  onApply,
  extra,
}: {
  entry: ReportEntry;
  params: ReportParams;
  today: string;
  loading: boolean;
  canExport: boolean;
  onApply: (params: ReportParams) => void;
  extra?: ReactNode;
}) {
  const [draft, setDraft] = useState(params);
  useEffect(() => setDraft(params), [params]);
  const invalid = draft.from > draft.to;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!invalid) onApply(draft);
  };
  const searchId = useId();
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3" aria-label={`${entry.title} filters`}>
      {entry.period === "range" && <PeriodPicker value={draft} today={today} onChange={(range) => setDraft({ ...draft, ...range })} />}
      {entry.period === "day" && <DayStepper value={draft.from} today={today} onChange={(day) => onApply({ ...draft, from: day, to: day })} />}
      {entry.types && <Select label="Type" value={draft.type ?? ""} options={entry.types} onChange={(type) => setDraft({ ...draft, type })} />}
      {entry.gstFilter && (
        <Select
          label="GST"
          value={draft.gst ?? "ALL"}
          options={[
            { value: "ALL", label: "All bills" },
            { value: "WITH_GST", label: "With GST" },
            { value: "WITHOUT_GST", label: "Without GST" },
          ]}
          onChange={(gst) => setDraft({ ...draft, gst })}
        />
      )}
      {entry.windows && <Select label="Expiry" value={draft.window ?? "3m"} options={entry.windows} onChange={(window) => setDraft({ ...draft, window })} />}
      {entry.compositionRate && (
        <Select
          label="Composition rate"
          value={draft.rate ?? "1"}
          options={[
            { value: "1", label: "1% (trader)" },
            { value: "2", label: "2% (manufacturer)" },
            { value: "5", label: "5% (restaurant)" },
            { value: "6", label: "6% (services)" },
          ]}
          onChange={(rate) => setDraft({ ...draft, rate })}
        />
      )}
      {entry.searchLabel && (
        <div className="flex min-w-56 flex-col gap-1">
          <label htmlFor={searchId} className={fieldLabel}>
            Search this report
          </label>
          <input
            id={searchId}
            type="search"
            className={cn(inputClass, "h-11 text-base")}
            placeholder={entry.searchLabel}
            value={draft.q ?? ""}
            onChange={(event) => setDraft({ ...draft, q: event.target.value })}
          />
        </div>
      )}
      {entry.period !== "day" && (
        <Button type="submit" className="h-11 px-6 text-base" disabled={loading || invalid}>
          Go
        </Button>
      )}
      {invalid && (
        <p role="alert" className="basis-full text-base text-destructive">
          The start date must be on or before the end date.
        </p>
      )}
      <div className="ml-auto flex flex-wrap items-end gap-2">
        {extra}
        <PrintButton entry={entry} params={params} disabled={!canExport} />
        <ExportMenu entry={entry} params={params} disabled={!canExport} />
      </div>
    </form>
  );
}
