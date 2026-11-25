"use client"

import { useEffect, useRef } from "react"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  type ToastProps,
} from "@/components/ui/toast"
import { useToast } from "@/hooks/use-toast"
import { splitErrorReference } from "@/lib/utils"
import { MODAL_CLOSED, MODAL_OPENED } from "@/lib/modal-events"

const DEFAULT_DURATION_MS = 5_000
const ERROR_DURATION_MS = 10_000
const REFERENCE_DURATION_MS = 30_000

function durationFor(variant: ToastProps["variant"], reference: string | undefined) {
  if (reference) return REFERENCE_DURATION_MS
  return variant === "destructive" ? ERROR_DURATION_MS : undefined
}

const referenceIn = (description: unknown) =>
  typeof description === "string" ? splitErrorReference(description).reference : undefined

export function Toaster() {
  const { toasts, toast, dismiss } = useToast()
  const latest = useRef({ toasts, toast, dismiss })
  latest.current = { toasts, toast, dismiss }
  const shownAt = useRef(new Map<string, number>())
  const current = new Set(toasts.map((t) => t.id))
  for (const id of shownAt.current.keys()) if (!current.has(id)) shownAt.current.delete(id)
  for (const t of toasts) if (!shownAt.current.has(t.id)) shownAt.current.set(t.id, Date.now())

  useEffect(() => {
    let depth = 0
    let parked: { toast: (typeof toasts)[number]; endsAt: number }[] = []
    let restoring: ReturnType<typeof setTimeout> | undefined
    const opened = () => {
      // A dialog that closes and reopens at once, as React's development checks do, keeps its toasts parked.
      clearTimeout(restoring)
      depth += 1
      const showing = latest.current.toasts.filter((t) => t.open && !parked.some((held) => held.toast.id === t.id))
      showing.forEach((t) => latest.current.dismiss(t.id))
      parked = [
        ...parked,
        ...showing.map((t) => {
          const lasts = t.duration ?? durationFor(t.variant, referenceIn(t.description)) ?? DEFAULT_DURATION_MS
          return { toast: t, endsAt: (shownAt.current.get(t.id) ?? Date.now()) + lasts }
        }),
      ]
    }
    const restore = () => {
      // A toast comes back only for the time it had left: its action, such as an Undo, may be bound to that window.
      const now = Date.now()
      parked
        .filter(({ endsAt }) => endsAt - now > 500)
        .reverse()
        .forEach(({ toast: { title, description, action, variant }, endsAt }) =>
          latest.current.toast({ title, description, action, variant, duration: endsAt - now }),
        )
      parked = []
    }
    const closed = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) restoring = setTimeout(restore, 0)
    }
    window.addEventListener(MODAL_OPENED, opened)
    window.addEventListener(MODAL_CLOSED, closed)
    return () => {
      clearTimeout(restoring)
      window.removeEventListener(MODAL_OPENED, opened)
      window.removeEventListener(MODAL_CLOSED, closed)
    }
  }, [])

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, duration, variant, ...props }) {
        const { text, reference } = typeof description === "string" ? splitErrorReference(description) : { text: description, reference: undefined }
        return (
          <Toast key={id} duration={duration ?? durationFor(variant, reference)} variant={variant} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {text && (
                <ToastDescription>{text}</ToastDescription>
              )}
              {reference && <p className="select-all text-xs opacity-75">Reference: {reference}</p>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
