import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit max-w-full whitespace-nowrap [&>svg]:size-3 [&>svg]:shrink-0 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive transition-[color,box-shadow]",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20",
        success: 'border-success-border bg-success-soft text-success-text',
        warning: 'border-warning-border bg-warning-soft text-warning-text',
        info: 'border-info-border bg-info-soft text-info-text',
        highlight: 'border-highlight-border bg-highlight-soft text-highlight-text',
        neutral: 'border-border bg-muted text-muted-foreground',
        danger: 'border-destructive-border bg-destructive-soft text-destructive-text',
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        brand:
          "border-transparent bg-[var(--accent)] text-[var(--accent-foreground)] [a&]:hover:bg-[color-mix(in_oklab,var(--accent)_90%,black)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const LONG_LABEL_CHARS = 24

/**
 * @cc [owner:nareshshah139,label:accessibility] wrapping-badge-label
 * Badge labels MUST stay on one line and never break inside a word, while keeping their icons visible.
 * A short label MUST never be clipped; a text label longer than 24 characters MAY shrink, and then
 * ends in an ellipsis with its full text as the title.
 */
function Badge({
  className,
  variant,
  asChild = false,
  children,
  title,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"
  const parts = React.Children.toArray(children)
  const text = parts.every((part) => typeof part === "string" || typeof part === "number") ? parts.join("") : null
  const long = text !== null && text.length > LONG_LABEL_CHARS

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), long ? "min-w-0" : "shrink-0", className)}
      title={title ?? (long ? text : undefined)}
      {...props}
    >
      {long ? <span className="truncate">{text}</span> : children}
    </Comp>
  )
}

export { Badge, badgeVariants }
