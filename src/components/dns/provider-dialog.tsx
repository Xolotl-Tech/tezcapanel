"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { PROVIDER_META, type ProviderType } from "@/lib/dns-providers/types"

const SELECTABLE_TYPES: ProviderType[] = [
  "cloudflare",
  "route53",
  "godaddy",
  "namecheap",
  "namesilo",
  "porkbun",
]

interface ExistingProvider {
  id: string
  type: string
  alias: string
  status: boolean
  permission: string
}

interface Props {
  existing?: ExistingProvider | null
  onClose: () => void
  onSaved: () => Promise<void> | void
}

export function ProviderDialog({ existing, onClose, onSaved }: Props) {
  const [type, setType] = useState<ProviderType>((existing?.type as ProviderType) ?? "cloudflare")
  const [alias, setAlias] = useState(existing?.alias ?? "")
  const [status, setStatus] = useState(existing?.status ?? true)
  const [permission] = useState(existing?.permission ?? "global")
  const [config, setConfig] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  const meta = PROVIDER_META[type]
  const isEdit = !!existing

  // Reset config cuando cambia el tipo (en modo crear)
  useEffect(() => {
    if (!isEdit) setConfig({})
    setTestResult(null)
  }, [type, isEdit])

  async function handleSubmit() {
    setError("")
    if (!alias.trim()) { setError("Alias requerido"); return }
    for (const f of meta.fields) {
      if (!config[f.key] || !config[f.key].trim()) {
        // Email es opcional en cloudflare
        if (type === "cloudflare" && f.key === "accountEmail") continue
        setError(`${f.label} es requerido`); return
      }
    }

    setLoading(true)
    try {
      const url    = isEdit ? `/api/dns/providers/${existing!.id}` : "/api/dns/providers"
      const method = isEdit ? "PATCH" : "POST"
      const body   = isEdit
        ? { alias, status, config, permission }
        : { type, alias, status, config, permission }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Error al guardar")
      await onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setLoading(false)
    }
  }

  async function handleTest() {
    if (!isEdit) {
      setTestResult({ ok: false, error: "Guarda el provider primero para probar" })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`/api/dns/providers/${existing!.id}/test`, { method: "POST" })
      const json = await res.json()
      setTestResult(json)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">
            {isEdit ? "Editar provider" : "Integrar DNS Provider API"}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Status</Label>
            <button
              type="button"
              onClick={() => setStatus(!status)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                status ? "bg-primary" : "bg-muted"
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                status ? "translate-x-5" : "translate-x-1"
              }`} />
            </button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ProviderType)}
              disabled={isEdit}
              className="w-full h-9 px-3 rounded-md bg-input border border-border text-sm font-mono disabled:opacity-50"
            >
              {SELECTABLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PROVIDER_META[t].label}{!PROVIDER_META[t].implemented && " (próximamente)"}
                </option>
              ))}
            </select>
          </div>

          {meta.fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={f.key} className="text-xs">{f.label}</Label>
              <Input
                id={f.key}
                type={f.secret ? "password" : "text"}
                placeholder={f.placeholder}
                value={config[f.key] ?? ""}
                onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
                className="font-mono text-sm"
              />
            </div>
          ))}

          <div className="space-y-1.5">
            <Label htmlFor="alias" className="text-xs">Alias</Label>
            <Input
              id="alias"
              placeholder="Mi cuenta de Cloudflare"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className="text-sm"
            />
          </div>

          {!meta.implemented && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-600">
                {meta.label} aún no está implementado. Las credenciales se guardarán pero la sincronización no funcionará todavía.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          {testResult && (
            <div className={`rounded-lg px-3 py-2 border ${
              testResult.ok
                ? "bg-green-500/10 border-green-500/20"
                : "bg-destructive/10 border-destructive/20"
            }`}>
              <div className="flex items-center gap-2">
                {testResult.ok
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  : <XCircle className="w-3.5 h-3.5 text-destructive" />}
                <p className={`text-xs ${testResult.ok ? "text-green-600" : "text-destructive"}`}>
                  {testResult.ok ? "Conexión exitosa" : (testResult.error ?? "Error de conexión")}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center gap-2 px-6 py-4 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTest}
            disabled={testing || !isEdit}
            className="text-muted-foreground"
          >
            {testing ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Probando...</> : "Probar conexión"}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={handleSubmit} disabled={loading}>
              {loading ? "Guardando..." : "Confirmar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
