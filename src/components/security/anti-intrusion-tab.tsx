"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import {
  RefreshCw, Camera, FileWarning, Terminal, Network,
  FileClock, Bug, X, Shield, CheckCircle2,
} from "lucide-react"

async function safeJson(res: Response) {
  const text = await res.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { return {} }
}

interface Finding {
  id: string
  type: string
  severity: string
  title: string
  description: string | null
  path: string | null
  extra: string | null
  createdAt: string
}

interface Scan {
  lastScanAt: string | null
  durationMs: number
  status: string
  error: string | null
  totalFindings: number
}

interface Data {
  scan: Scan
  findings: Finding[]
  baselineCount: number
  byType: Record<string, number>
}

const TYPE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  "file-change": { label: "Archivos críticos modificados", icon: FileWarning },
  "suspicious-process": { label: "Procesos sospechosos", icon: Terminal },
  "unusual-port": { label: "Puertos inusuales", icon: Network },
  "recent-change": { label: "Cambios recientes", icon: FileClock },
  "rootkit": { label: "Rootkits", icon: Bug },
}

export function AntiIntrusionTab() {
  const { toast } = useToast()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [baselining, setBaselining] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const d = await fetch("/api/security/intrusion").then(safeJson)
    setData(d as Data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const showErr = (d: string) => toast({ variant: "destructive", title: "Error", description: d })

  const createBaseline = async () => {
    setBaselining(true)
    const res = await fetch("/api/security/intrusion/baseline", { method: "POST" })
    const d = await safeJson(res)
    setBaselining(false)
    if (!res.ok) { showErr(d.error || "Error"); return }
    toast({ title: "Baseline creada", description: `${d.count} archivos registrados` })
    await load()
  }

  const runScan = async () => {
    setScanning(true)
    const res = await fetch("/api/security/intrusion/scan", { method: "POST" })
    const d = await safeJson(res)
    setScanning(false)
    if (!res.ok) { showErr(d.error || "Error"); return }
    toast({
      title: "Escaneo completado",
      description: `${d.findingCount} hallazgos${d.chkrootkitInstalled ? "" : " — chkrootkit no instalado"}`,
    })
    await load()
  }

  const dismiss = async (id: string) => {
    await fetch(`/api/security/intrusion/findings/${id}`, { method: "DELETE" })
    await load()
  }

  if (loading) return <div className="text-sm text-muted-foreground py-8 text-center">Cargando...</div>
  if (!data?.scan) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
        <p className="text-destructive font-semibold">No se pudo cargar Anti Intrusion</p>
        <p className="text-xs text-muted-foreground mt-1">Verifica que el agente esté corriendo y que la migración Prisma se haya aplicado.</p>
      </div>
    )
  }

  const types = Object.keys(TYPE_META)

  return (
    <div className="space-y-4">
      {/* Top controls */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card/40 px-4 py-3">
        <Shield className="w-4 h-4 text-muted-foreground" />
        <div className="text-sm flex-1">
          <div>Detección de intrusión: integridad de archivos, procesos sospechosos, puertos inusuales y rootkits.</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Baseline: <strong>{data.baselineCount}</strong> archivos registrados
            {data.scan.lastScanAt && (
              <> • Último escaneo: {new Date(data.scan.lastScanAt).toLocaleString()} ({(data.scan.durationMs / 1000).toFixed(1)}s)</>
            )}
          </div>
        </div>
        <Button variant="outline" onClick={createBaseline} disabled={baselining}>
          <Camera className={`w-3.5 h-3.5 mr-1.5 ${baselining ? "animate-spin" : ""}`} />
          {baselining ? "Capturando..." : "Crear baseline"}
        </Button>
        <Button onClick={runScan} disabled={scanning} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Escaneando..." : "Escanear ahora"}
        </Button>
      </div>

      {data.baselineCount === 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          <strong className="text-amber-500">Sin baseline:</strong>{" "}
          <span className="text-muted-foreground">
            crea una baseline de archivos críticos antes del primer escaneo para poder detectar modificaciones.
          </span>
        </div>
      )}

      {/* Stats by type */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {types.map((t) => {
          const meta = TYPE_META[t]
          const count = data.byType[t] || 0
          const Icon = meta.icon
          return (
            <div key={t} className="rounded-lg border border-border bg-card/40 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">{meta.label}</div>
                  <div className={`text-2xl font-bold mt-1 ${count > 0 ? "text-destructive" : "text-emerald-500"}`}>
                    {count}
                  </div>
                </div>
                <Icon className="w-5 h-5 text-muted-foreground" />
              </div>
            </div>
          )
        })}
      </div>

      {/* Findings list */}
      <div className="rounded-lg border border-border bg-card/40">
        <h3 className="text-sm font-semibold px-4 py-3 border-b border-border">Hallazgos</h3>
        {data.findings.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            <div className="text-sm">Sin hallazgos</div>
            <div className="text-xs text-muted-foreground">
              {data.scan.lastScanAt ? "El último escaneo no detectó problemas" : "Aún no se ha ejecutado un escaneo"}
            </div>
          </div>
        ) : (
          data.findings.map((f) => {
            const meta = TYPE_META[f.type] ?? { label: f.type, icon: FileWarning }
            const Icon = meta.icon
            return (
              <div key={f.id} className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0">
                <Icon className="w-4 h-4 mt-1 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <SeverityBadge severity={f.severity} />
                    <span className="text-[10px] text-muted-foreground">{meta.label}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(f.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="text-sm font-semibold mt-1">{f.title}</div>
                  {f.description && <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>}
                  {f.path && <p className="text-xs font-mono text-muted-foreground mt-0.5 break-all">{f.path}</p>}
                </div>
                <button
                  onClick={() => dismiss(f.id)}
                  className="text-muted-foreground hover:text-foreground"
                  title="Descartar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-amber-500/20 text-amber-500 border border-amber-500/30",
    high: "bg-destructive/20 text-destructive border border-destructive/30",
  }
  const label = { low: "Bajo", medium: "Medio", high: "Alto" }
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${colors[severity as keyof typeof colors] ?? colors.medium}`}>
      {label[severity as keyof typeof label] ?? severity}
    </span>
  )
}
