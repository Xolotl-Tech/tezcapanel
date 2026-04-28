"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import {
  RefreshCw, ShieldCheck, Wrench, CheckCircle2, XCircle,
  Network, Cpu, HardDrive,
} from "lucide-react"
import { safeJson } from "@/lib/utils"

interface Item {
  category: string
  id: string
  label: string
  description: string
  type: string
  key?: string
  path?: string
  expected: string
  severity: string
  current: string | null
  ok: boolean
}

const CATEGORY_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  network: { label: "Red (sysctl)", icon: Network },
  kernel: { label: "Kernel", icon: Cpu },
  filesystem: { label: "Sistema de archivos", icon: HardDrive },
}

export function SystemHardeningTab() {
  const { toast } = useToast()
  const [items, setItems] = useState<Item[]>([])
  const [agentUp, setAgentUp] = useState(true)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const d = await fetch("/api/security/hardening").then(safeJson)
    setAgentUp(!!d.agentAvailable)
    setItems(d.items ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const showErr = (description: string) =>
    toast({ variant: "destructive", title: "Error", description })

  const apply = async (id: string) => {
    setApplying(id)
    const res = await fetch("/api/security/hardening/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    const d = await safeJson(res)
    setApplying(null)
    if (!res.ok) { showErr(d.error || "Error"); return }
    toast({ title: "Aplicado", description: id })
    await load()
  }

  const applyAll = async () => {
    if (!confirm("¿Aplicar todas las recomendaciones? Esto modificará sysctl y archivos de sistema.")) return
    setApplying("__all__")
    const res = await fetch("/api/security/hardening/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    })
    const d = await safeJson(res)
    setApplying(null)
    if (!res.ok) { showErr(d.error || "Error"); return }
    toast({ title: "Hardening aplicado", description: "Configuración guardada en /etc/sysctl.d/99-tezcapanel-hardening.conf" })
    await load()
  }

  if (loading) return <div className="text-sm text-muted-foreground py-8 text-center">Cargando...</div>

  const okCount = items.filter((i) => i.ok).length
  const total = items.length
  const score = total > 0 ? Math.round((okCount / total) * 100) : 0
  const scoreColor = score >= 80 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-destructive"

  const grouped: Record<string, Item[]> = {}
  for (const it of items) {
    if (!grouped[it.category]) grouped[it.category] = []
    grouped[it.category].push(it)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card/40 px-4 py-3">
        <ShieldCheck className="w-5 h-5 text-muted-foreground" />
        <div className="flex-1">
          <div className="text-sm">Endurecimiento del sistema (kernel, red, filesystem)</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Cambios persisten en <code className="text-foreground bg-background/50 px-1 rounded">/etc/sysctl.d/99-tezcapanel-hardening.conf</code>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold ${scoreColor}`}>{score}/100</div>
          <div className="text-xs text-muted-foreground">{okCount}/{total} aplicados</div>
        </div>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Actualizar
        </Button>
        <Button
          onClick={applyAll}
          disabled={!agentUp || applying !== null}
          className="bg-accent text-accent-foreground hover:bg-accent/90"
        >
          <Wrench className="w-3.5 h-3.5 mr-1.5" />
          {applying === "__all__" ? "Aplicando..." : "Aplicar todo"}
        </Button>
      </div>

      {!agentUp && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          <strong className="text-amber-500">Agente no disponible:</strong>{" "}
          <span className="text-muted-foreground">no se puede leer ni aplicar configuraciones.</span>
        </div>
      )}

      {/* Categories */}
      {Object.entries(grouped).map(([cat, list]) => {
        const meta = CATEGORY_META[cat] ?? { label: cat, icon: Cpu }
        const Icon = meta.icon
        return (
          <div key={cat} className="rounded-lg border border-border bg-card/40">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Icon className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{meta.label}</h3>
              <span className="text-xs text-muted-foreground ml-auto">
                {list.filter((i) => i.ok).length}/{list.length} aplicados
              </span>
            </div>
            {list.map((it) => (
              <div key={it.id} className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0">
                {it.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{it.label}</div>
                  <p className="text-xs text-muted-foreground mt-0.5">{it.description}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs">
                    {it.key && <span className="font-mono text-muted-foreground">{it.key}</span>}
                    {it.path && <span className="font-mono text-muted-foreground">{it.path}</span>}
                    <span className="text-muted-foreground">
                      Esperado: <span className="font-mono text-foreground">{it.expected}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Actual: <span className={`font-mono ${it.ok ? "text-emerald-500" : "text-destructive"}`}>{it.current ?? "—"}</span>
                    </span>
                  </div>
                </div>
                {!it.ok && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!agentUp || applying === it.id}
                    onClick={() => apply(it.id)}
                  >
                    {applying === it.id ? "Aplicando..." : "Aplicar"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
