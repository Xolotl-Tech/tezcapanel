"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X } from "lucide-react"

interface Props {
  onClose: () => void
  onCreate: (data: { source: string; destination: string }) => Promise<void>
}

export function CreateAliasDialog({ onClose, onCreate }: Props) {
  const [form, setForm] = useState({ source: "", destination: "" })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit() {
    setError("")
    if (!form.source.trim()) { setError("El origen es requerido"); return }
    if (!form.destination.trim()) { setError("El destino es requerido"); return }

    setLoading(true)
    try {
      await onCreate({ source: form.source.trim(), destination: form.destination.trim() })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear alias")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Crear alias de correo</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="source" className="text-xs">Alias (origen)</Label>
            <Input
              id="source"
              type="email"
              placeholder="contacto@ejemplo.com"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="destination" className="text-xs">Reenviar a (destino)</Label>
            <Input
              id="destination"
              type="email"
              placeholder="admin@ejemplo.com"
              value={form.destination}
              onChange={(e) => setForm({ ...form, destination: e.target.value })}
            />
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
            {loading ? "Creando..." : "Crear alias"}
          </Button>
        </div>
      </div>
    </div>
  )
}
