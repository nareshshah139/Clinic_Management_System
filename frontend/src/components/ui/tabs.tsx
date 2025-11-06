"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

type TabsFontScaleContextValue = {
  fontScale: number
  increase: () => void
  decrease: () => void
  reset: () => void
}

const TabsFontScaleContext = React.createContext<TabsFontScaleContextValue | undefined>(undefined)

const TABS_FONT_SCALE_STORAGE_KEY = "cms_tabs_font_scale_v1"
const MIN_SCALE = 0.85
const MAX_SCALE = 1.4
const STEP = 0.1

function clampScale(value: number): number {
  if (Number.isNaN(value)) return 1
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(value.toFixed(2))))
}

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const [fontScale, setFontScale] = React.useState(1)

  React.useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem(TABS_FONT_SCALE_STORAGE_KEY) : null
      if (stored) {
        setFontScale(clampScale(parseFloat(stored)))
      }
    } catch {
      // ignore storage errors
    }
  }, [])

  const ctx = React.useMemo<TabsFontScaleContextValue>(() => ({
    fontScale,
    increase: () => {
      setFontScale((prev) => {
        const next = clampScale(prev + STEP)
        try {
          window.localStorage.setItem(TABS_FONT_SCALE_STORAGE_KEY, String(next))
        } catch {}
        return next
      })
    },
    decrease: () => {
      setFontScale((prev) => {
        const next = clampScale(prev - STEP)
        try {
          window.localStorage.setItem(TABS_FONT_SCALE_STORAGE_KEY, String(next))
        } catch {}
        return next
      })
    },
    reset: () => {
      const next = 1
      setFontScale(next)
      try {
        window.localStorage.setItem(TABS_FONT_SCALE_STORAGE_KEY, String(next))
      } catch {}
    },
  }), [fontScale])

  return (
    <TabsFontScaleContext.Provider value={ctx}>
      <TabsPrimitive.Root
        data-slot="tabs"
        className={cn("flex flex-col gap-2", className)}
        // Expose the scale as a CSS variable for child components
        style={{
          "--tabs-font-scale": String(fontScale),
        }}
        {...props}
      />
    </TabsFontScaleContext.Provider>
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // Scale text consistently using CSS variable; 0.875rem is Tailwind text-sm
        "text-[calc(var(--tabs-font-scale,1)*0.875rem)]",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none data-[state=inactive]:hidden", className)}
      {...props}
    />
  )
}

function TabsFontSizeControls({ className }: { className?: string }) {
  const ctx = React.useContext(TabsFontScaleContext)
  if (!ctx) return null

  const percent = Math.round(ctx.fontScale * 100)

  return (
    <div className={cn("inline-flex items-center gap-1", className)} aria-label="Tab text size controls">
      <button
        type="button"
        onClick={ctx.decrease}
        className="h-7 px-2 rounded border text-xs"
        aria-label="Decrease tab font size"
        title="Decrease tab font size"
      >
        A-
      </button>
      <button
        type="button"
        onClick={ctx.reset}
        className="h-7 px-2 rounded border text-xs"
        aria-label="Reset tab font size"
        title="Reset tab font size"
      >
        100%
      </button>
      <button
        type="button"
        onClick={ctx.increase}
        className="h-7 px-2 rounded border text-xs"
        aria-label="Increase tab font size"
        title="Increase tab font size"
      >
        A+
      </button>
      <span className="sr-only" role="status" aria-live="polite">Tab font size {percent} percent</span>
    </div>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsFontSizeControls }
