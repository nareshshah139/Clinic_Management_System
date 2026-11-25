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

const ERROR_DURATION_MS = 10_000
const REFERENCE_DURATION_MS = 30_000

function durationFor(variant: ToastProps["variant"], reference: string | undefined) {
  if (reference) return REFERENCE_DURATION_MS
  return variant === "destructive" ? ERROR_DURATION_MS : undefined
}

export function Toaster() {
  const { toasts, toast, dismiss } = useToast()
  const latest = useRef({ toasts, toast, dismiss })
  latest.current = { toasts, toast, dismiss }

  useEffect(() => {
    let depth = 0
    let parked: typeof toasts = []
    const opened = () => {
      depth += 1
      const showing = latest.current.toasts.filter((t) => t.open)
      showing.forEach((t) => latest.current.dismiss(t.id))
      parked = [...parked, ...showing]
    }
    const closed = () => {
      depth = Math.max(0, depth - 1)
      if (depth > 0) return
      parked.reverse().forEach(({ title, description, action, variant, duration }) => latest.current.toast({ title, description, action, variant, duration }))
      parked = []
    }
    window.addEventListener(MODAL_OPENED, opened)
    window.addEventListener(MODAL_CLOSED, closed)
    return () => {
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
