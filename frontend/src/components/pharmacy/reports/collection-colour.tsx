import type { ReactNode } from "react";
import { Banknote, CircleDollarSign, CreditCard, Landmark, Pill, ShieldCheck, Smartphone, Stethoscope, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CollectionMode, ReportColumn } from "./report-types";

export type Stream = "whole" | "clinic" | "pharmacy";

type Hue = { tile: string; label: string; head: string; cell: string; foot: string; heading: string };

export const STREAM: Record<Stream, Hue> = {
  whole: {
    tile: "border-primary bg-primary text-primary-foreground print:bg-transparent print:text-foreground",
    label: "text-primary-foreground print:text-foreground",
    head: "bg-primary text-primary-foreground [&_button]:text-primary-foreground [&_button:hover]:text-primary-foreground [&_button:focus-visible]:outline-primary-foreground! print:bg-transparent print:text-foreground print:[&_button]:text-foreground",
    cell: "bg-primary-soft/50 font-semibold",
    foot: "bg-primary-soft font-semibold",
    heading: "border-primary",
  },
  clinic: {
    tile: "border-info-border bg-info-soft",
    label: "text-info-text",
    head: "bg-info-soft text-info-text",
    cell: "bg-info-soft/40",
    foot: "bg-info-soft",
    heading: "border-info text-info-text",
  },
  pharmacy: {
    tile: "border-highlight-border bg-highlight-soft",
    label: "text-highlight-text",
    head: "bg-highlight-soft text-highlight-text",
    cell: "bg-highlight-soft/40",
    foot: "bg-highlight-soft",
    heading: "border-highlight text-highlight-text",
  },
};

export const OWED = "bg-warning-soft text-warning-text";

const STREAM_ICON = { clinic: Stethoscope, pharmacy: Pill } as const;

export function StreamMark({ stream, className }: { stream: Stream; className?: string }) {
  if (stream === "whole") return null;
  const Icon = STREAM_ICON[stream];
  return <Icon className={cn("size-5 shrink-0", className)} aria-hidden="true" />;
}

export function StreamHeading({ as: Tag, id, stream, className, children }: { as: "h2" | "h3"; id?: string; stream: Stream; className?: string; children: ReactNode }) {
  return (
    <Tag id={id} className={cn("flex items-start gap-2", Tag === "h2" && "border-b-2 pb-1", STREAM[stream].heading, className)}>
      <StreamMark stream={stream} className="mt-1" />
      {children}
    </Tag>
  );
}

export type TableColour = { stream: Stream; columns?: Record<string, Stream>; total?: string; due?: string };

export type ColumnColour = Pick<Hue, "head" | "cell" | "foot"> & { due: boolean };

export function columnColour(colour: TableColour | undefined, column: ReportColumn): ColumnColour | null {
  if (!colour || column.kind !== "money") return null;
  const hue = STREAM[colour.total === column.key ? "whole" : (colour.columns?.[column.key] ?? colour.stream)];
  return { head: hue.head, cell: hue.cell, foot: hue.foot, due: colour.due === column.key };
}

const MODE_ICON: Record<CollectionMode, typeof Banknote> = {
  CASH: Banknote,
  UPI: Smartphone,
  CARD: CreditCard,
  NETBANKING: Landmark,
  CHEQUE: Landmark,
  WALLET: Wallet,
  INSURANCE: ShieldCheck,
  OTHER: CircleDollarSign,
};

export function ModeMark({ mode }: { mode: string }) {
  const Icon = MODE_ICON[mode as CollectionMode];
  return Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null;
}
