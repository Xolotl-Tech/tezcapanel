"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X } from "lucide-react"

interface Props {
  onClose: () => void
  onCreate: (data: { email: string; password: string; quotaMB: number }) => Promise<void>
}

export function CreateAccountDialog({ onClose, onCreate }: Props) {
  const [form, setForm] = useState({ email: "", password: "", quotaMB: "500" })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit() {
    setError("")
    if (!form.email.trim()) { setError("El email es requerido"); return }
    if (!form.password) { setError("La contraseña es requerida"); return }
    if (form.password.length < 8) { setError("La contraseña debe tener al menos 8 caracteres"); return }

    setLoading(true)
    try {
      await onCreate({
        email: form.email.trim(),
        password: form.password,
        quotaMB: parseInt(form.quotaMB) || 500,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear cuenta")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Crear cuenta de correo</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">Dirección de correo</Label>
            <Input
              id="email"
              type="email"
              placeholder="usuario@ejemplo.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs">Contraseña</Label>
            <Input
              id="password"
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quota" className="text-xs">Cuota (MB)</Label>
            <Input
              id="quota"
              type="number"
              min="100"
              placeholder="500"
              value={form.quotaMB}
              onChange={(e) => setForm({ ...form, quotaMB: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Espacio asignado al buzón en megabytes.</p>
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
            {loading ? "Creando..." : "Crear cuenta"}
          </Button>
        </div>
      </div>
    </div>
  )
}
