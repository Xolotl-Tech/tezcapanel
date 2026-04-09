"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X } from "lucide-react"

interface Props {
  onClose: () => void
  onCreate: (data: { domain: string }) => Promise<void>
}

export function CreateDomainDialog({ onClose, onCreate }: Props) {
  const [domain, setDomain] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit() {
    setError("")
    if (!domain.trim()) { setError("El dominio es requerido"); return }

    setLoading(true)
    try {
      await onCreate({ domain: domain.trim() })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear dominio")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Agregar dominio de correo</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="domain" className="text-xs">Dominio</Label>
            <Input
              id="domain"
              placeholder="ejemplo.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Configura los registros DNS (SPF, DKIM, DMARC) después de agregar el dominio.
            </p>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={handleSubmit} disabled={loading}>
            {loading ? "Agregando..." : "Agregar dominio"}
          </Button>
        </div>
      </div>
    </div>
  )
}
