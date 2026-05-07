"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Plus, X, Globe } from "lucide-react"
import { DomainDnsHint } from "@/components/web/domain-dns-hint"

interface CreateSiteDialogProps {
  onClose: () => void
  onCreate: (data: { domain: string; rootPath: string; phpVersion?: string }) => Promise<void>
}

interface IpsResp {
  lan: string[]
  public: string | null
}

export function CreateSiteDialog({ onClose, onCreate }: CreateSiteDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState({
    domain: "",
    rootPath: "/var/www/",
    phpVersion: "",
  })
  const [serverIps, setServerIps] = useState<IpsResp | null>(null)

  useEffect(() => {
    fetch("/api/system/ips")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setServerIps(d) })
      .catch(() => {})
  }, [])

  function handleDomainChange(value: string) {
    setForm((f) => ({
      ...f,
      domain: value,
      rootPath: `/var/www/${value}`,
    }))
  }

  async function handleSubmit() {
    setError("")
    if (!form.domain) { setError("El dominio es requerido"); return }
    if (!form.rootPath) { setError("La ruta es requerida"); return }

    setLoading(true)
    try {
      await onCreate({
        domain: form.domain,
        rootPath: form.rootPath,
        phpVersion: form.phpVersion || undefined,
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al crear el sitio")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Nuevo sitio web</h2>
          <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="domain">Dominio</Label>
            <Input
              id="domain"
              placeholder="ejemplo.com"
              value={form.domain}
              onChange={(e) => handleDomainChange(e.target.value)}
              className="bg-input border-border font-mono text-sm"
            />

            <DomainDnsHint domain={form.domain} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rootPath">Ruta del sitio</Label>
            <Input
              id="rootPath"
              placeholder="/var/www/ejemplo.com"
              value={form.rootPath}
              onChange={(e) => setForm({ ...form, rootPath: e.target.value })}
              className="bg-input border-border font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="php">
              Versión PHP
              <span className="text-muted-foreground ml-1 text-[10px]">(opcional)</span>
            </Label>
            <Input
              id="php"
              placeholder="8.2"
              value={form.phpVersion}
              onChange={(e) => setForm({ ...form, phpVersion: e.target.value })}
              className="bg-input border-border text-sm"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          {/* IPs del servidor — referencia rápida */}
          {serverIps && (serverIps.lan.length > 0 || serverIps.public) && (
            <div className="bg-secondary/50 border border-border rounded-lg p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Globe className="w-3 h-3" />
                IPs de este servidor (apunta tu dominio aquí)
              </div>
              <div className="space-y-0.5 font-mono text-[11px]">
                {serverIps.public && (
                  <div className="flex items-center gap-2">
                    <span className="text-primary">{serverIps.public}</span>
                    <span className="text-muted-foreground text-[10px]">pública</span>
                  </div>
                )}
                {serverIps.lan.map((ip) => (
                  <div key={ip} className="flex items-center gap-2">
                    <span>{ip}</span>
                    <span className="text-muted-foreground text-[10px]">LAN</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-secondary/50 border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              Se creará el virtual host en Nginx y el directorio raíz.
              Para agregar SSL usa <strong className="text-primary">Byte AI</strong> después de crear el sitio.
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
              : <><Plus className="w-3.5 h-3.5 mr-1.5" />Crear sitio</>
            }
          </Button>
        </div>
      </div>
    </div>
  )
}
