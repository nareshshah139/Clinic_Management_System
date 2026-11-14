import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * @cc [owner:nareshshah139,label:accessibility] native-select
 * Native selects MUST render through this component, matching SelectTrigger's height, border,
 * radius, focus ring and chevron. className sizes and places the control; the select keeps
 * every other prop, so labels, ids, refs and keyboard behaviour stay native.
 */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <span data-slot="native-select-wrapper" className={cn("relative inline-block min-w-0 max-w-full align-middle", className)}>
      <select
        data-slot="native-select"
        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:border-destructive block h-9 w-full min-w-0 cursor-default appearance-none truncate rounded-md border bg-transparent py-1 pr-8 pl-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon aria-hidden="true" className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 opacity-50" />
    </span>
  )
}

export { NativeSelect }
