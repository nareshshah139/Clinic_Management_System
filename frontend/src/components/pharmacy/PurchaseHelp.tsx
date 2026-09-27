"use client";

import { useState, type ReactNode } from "react";
import { Info, AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * @cc [owner:nareshshah139,label:accessibility] purchase-help-disclosure
 * Supporting help MUST open on hover, keyboard focus and tap, dismiss with Escape, and escape
 * clipping containers. Blockers, required controls and stock outcomes MUST remain outside help.
 */
export function PurchaseHelp({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <TooltipProvider delayDuration={200}><Tooltip open={open} onOpenChange={setOpen}>
    <TooltipTrigger asChild>
      <button type="button" aria-label={`Help: ${label}`} aria-expanded={open}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onClick={event => { event.preventDefault(); setOpen(value => !value); }}>
        <Info aria-hidden="true" className="h-4 w-4" />
      </button>
    </TooltipTrigger>
    <TooltipPrimitive.Portal>
      <TooltipContent side="top" collisionPadding={12} className="max-w-[min(22rem,calc(100vw-2rem))] whitespace-normal text-left text-sm leading-relaxed">
        {children}
      </TooltipContent>
    </TooltipPrimitive.Portal>
  </Tooltip></TooltipProvider>;
}

export function PurchaseStatusCue({ tone = "neutral", children }: { tone?: "neutral" | "warning" | "success"; children: ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? AlertTriangle : CircleDashed;
  return <span className={`inline-flex items-center gap-2 text-sm font-medium ${tone === "success" ? "text-green-800 dark:text-green-300" : tone === "warning" ? "text-amber-800 dark:text-amber-300" : "text-muted-foreground"}`}>
    <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />{children}
  </span>;
}
