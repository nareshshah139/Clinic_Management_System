"use client";

import type { ComponentProps, ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
export { PurchaseHelp as InventoryHelp } from "@/components/pharmacy/PurchaseHelp";

/**
 * @cc [owner:nareshshah139,label:accessibility] inventory-icon-action-name
 * Icon actions MUST expose a descriptive accessible name. Enabled actions MUST show a matching tooltip on hover or
 * keyboard focus. Tooltips MUST escape scroll containers and dismiss with Escape.
 */
export function InventoryAction({ label, children, className, ...props }: Omit<ComponentProps<typeof Button>, "aria-label" | "asChild"> & { label: string }) {
  return <TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="outline" size="icon" {...props}
          aria-label={label} title={label} className={cn("h-10 w-10 shrink-0", className)}>
          <span aria-hidden="true">{children}</span>
        </Button>
      </TooltipTrigger>
      <TooltipPrimitive.Portal>
        <TooltipContent collisionPadding={12} className="max-w-[min(22rem,calc(100vw-2rem))] whitespace-normal text-base leading-relaxed">
          {label}
        </TooltipContent>
      </TooltipPrimitive.Portal>
    </Tooltip>
  </TooltipProvider>;
}

/**
 * @cc [owner:nareshshah139,label:accessibility] inventory-secondary-guidance
 * Collapsed guidance MUST have a keyboard-operable, named disclosure. Callers MUST keep required
 * controls, validation errors, stock consequences and unverified-data warnings outside it.
 */
export function InventoryDetails({ summary, children }: { summary: string; children: ReactNode }) {
  return <details className="rounded-md border px-4 py-3 text-sm">
    <summary className="cursor-pointer font-medium underline-offset-4 hover:underline">{summary}</summary>
    <div className="mt-3 max-w-prose space-y-3 leading-relaxed text-muted-foreground">{children}</div>
  </details>;
}
