"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Plus, X } from "lucide-react"

interface CreateDatabaseDialogProps {
  onClose: () => void
  onCreate: (data: { name: string; user: string; password: string }) => Promise<void>
}

export function CreateDatabaseDialog({ onClose, onCreate }: CreateDatabaseDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState({ name: "", user: "", password: "" })

  function handleNameChange(value: string) {
    const safe = value.replace(/[^a-zA-Z0-9_]/g, "")
    setForm((f) => ({
      ...f,
      name: safe,
      user: safe ? `${safe}_user` : "",
    }))
  }

  async function handleSubmit() {
    setError("")
    if (!form.name) { setError("El nombre es requerido"); return }
    if (!form.user) { setError("El usuario es requerido"); return }
    if (!form.password || form.password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres")
      return
    }

    setLoading(true)
    try {
      await onCreate(form)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al crear la base de datos")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Nueva base de datos</h2>
          <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre de la base de datos</Label>
            <Input
              id="name"
              placeholder="mi_base_datos"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="bg-input border-border font-mono text-sm"
            />
            <p className="text-[10px] text-muted-foreground">Solo letras, números y guiones bajos</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="user">Usuario</Label>
            <Input
              id="user"
              placeholder="mi_base_datos_user"
              value={form.user}
              onChange={(e) => setForm({ ...form, user: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })}
              className="bg-input border-border font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="bg-input border-border text-sm"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="bg-secondary/50 border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              Se creará la DB y el usuario en MySQL/MariaDB via <strong className="text-primary">Byte AI</strong>.
              Asegúrate de tener MySQL instalado en el servidor.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Creando...</>
              : <><Plus className="w-3.5 h-3.5 mr-1.5" />Crear</>
            }
          </Button>
        </div>
      </div>
    </div>
  )
}