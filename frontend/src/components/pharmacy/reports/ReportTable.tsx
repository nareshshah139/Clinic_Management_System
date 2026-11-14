"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportInfoTip } from "../ReportInfoTip";
import { formatCell, frozenOffsets, frozenWidth, headerBands, isNumeric, nextSort, sortRows, type SortState } from "./report-format";
import type { ReportColumn, ReportSection } from "./report-types";

const cellPad = "px-3 py-2.5";
const WRAPPING = new Set(["nature", "description", "line", "action", "status"]);

/**
 * A Pharmacy Report table: identifying columns frozen on the left while the money columns scroll,
 * GST bands as merged headings, the period's totals directly under the header, and sortable
 * headings. The header stays visible while the rows scroll.
 */
export function ReportTable({ section, label }: { section: ReportSection; label?: string }) {
  const [sort, setSort] = useState<SortState>(null);
  const rows = useMemo(() => sortRows(section.rows, section.columns, sort), [section.rows, section.columns, sort]);
  const frame = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(Infinity);
  useEffect(() => {
    const element = frame.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setFrameWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const offsets = useMemo(() => frozenOffsets(section.columns, frameWidth), [section.columns, frameWidth]);
  const grouped = section.columns.some((column) => column.group);
  const lastFrozen = [...offsets.keys()].at(-1);

  const stick = (column: ReportColumn, base: string): { className: string; style?: CSSProperties } => {
    const left = offsets.get(column.key);
    if (left === undefined) return { className: base };
    const width = frozenWidth(column);
    return {
      className: cn(base, "sticky z-10 overflow-hidden text-ellipsis", column.key === lastFrozen && "border-r"),
      style: { left, minWidth: width, width, maxWidth: width },
    };
  };
  // Short values stay on one line so a row reads straight across; long descriptions may wrap.
  const align = (column: ReportColumn) =>
    isNumeric(column) ? "text-right tabular-nums whitespace-nowrap" : WRAPPING.has(column.key) ? "text-left min-w-64 max-w-md" : "text-left whitespace-nowrap";

  if (!section.rows.length && section.emptyText) {
    return <p className="rounded-md border border-dashed p-4 text-base text-muted-foreground">{section.emptyText}</p>;
  }

  return (
    <div ref={frame} className="max-h-[70vh] overflow-auto rounded-md border" tabIndex={0} aria-label={`${label ?? section.title}, scrollable`}>
      <table aria-label={label ?? section.title} className="w-max min-w-full border-separate border-spacing-0 text-base">
        <thead className="sticky top-0 z-20">
          {grouped && (
            <tr>
              {headerBands(section.columns).map((band, index) => {
                if (!band.label) {
                  const cell = stick(band.first, cn("bg-muted", cellPad, "py-1"));
                  return <th key={index} aria-hidden="true" className={cn(cell.className, offsets.has(band.first.key) && "z-30")} style={cell.style} />;
                }
                return (
                  <th key={index} colSpan={band.span} scope="colgroup" className="border-b border-l bg-muted px-3 py-1.5 text-center font-semibold">
                    {band.label}
                  </th>
                );
              })}
            </tr>
          )}
          <tr>
            {section.columns.map((column) => {
              const cell = stick(column, cn("border-b bg-muted font-semibold", cellPad, align(column), column.group && column.label === "Base" && "border-l"));
              const active = sort?.key === column.key;
              const Icon = !active ? ArrowUpDown : sort!.direction === "asc" ? ArrowUp : ArrowDown;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? (sort!.direction === "asc" ? "ascending" : "descending") : undefined}
                  className={cn(cell.className, offsets.has(column.key) && "z-30")}
                  style={cell.style}
                >
                  <span className={cn("inline-flex items-center gap-1", isNumeric(column) && "flex-row-reverse")}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                      onClick={() => setSort((current) => nextSort(current, column))}
                    >
                      {column.label}
                      <Icon className={cn("size-3.5 shrink-0", !active && "opacity-40")} aria-hidden="true" />
                      {column.group && <span className="sr-only">, {column.group}</span>}
                    </button>
                    {column.help && <ReportInfoTip label={`the ${column.label} column`}>{column.help}</ReportInfoTip>}
                  </span>
                </th>
              );
            })}
          </tr>
          {section.totals && (
            <tr data-testid="report-totals-row">
              {section.columns.map((column) => {
                const cell = stick(column, cn("border-b-2 bg-muted font-semibold", cellPad, align(column), column.group && column.label === "Base" && "border-l"));
                const value = section.totals![column.key];
                return (
                  <td key={column.key} className={cn(cell.className, offsets.has(column.key) && "z-30", typeof value === "number" && value < 0 && "text-destructive")} style={cell.style}>
                    {formatCell(value, column.kind)}
                  </td>
                );
              })}
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              data-tone={row.tone}
              className={cn(
                "[&>td]:border-b [&>td]:bg-background hover:[&>td]:bg-accent-soft",
                row.tone === "muted" && "text-muted-foreground",
                row.tone === "warning" && "[&>td]:bg-warning-soft",
              )}
            >
              {section.columns.map((column) => {
                const cell = stick(column, cn(cellPad, align(column), column.group && column.label === "Base" && "border-l"));
                const value = row.cells[column.key];
                return (
                  <td
                    key={column.key}
                    className={cn(cell.className, typeof value === "number" && value < 0 && "text-destructive")}
                    style={cell.style}
                    title={cell.style && typeof value === "string" ? value : undefined}
                  >
                    {formatCell(value, column.kind)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
