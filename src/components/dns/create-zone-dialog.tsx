"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X } from "lucide-react"

interface Props {
  onClose: () => void
  onCreate: (data: { domain: string; primaryNs?: string; adminEmail?: string; serverIp?: string }) => Promise<void>
}

export function CreateZoneDialog({ onClose, onCreate }: Props) {
  const [domain, setDomain] = useState("")
  const [primaryNs, setPrimaryNs] = useState("")
  const [adminEmail, setAdminEmail] = useState("")
  const [serverIp, setServerIp] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit() {
    setError("")
    if (!domain.trim()) { setError("El dominio es requerido"); return }

    setLoading(true)
    try {
      await onCreate({
        domain: domain.trim(),
        primaryNs: primaryNs.trim() || undefined,
        adminEmail: adminEmail.trim() || undefined,
        serverIp: serverIp.trim() || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear la zona")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Nueva zona DNS</h2>
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
              autoFocus
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ns" className="text-xs">
              Nameserver primario <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="ns"
              placeholder={`ns1.${domain || "ejemplo.com"}.`}
              value={primaryNs}
              onChange={(e) => setPrimaryNs(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="admin" className="text-xs">
              Email administrador <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="admin"
              placeholder={`admin.${domain || "ejemplo.com"}.`}
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ip" className="text-xs">
              IP del servidor <span className="text-muted-foreground">(opcional, crea registros A para @ y www)</span>
            </Label>
            <Input
              id="ip"
              placeholder="192.0.2.10"
              value={serverIp}
              onChange={(e) => setServerIp(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          <div className="bg-secondary/50 border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              Se generará la zona BIND con SOA + NS automáticos. Edita registros después de crearla.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={handleSubmit} disabled={loading}>
            {loading ? "Creando..." : "Crear zona"}
          </Button>
        </div>
      </div>
    </div>
  )
}
