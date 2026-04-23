"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X } from "lucide-react"

const TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV"] as const
type RecordType = typeof TYPES[number]

interface Props {
  defaultTtl: number
  onClose: () => void
  onCreate: (data: {
    type: RecordType
    name: string
    value: string
    ttl: number
    priority?: number
  }) => Promise<void>
}

const PLACEHOLDERS: Record<RecordType, { value: string; help: string }> = {
  A:     { value: "192.0.2.10",                    help: "Dirección IPv4" },
  AAAA:  { value: "2001:db8::1",                   help: "Dirección IPv6" },
  CNAME: { value: "destino.ejemplo.com.",          help: "Alias hacia otro dominio (termina en punto)" },
  MX:    { value: "mail.ejemplo.com.",             help: "Servidor de correo (requiere prioridad)" },
  TXT:   { value: "v=spf1 mx ~all",                help: "Texto arbitrario (SPF, DKIM, verificaciones)" },
  NS:    { value: "ns1.ejemplo.com.",              help: "Servidor de nombres (termina en punto)" },
  SRV:   { value: "0 5 5060 sip.ejemplo.com.",     help: "weight port target (requiere prioridad)" },
}

export function CreateRecordDialog({ defaultTtl, onClose, onCreate }: Props) {
  const [type, setType] = useState<RecordType>("A")
  const [name, setName] = useState("@")
  const [value, setValue] = useState("")
  const [ttl, setTtl] = useState(String(defaultTtl))
  const [priority, setPriority] = useState("10")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const requiresPriority = type === "MX" || type === "SRV"

  async function handleSubmit() {
    setError("")
    if (!name.trim()) { setError("El nombre es requerido"); return }
    if (!value.trim()) { setError("El valor es requerido"); return }
    if (requiresPriority && !priority) { setError("La prioridad es requerida"); return }

    setLoading(true)
    try {
      await onCreate({
        type,
        name: name.trim(),
        value: value.trim(),
        ttl: Number(ttl) || defaultTtl,
        priority: requiresPriority ? Number(priority) : undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear el registro")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Nuevo registro DNS</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo</Label>
            <div className="grid grid-cols-7 gap-1">
              {TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-2 py-1.5 text-xs font-mono rounded border transition-colors ${
                    type === t
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-card border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5 col-span-1">
              <Label htmlFor="name" className="text-xs">Nombre</Label>
              <Input
                id="name"
                placeholder="@"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5 col-span-1">
              <Label htmlFor="ttl" className="text-xs">TTL</Label>
              <Input
                id="ttl"
                type="number"
                value={ttl}
                onChange={(e) => setTtl(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            {requiresPriority && (
              <div className="space-y-1.5 col-span-1">
                <Label htmlFor="prio" className="text-xs">Prioridad</Label>
                <Input
                  id="prio"
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="value" className="text-xs">Valor</Label>
            <Input
              id="value"
              placeholder={PLACEHOLDERS[type].value}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">{PLACEHOLDERS[type].help}</p>
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
            {loading ? "Creando..." : "Crear registro"}
          </Button>
        </div>
      </div>
    </div>
  )
}
