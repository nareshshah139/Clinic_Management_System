"use client";

import type { CSSProperties, ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { type GstAmounts, type GstSlab, slabLabel } from "./pharmacy-report-model";

const amount = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CELLS = ["Base", "SGST", "CGST", "IGST"] as const;
const ZERO_CESS = [0, 0, 0, 0];

export type FrozenColumn = { label: ReactNode; width: number };

export type SlabGroupRow = {
  key: string;
  frozen: ReactNode[];
  slabs: GstSlab[];
  total: GstAmounts;
  amount: number;
  muted?: boolean;
};

const values = (amounts: GstAmounts) => [amounts.taxableAmount, amounts.sgst, amounts.cgst, amounts.igst];

function frozenStyle(columns: FrozenColumn[], index: number): CSSProperties {
  const left = columns.slice(0, index).reduce((sum, column) => sum + column.width, 0);
  return { left, minWidth: columns[index].width, width: columns[index].width, maxWidth: columns[index].width };
}

function MoneyCells({ amounts, extra, strong }: { amounts: number[]; extra?: number; strong?: boolean }) {
  return (
    <>
      {[...amounts, ...(extra === undefined ? [] : [extra])].map((value, index) => (
        <TableCell key={index} className={cn("px-2 text-right tabular-nums", strong && "font-semibold", value < 0 && "text-destructive")}>
          {amount.format(value)}
        </TableCell>
      ))}
    </>
  );
}

/**
 * GST slab bands as the pharmacy GST reports lay them out: frozen identifying columns on the left,
 * then CESS, every slab in use and Total, each split into Base, SGST, CGST and IGST, with the
 * period totals directly under the header. No CESS is recorded on any item, so that band is zero.
 */
export function GstSlabGroupTable({
  label,
  frozenColumns,
  columns,
  rows,
  totals,
}: {
  label: string;
  frozenColumns: FrozenColumn[];
  columns: number[];
  rows: SlabGroupRow[];
  totals: SlabGroupRow;
}) {
  const frozenCell = (index: number, extra?: string) => ({
    style: frozenStyle(frozenColumns, index),
    className: cn("sticky z-20 border-r bg-background px-2", extra),
  });
  const bandHead = "border-l px-2 text-center";
  return (
    <Table aria-label={label} className="w-max min-w-full">
      <TableHeader className="z-30">
        <TableRow>
          {frozenColumns.map((column, index) => {
            const cell = frozenCell(index, "z-40 bg-muted align-bottom");
            return (
              <TableHead key={index} rowSpan={2} {...cell}>
                {column.label}
              </TableHead>
            );
          })}
          <TableHead colSpan={4} className={bandHead}>CESS</TableHead>
          {columns.map((slab) => (
            <TableHead key={slab} colSpan={4} className={bandHead}>{slabLabel(slab)}</TableHead>
          ))}
          <TableHead colSpan={5} className={bandHead}>Total</TableHead>
        </TableRow>
        <TableRow>
          {[...Array(columns.length + 1)].flatMap((_, band) =>
            CELLS.map((cell) => (
              <TableHead key={`${band}-${cell}`} className={cn("px-2 text-right", cell === "Base" && "border-l")}>{cell}</TableHead>
            )),
          )}
          {CELLS.map((cell) => (
            <TableHead key={`total-${cell}`} className={cn("px-2 text-right", cell === "Base" && "border-l")}>{cell}</TableHead>
          ))}
          <TableHead className="px-2 text-right">Amount</TableHead>
        </TableRow>
        <TableRow className="bg-muted" data-testid="slab-totals-row">
          {totals.frozen.map((content, index) => {
            const cell = frozenCell(index, "z-40 bg-muted font-semibold");
            return (
              <TableCell key={index} {...cell}>
                {content}
              </TableCell>
            );
          })}
          <MoneyCells amounts={ZERO_CESS} strong />
          {totals.slabs.map((slab) => <MoneyCells key={slab.slabPercent} amounts={values(slab)} strong />)}
          <MoneyCells amounts={values(totals.total)} extra={totals.amount} strong />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key} className={cn(row.muted && "text-muted-foreground")}>
            {row.frozen.map((content, index) => {
              const cell = frozenCell(index);
              return (
                <TableCell key={index} {...cell}>
                  {content}
                </TableCell>
              );
            })}
            <MoneyCells amounts={ZERO_CESS} />
            {row.slabs.map((slab) => <MoneyCells key={slab.slabPercent} amounts={values(slab)} />)}
            <MoneyCells amounts={values(row.total)} extra={row.amount} strong />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
