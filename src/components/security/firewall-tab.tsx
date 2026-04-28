"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AddRuleDialog } from "@/components/security/add-rule-dialog"
import { Toggle } from "@/components/security/toggle"
import { useToast } from "@/hooks/use-toast"
import { Search, Plus, Upload, Download, Trash2 } from "lucide-react"
import { safeJson } from "@/lib/utils"

interface Rule {
  id: string
  kind: string
  protocol: string
  port: string | null
  sourceIp: string | null
  direction: string
  strategy: string
  remark: string | null
  active: boolean
  createdAt: string
}

type SubTab = "port" | "ip" | "forward" | "area"
type DirFilter = "all" | "inbound" | "outbound"

export function FirewallTab() {
  const { toast } = useToast()
  const [enabled, setEnabled] = useState(false)
  const [blockIcmp, setBlockIcmp] = useState(false)
  const [listening, setListening] = useState<number[]>([])
  const [agentUp, setAgentUp] = useState(true)

  const [subTab, setSubTab] = useState<SubTab>("port")
  const [direction, setDirection] = useState<DirFilter>("all")
  const [search, setSearch] = useState("")
  const [rules, setRules] = useState<Rule[]>([])
  const [counts, setCounts] = useState({ port: 0, ip: 0, forward: 0, area: 0 })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const loadStatus = useCallback(async () => {
    const [s, settings] = await Promise.all([
      fetch("/api/security/firewall/status").then(safeJson),
      fetch("/api/security/firewall/settings").then(safeJson),
    ])
    setEnabled(!!settings.enabled)
    setBlockIcmp(!!settings.blockIcmp)
    setAgentUp(!!s.agentAvailable)
    setListening(Array.isArray(s.listeningPorts) ? s.listeningPorts : [])
  }, [])

  const loadRules = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ kind: subTab, direction })
    const data = await fetch(`/api/security/firewall/rules?${params}`).then(safeJson)
    setRules(data.rules ?? [])

    const [p, i, f, a] = await Promise.all([
      fetch("/api/security/firewall/rules?kind=port").then(safeJson),
      fetch("/api/security/firewall/rules?kind=ip").then(safeJson),
      fetch("/api/security/firewall/rules?kind=forward").then(safeJson),
      fetch("/api/security/firewall/rules?kind=area").then(safeJson),
    ])
    setCounts({
      port: p.rules?.length ?? 0,
      ip: i.rules?.length ?? 0,
      forward: f.rules?.length ?? 0,
      area: a.rules?.length ?? 0,
    })
    setLoading(false)
  }, [subTab, direction])

  useEffect(() => { loadStatus() }, [loadStatus])
  useEffect(() => { loadRules() }, [loadRules])

  const patchSettings = async (patch: Record<string, unknown>) => {
    const res = await fetch("/api/security/firewall/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const data = await safeJson(res)
      toast({ variant: "destructive", title: "No se pudo aplicar", description: data.error || "Error al actualizar" })
      await loadStatus()
      return
    }
    await loadStatus()
  }

  const deleteRule = async (id: string) => {
    if (!confirm("¿Eliminar esta regla?")) return
    const res = await fetch(`/api/security/firewall/rules/${id}`, { method: "DELETE" })
    if (!res.ok) {
      const d = await safeJson(res)
      toast({ variant: "destructive", title: "No se pudo eliminar", description: d.error || "Error" })
    }
    await loadRules()
  }

  const filtered = rules.filter((r) => {
    if (!search) return true
    return (r.port ?? "").includes(search) || (r.sourceIp ?? "").includes(search)
  })

  return (
    <div className="space-y-4">
      {!agentUp && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          <strong className="text-amber-500">Entorno de desarrollo:</strong>{" "}
          <span className="text-muted-foreground">
            el agente no puede acceder a UFW/iptables. En producción (Linux con el agente como root) este módulo funcionará sin cambios.
          </span>
        </div>
      )}

      {/* Header controls */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">Activar Firewall</span>
          <Toggle
            checked={enabled}
            onChange={(v) => { setEnabled(v); patchSettings({ enabled: v }) }}
            disabled={!agentUp}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm">Bloquear ICMP</span>
          <Toggle
            checked={blockIcmp}
            onChange={(v) => { setBlockIcmp(v); patchSettings({ blockIcmp: v }) }}
            disabled={!agentUp || !enabled}
          />
        </div>
      </div>

      {/* Sub-tabs for rule types */}
      <div className="flex gap-2">
        {([
          { id: "port", label: `Reglas de puerto: ${counts.port}` },
          { id: "ip", label: `Reglas de IP: ${counts.ip}` },
          { id: "forward", label: `Port forward: ${counts.forward}` },
          { id: "area", label: `Reglas de área: ${counts.area}` },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
              subTab === t.id
                ? "bg-accent/10 border-accent text-accent"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Actions + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setDialogOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-1" /> Agregar regla
        </Button>
        <Button variant="outline" disabled><Upload className="w-4 h-4 mr-1" /> Importar</Button>
        <Button variant="outline" disabled><Download className="w-4 h-4 mr-1" /> Exportar</Button>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(["all", "inbound", "outbound"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDirection(d)}
                className={`px-3 py-1.5 text-xs ${
                  direction === d ? "bg-accent/10 text-accent" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {d === "all" ? "Todas" : d === "inbound" ? "Entrante" : "Saliente"}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar puerto..."
              className="pl-8 w-64"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card/40 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b border-border">
            <tr>
              <th className="text-left px-4 py-3">Protocolo</th>
              <th className="text-left px-4 py-3">Puerto</th>
              <th className="text-left px-4 py-3">Estado</th>
              <th className="text-left px-4 py-3">Estrategia</th>
              <th className="text-left px-4 py-3">Dirección</th>
              <th className="text-left px-4 py-3">IP origen</th>
              <th className="text-left px-4 py-3">Nota</th>
              <th className="text-left px-4 py-3">Fecha</th>
              <th className="text-right px-4 py-3">Acción</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Cargando...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Sin reglas</td></tr>
            )}
            {!loading && filtered.map((r) => {
              const isListening = r.port && listening.includes(parseInt(r.port, 10))
              return (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 uppercase">{r.protocol}</td>
                  <td className="px-4 py-3 font-mono">{r.port ?? "—"}</td>
                  <td className="px-4 py-3">
                    {r.kind === "port" ? (
                      <span className={isListening ? "text-emerald-500" : "text-muted-foreground"}>
                        {isListening ? "Escuchando" : "No escucha"}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={r.strategy === "allow" ? "text-emerald-500" : "text-destructive"}>
                      {r.strategy === "allow" ? "Permitir" : "Denegar"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{r.direction === "inbound" ? "Entrante" : "Saliente"}</td>
                  <td className="px-4 py-3">{r.sourceIp ?? "Todas"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.remark ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deleteRule(r.id)}
                      className="text-destructive hover:text-destructive/80"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <AddRuleDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        kind={subTab}
        onCreated={() => { setDialogOpen(false); loadRules() }}
      />
    </div>
  )
}
