"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import { Button } from "@/components/ui/button"

type ConfirmFn = (message: string, title?: string) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

interface PendingConfirm {
  message: string
  title: string
  resolve: (value: boolean) => void
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  const confirm = useCallback<ConfirmFn>((message, title = "Confirmar acción") => {
    return new Promise((resolve) => {
      setPending({ message, title, resolve })
    })
  }, [])

  const settle = (value: boolean) => {
    pending?.resolve(value)
    setPending(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-message"
          className="fixed inset-0 z-50 flex items-center justify-center"
        >
          <div className="absolute inset-0 bg-black/50" onClick={() => settle(false)} />
          <div className="relative bg-background border rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h2 id="confirm-title" className="font-semibold text-base">
              {pending.title}
            </h2>
            <p id="confirm-message" className="text-sm text-muted-foreground">
              {pending.message}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => settle(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={() => settle(true)}>
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider")
  return ctx
}
