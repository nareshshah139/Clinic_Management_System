"use client"

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

const ERROR_DURATION_MS = 10_000

function durationFor(variant: ToastProps["variant"], reference: string | undefined) {
  if (reference) return Infinity
  return variant === "destructive" ? ERROR_DURATION_MS : undefined
}

export function Toaster() {
  const { toasts } = useToast()

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
