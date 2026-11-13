"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Columns3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { columnChoices } from "./report-format";
import type { ReportColumn } from "./report-types";

const storageKey = (reportId: string) => `pharmacy-report-hidden-columns:${reportId}`;

export function useHiddenColumns(reportId: string) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem(storageKey(reportId)) ?? "[]");
      setHidden(new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : []));
    } catch {
      setHidden(new Set());
    }
  }, [reportId]);
  const update = useCallback(
    (next: ReadonlySet<string>) => {
      setHidden(next);
      try {
        window.localStorage.setItem(storageKey(reportId), JSON.stringify([...next]));
      } catch {
        // localStorage throws when site data is blocked or the quota is full; the choice then lasts until reload.
      }
    },
    [reportId],
  );
  return [hidden, update] as const;
}

export function ColumnChooser({ columns, hidden, onChange }: { columns: ReportColumn[]; hidden: ReadonlySet<string>; onChange: (hidden: ReadonlySet<string>) => void }) {
  const choices = useMemo(() => columnChoices(columns), [columns]);
  const hiddenCount = choices.filter((choice) => hidden.has(choice.id)).length;
  const keepOpen = (event: Event) => event.preventDefault();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="h-11 text-base" disabled={!choices.length}>
          <Columns3 aria-hidden="true" /> Show columns
          {hiddenCount > 0 && (
            <>
              <Badge variant="brand" className="min-w-6 text-xs font-semibold">
                {hiddenCount}
              </Badge>
              <span className="sr-only"> hidden</span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
        <DropdownMenuItem
          className="text-base"
          disabled={hiddenCount === 0}
          onSelect={(event: Event) => {
            event.preventDefault();
            onChange(new Set());
          }}
        >
          Show all columns
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {choices.map((choice) => (
          <DropdownMenuCheckboxItem
            key={choice.id}
            className="text-base"
            checked={!hidden.has(choice.id)}
            onSelect={keepOpen}
            onCheckedChange={(shown: boolean | "indeterminate") => {
              const next = new Set(hidden);
              if (shown === true) next.delete(choice.id);
              else next.add(choice.id);
              onChange(next);
            }}
          >
            {choice.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-sm font-normal text-muted-foreground">Print and Download always include every column.</DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
