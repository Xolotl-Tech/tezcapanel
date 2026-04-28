"use client"

import { useState, useEffect, useCallback } from "react"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { Button } from "@/components/ui/button"
import { CreateZoneDialog } from "@/components/dns/create-zone-dialog"
import { CreateRecordDialog } from "@/components/dns/create-record-dialog"
import { ProviderDialog } from "@/components/dns/provider-dialog"
import {
  Server, Plus, RefreshCw, Trash2, ArrowLeft, Globe,
  CheckCircle2, XCircle, AlertTriangle, X, ShieldCheck, Power,
  Cloud, Pencil, FileText,
} from "lucide-react"
import { safeJson } from "@/lib/utils"

interface Zone {
  id: string
  domain: string
  primaryNs: string
  adminEmail: string
  serial: number
  defaultTtl: number
  active: boolean
  createdAt: string
  provider?: { id: string; alias: string; type: string } | null
  _count?: { records: number }
}

interface DnsRecord {
  id: string
  zoneId: string
  type: string
  name: string
  value: string
  ttl: number
  priority: number | null
  active: boolean
}

interface Provider {
  id: string
  type: string
  alias: string
  account: string | null
  brand: string
  status: boolean
  permission: string
  isBuiltIn: boolean
  domainCount: number
}

interface LogEntry {
  id: string
  action: string
  target: string | null
  metadata: string | null
  createdAt: string
  user: { email: string; name: string | null } | null
}

const TYPE_COLORS: Record<string, string> = {
  A:     "text-sky-500 border-sky-500/30 bg-sky-500/10",
  AAAA:  "text-indigo-500 border-indigo-500/30 bg-indigo-500/10",
  CNAME: "text-purple-500 border-purple-500/30 bg-purple-500/10",
  MX:    "text-amber-500 border-amber-500/30 bg-amber-500/10",
  TXT:   "text-emerald-500 border-emerald-500/30 bg-emerald-500/10",
  NS:    "text-rose-500 border-rose-500/30 bg-rose-500/10",
  SRV:   "text-cyan-500 border-cyan-500/30 bg-cyan-500/10",
}

type Tab = "domains" | "providers" | "logs"

export default function DnsPage() {
  const confirm = useConfirm()
  const [tab, setTab] = useState<Tab>("domains")

  // Domain management
  const [zones, setZones] = useState<Zone[]>([])
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null)
  const [records, setRecords] = useState<DnsRecord[]>([])

  // Providers
  const [providers, setProviders] = useState<Provider[]>([])
  const [showProviderDialog, setShowProviderDialog] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)

  // Logs
  const [logs, setLogs] = useState<LogEntry[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [provisionWarn, setProvisionWarn] = useState("")
  const [checkResult, setCheckResult] = useState<{ ok: boolean; output?: string; error?: string } | null>(null)
  const [showCreateZone, setShowCreateZone] = useState(false)
  const [showCreateRecord, setShowCreateRecord] = useState(false)

  // ── Fetchers ──────────────────────────────────────────────────────
  const fetchZones = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/dns/zones")
      const data = await safeJson(res)
      setZones(data.zones ?? [])
    } catch {
      setError("Error al cargar las zonas DNS")
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchRecords = useCallback(async (zoneId: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/dns/zones/${zoneId}/records`)
      const data = await safeJson(res)
      setRecords(data.records ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchProviders = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/dns/providers")
      const data = await safeJson(res)
      setProviders(data.providers ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/dns/logs")
      const data = await safeJson(res)
      setLogs(data.logs ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === "domains" && !selectedZone) fetchZones()
    if (tab === "providers") fetchProviders()
    if (tab === "logs") fetchLogs()
  }, [tab, selectedZone, fetchZones, fetchProviders, fetchLogs])

  useEffect(() => {
    if (selectedZone) fetchRecords(selectedZone.id)
  }, [selectedZone, fetchRecords])

  function warnIfNotProvisioned(json: { provisioned?: boolean; provisionError?: string }) {
    if (json.provisioned === false) {
      setProvisionWarn(
        json.provisionError === "Agent no disponible"
          ? "Guardado en DB. El agent no está disponible — el provider no fue actualizado."
          : `Guardado en DB, pero el provider reportó: ${json.provisionError}`
      )
    }
  }

  // ── Zone handlers ─────────────────────────────────────────────────
  async function handleCreateZone(data: { domain: string; primaryNs?: string; adminEmail?: string; serverIp?: string; providerId?: string }) {
    const res = await fetch("/api/dns/zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    const json = await safeJson(res)
    if (!res.ok) throw new Error(json.error ?? "Error al crear zona")
    warnIfNotProvisioned(json)
    await fetchZones()
  }

  async function handleDeleteZone(zone: Zone) {
    if (!(await confirm(`¿Eliminar la zona ${zone.domain} y todos sus registros?`))) return
    await fetch(`/api/dns/zones/${zone.id}`, { method: "DELETE" })
    if (selectedZone?.id === zone.id) setSelectedZone(null)
    await fetchZones()
  }

  async function handleToggleZone(zone: Zone) {
    await fetch(`/api/dns/zones/${zone.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !zone.active }),
    })
    await fetchZones()
  }

  async function handleCreateRecord(data: { type: string; name: string; value: string; ttl: number; priority?: number }) {
    if (!selectedZone) return
    const res = await fetch(`/api/dns/zones/${selectedZone.id}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    const json = await safeJson(res)
    if (!res.ok) throw new Error(json.error ?? "Error al crear registro")
    warnIfNotProvisioned(json)
    await fetchRecords(selectedZone.id)
  }

  async function handleDeleteRecord(rec: DnsRecord) {
    if (!(await confirm(`¿Eliminar el registro ${rec.type} ${rec.name}?`))) return
    await fetch(`/api/dns/records/${rec.id}`, { method: "DELETE" })
    if (selectedZone) await fetchRecords(selectedZone.id)
  }

  async function handleToggleRecord(rec: DnsRecord) {
    await fetch(`/api/dns/records/${rec.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !rec.active }),
    })
    if (selectedZone) await fetchRecords(selectedZone.id)
  }

  async function handleCheckZone() {
    if (!selectedZone) return
    setCheckResult(null)
    const res = await fetch(`/api/dns/zones/${selectedZone.id}/check`, { method: "POST" })
    const json = await safeJson(res)
    setCheckResult(json)
  }

  // ── Provider handlers ─────────────────────────────────────────────
  async function handleToggleProvider(p: Provider) {
    await fetch(`/api/dns/providers/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: !p.status }),
    })
    await fetchProviders()
  }

  async function handleDeleteProvider(p: Provider) {
    if (p.isBuiltIn) return
    if (!(await confirm(`¿Eliminar el provider "${p.alias}"?`))) return
    const res = await fetch(`/api/dns/providers/${p.id}`, { method: "DELETE" })
    const json = await safeJson(res)
    if (!res.ok) {
      alert(json.error ?? "No se pudo eliminar")
      return
    }
    await fetchProviders()
  }

  // ─── Vista detalle de zona (dentro de tab "domains") ──────────────
  if (tab === "domains" && selectedZone) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => { setSelectedZone(null); setCheckResult(null) }}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold font-mono">{selectedZone.domain}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Serial {selectedZone.serial} · TTL {selectedZone.defaultTtl}s
                {selectedZone.provider && <> · Provider: <span className="text-foreground">{selectedZone.provider.alias}</span></>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-primary" onClick={handleCheckZone}>
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />Validar zona
            </Button>
            <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground" onClick={() => fetchRecords(selectedZone.id)} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" className="bg-primary hover:bg-primary/90 h-8" onClick={() => setShowCreateRecord(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />Nuevo registro
            </Button>
          </div>
        </div>

        {provisionWarn && <ProvisionBanner text={provisionWarn} onClose={() => setProvisionWarn("")} />}

        {checkResult && (
          <div className={`rounded-lg px-4 py-3 border ${checkResult.ok ? "bg-green-500/10 border-green-500/20" : "bg-destructive/10 border-destructive/20"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0">
                {checkResult.ok ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />}
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${checkResult.ok ? "text-green-600" : "text-destructive"}`}>
                    {checkResult.ok ? "Zona válida" : "Zona inválida"}
                  </p>
                  {(checkResult.output || checkResult.error) && (
                    <pre className="text-[11px] font-mono mt-2 text-muted-foreground whitespace-pre-wrap break-all">{checkResult.output ?? checkResult.error}</pre>
                  )}
                </div>
              </div>
              <button onClick={() => setCheckResult(null)} className="text-muted-foreground hover:text-foreground shrink-0"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {records.length === 0 ? (
          <EmptyState icon={<Server className="w-6 h-6 text-muted-foreground" />} title="No hay registros en esta zona" subtitle="Agrega registros A, MX, TXT, CNAME, etc." actionLabel="Agregar primer registro" onAction={() => setShowCreateRecord(true)} />
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <Th className="w-20">Tipo</Th>
                  <Th>Nombre</Th>
                  <Th>Valor</Th>
                  <Th className="text-center w-20">TTL</Th>
                  <Th className="text-center w-20">Prio</Th>
                  <Th className="text-right w-24">Acciones</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((r) => (
                  <tr key={r.id} className={`hover:bg-secondary/20 transition-colors ${!r.active ? "opacity-50" : ""}`}>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 text-[11px] font-mono font-semibold rounded border ${TYPE_COLORS[r.type] ?? "border-border"}`}>{r.type}</span>
                    </td>
                    <td className="px-4 py-3"><span className="text-sm font-mono">{r.name}</span></td>
                    <td className="px-4 py-3"><span className="text-xs font-mono text-muted-foreground break-all">{r.value}</span></td>
                    <td className="px-4 py-3 text-center"><span className="text-xs text-muted-foreground">{r.ttl}</span></td>
                    <td className="px-4 py-3 text-center"><span className="text-xs text-muted-foreground">{r.priority ?? "–"}</span></td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={() => handleToggleRecord(r)} title={r.active ? "Deshabilitar" : "Habilitar"}><Power className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteRecord(r)} title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showCreateRecord && (
          <CreateRecordDialog defaultTtl={selectedZone.defaultTtl} onClose={() => setShowCreateRecord(false)} onCreate={handleCreateRecord} />
        )}
      </div>
    )
  }

  // ─── Header con tabs ──────────────────────────────────────────────
  const headerActions = (() => {
    if (tab === "domains") {
      return (
        <Button size="sm" className="bg-primary hover:bg-primary/90 h-8" onClick={() => setShowCreateZone(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />Nueva zona
        </Button>
      )
    }
    if (tab === "providers") {
      return (
        <Button size="sm" className="bg-primary hover:bg-primary/90 h-8" onClick={() => { setEditingProvider(null); setShowProviderDialog(true) }}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />Integrar DNS Provider API
        </Button>
      )
    }
    return null
  })()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">DNS</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestión unificada de zonas DNS y proveedores externos</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost" size="icon"
            className="w-8 h-8 text-muted-foreground"
            onClick={() => {
              if (tab === "domains") fetchZones()
              if (tab === "providers") fetchProviders()
              if (tab === "logs") fetchLogs()
            }}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {headerActions}
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {([
          { key: "domains",   label: "Domain Management" },
          { key: "providers", label: "Provider List" },
          { key: "logs",      label: "Logs" },
        ] as { key: Tab; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {provisionWarn && <ProvisionBanner text={provisionWarn} onClose={() => setProvisionWarn("")} />}

      {/* ── Tab: Domain Management ───────────────────────────────── */}
      {tab === "domains" && (
        loading ? (
          <SkeletonRows />
        ) : zones.length === 0 ? (
          <EmptyState icon={<Server className="w-6 h-6 text-muted-foreground" />} title="No hay zonas DNS configuradas" subtitle='Crea tu primera zona con el botón "Nueva zona"' actionLabel="Crear primera zona" onAction={() => setShowCreateZone(true)} />
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <Th>Dominio</Th>
                  <Th>Provider</Th>
                  <Th>NS primario</Th>
                  <Th className="text-center">Registros</Th>
                  <Th className="text-center">Estado</Th>
                  <Th className="text-right">Acciones</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {zones.map((z) => (
                  <tr key={z.id} className="hover:bg-secondary/20 transition-colors cursor-pointer" onClick={() => setSelectedZone(z)}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                          <Globe className="w-3 h-3 text-primary" />
                        </div>
                        <span className="text-sm font-mono font-medium">{z.domain}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {z.provider ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-border text-muted-foreground">
                          <Cloud className="w-3 h-3" />{z.provider.alias}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5"><span className="text-xs font-mono text-muted-foreground">{z.primaryNs}</span></td>
                    <td className="px-4 py-3.5 text-center"><span className="text-xs text-muted-foreground">{z._count?.records ?? 0}</span></td>
                    <td className="px-4 py-3.5 text-center">
                      {z.active
                        ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3 h-3" />Activa</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="w-3 h-3" />Inactiva</span>}
                    </td>
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={() => handleToggleZone(z)} title={z.active ? "Deshabilitar" : "Habilitar"}><Power className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteZone(z)} title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Tab: Provider List ──────────────────────────────────── */}
      {tab === "providers" && (
        <>
          <div className="bg-secondary/30 border border-border rounded-lg px-4 py-3 flex items-center gap-2">
            <Cloud className="w-4 h-4 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">
              Centro de gestión de proveedores DNS — integra cuentas de Cloudflare, Route53, GoDaddy, etc. sin salir del panel.
            </p>
          </div>

          {loading ? <SkeletonRows /> : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <Th>Alias</Th>
                    <Th>Account</Th>
                    <Th>Brand</Th>
                    <Th className="text-center">Status</Th>
                    <Th>Permission</Th>
                    <Th className="text-center">Domains</Th>
                    <Th className="text-right">Operate</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {providers.map((p) => (
                    <tr key={p.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="text-sm font-medium text-primary">{p.alias}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-mono text-muted-foreground">
                          {p.account ? `${p.account.slice(0, Math.min(8, p.account.length))}***` : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5"><span className="text-xs text-muted-foreground">{p.brand}</span></td>
                      <td className="px-4 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleProvider(p)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${p.status ? "bg-primary" : "bg-muted"}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${p.status ? "translate-x-5" : "translate-x-1"}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3.5"><span className="text-xs text-muted-foreground">{p.permission}</span></td>
                      <td className="px-4 py-3.5 text-center"><span className="text-xs text-muted-foreground">{p.domainCount}</span></td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {!p.isBuiltIn && (
                            <Button
                              variant="ghost" size="icon"
                              className="w-7 h-7 text-muted-foreground hover:text-primary"
                              title="Editar"
                              onClick={() => { setEditingProvider(p); setShowProviderDialog(true) }}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {!p.isBuiltIn && (
                            <Button
                              variant="ghost" size="icon"
                              className="w-7 h-7 text-muted-foreground hover:text-destructive"
                              title="Eliminar"
                              onClick={() => handleDeleteProvider(p)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {p.isBuiltIn && <span className="text-[11px] text-muted-foreground italic">built-in</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Tab: Logs ──────────────────────────────────────────── */}
      {tab === "logs" && (
        loading ? <SkeletonRows /> : logs.length === 0 ? (
          <EmptyState icon={<FileText className="w-6 h-6 text-muted-foreground" />} title="No hay actividad de DNS registrada" subtitle="Las acciones sobre zonas, registros y providers aparecerán aquí." />
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <Th>Fecha</Th>
                  <Th>Acción</Th>
                  <Th>Target</Th>
                  <Th>Usuario</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-5 py-3 text-xs text-muted-foreground font-mono">{new Date(l.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3"><span className="text-xs font-mono text-foreground">{l.action}</span></td>
                    <td className="px-4 py-3"><span className="text-xs font-mono text-muted-foreground">{l.target ?? "—"}</span></td>
                    <td className="px-4 py-3"><span className="text-xs text-muted-foreground">{l.user?.email ?? "—"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {showCreateZone && (
        <CreateZoneDialog onClose={() => setShowCreateZone(false)} onCreate={handleCreateZone} />
      )}
      {showProviderDialog && (
        <ProviderDialog
          existing={editingProvider}
          onClose={() => { setShowProviderDialog(false); setEditingProvider(null) }}
          onSaved={fetchProviders}
        />
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────
function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3 first:pl-5 last:pr-5 ${className}`}>
      {children}
    </th>
  )
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-card border border-border rounded-lg p-4 h-12 animate-pulse" />
      ))}
    </div>
  )
}

function ProvisionBanner({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-600">{text}</p>
      </div>
      <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0"><X className="w-4 h-4" /></button>
    </div>
  )
}

function EmptyState({ icon, title, subtitle, actionLabel, onAction }: {
  icon: React.ReactNode; title: string; subtitle: string; actionLabel?: string; onAction?: () => void
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-12 flex flex-col items-center gap-4">
      <div className="w-12 h-12 rounded-lg bg-muted border border-border flex items-center justify-center">{icon}</div>
      <div className="text-center">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </div>
      {actionLabel && onAction && (
        <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={onAction}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />{actionLabel}
        </Button>
      )}
    </div>
  )
}
