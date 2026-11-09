import type { CellValue, ColumnKind, ReportColumn, ReportRow } from "./report-types";

const indian = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });
const rupee = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Rupees to two decimals with Indian digit grouping (1,59,656.74); dates as dd/mm/yyyy. */
export function formatCell(value: CellValue | undefined, kind: ColumnKind): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    if (kind === "money") return indian.format(value);
    if (kind === "percent") return value.toFixed(2);
    return plain.format(value);
  }
  if (kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split("-").reverse().join("/");
  return value;
}

export const formatRupee = (value: number | null | undefined) => (value === null || value === undefined ? "—" : rupee.format(value));

export const isNumeric = (column: ReportColumn) => column.kind === "money" || column.kind === "number" || column.kind === "percent";

export type SortState = { key: string; direction: "asc" | "desc" } | null;

/** Empty cells sort last either way; ties keep the server's order. */
export function sortRows(rows: ReportRow[], columns: ReportColumn[], sort: SortState): ReportRow[] {
  if (!sort) return rows;
  const column = columns.find((c) => c.key === sort.key);
  if (!column) return rows;
  const sign = sort.direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const left = a.row.cells[sort.key];
      const right = b.row.cells[sort.key];
      const empty = (v: CellValue | undefined) => v === null || v === undefined || v === "";
      if (empty(left) || empty(right)) return empty(left) === empty(right) ? a.index - b.index : empty(left) ? 1 : -1;
      const order =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), "en-IN", { numeric: true, sensitivity: "base" });
      return sign * order || a.index - b.index;
    })
    .map(({ row }) => row);
}

export const nextSort = (current: SortState, column: ReportColumn): SortState =>
  current?.key !== column.key
    ? { key: column.key, direction: isNumeric(column) ? "desc" : "asc" }
    : current.direction === (isNumeric(column) ? "desc" : "asc")
      ? { key: column.key, direction: isNumeric(column) ? "asc" : "desc" }
      : null;

/** Frozen columns stay on screen while the money columns scroll; each needs a fixed width to stack. */
export function frozenWidth(column: ReportColumn): number {
  if (column.key === "srNo") return 108;
  if (column.kind === "date") return 156;
  if (column.kind === "number") return 104;
  if (/entry/i.test(column.key)) return 220;
  if (/bill|number/i.test(column.key)) return 168;
  return 220;
}

/**
 * Left offsets of the columns that stay frozen. Frozen columns may take at most `share` of the
 * frame, so on a narrow screen only the bill's identity (up to the first text column) stays put
 * and the rest scrolls with the figures.
 */
export function frozenOffsets(columns: ReportColumn[], frameWidth = Infinity, share = 0.5): Map<string, number> {
  const offsets = new Map<string, number>();
  let left = 0;
  for (const column of columns) {
    if (!column.frozen) break;
    const width = frozenWidth(column);
    const identityShown = [...offsets.keys()].some((key) => columns.find((c) => c.key === key)?.kind === "text");
    if (identityShown && left + width > frameWidth * share) break;
    offsets.set(column.key, left);
    left += width;
  }
  return offsets;
}

/** Runs of adjacent columns in the same band, for the merged heading row. */
export function headerBands(columns: ReportColumn[]): { label: string | null; span: number; first: ReportColumn }[] {
  const bands: { label: string | null; span: number; first: ReportColumn }[] = [];
  for (const column of columns) {
    const last = bands[bands.length - 1];
    if (last && column.group && last.label === column.group) last.span += 1;
    else bands.push({ label: column.group ?? null, span: 1, first: column });
  }
  return bands;
}
