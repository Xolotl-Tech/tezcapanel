"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import {
  Timer, Globe, Database, AlertTriangle, Zap, RefreshCw, Code2, FileText,
  ShieldAlert, Archive, KeyRound, FileSearch, X, ChevronRight,
} from "lucide-react"
import { safeJson } from "@/lib/utils"

interface Scan {
  score: number
  durationMs: number
  xssCount: number
  sqlCount: number
  maliciousCount: number
  phpAttackCount: number
  topIps: { ip: string; visits: number }[]
  lastScanAt: string | null
  status: string
  error: string | null
}

interface Category {
  id: string
  label: string
  riskCount: number
}

interface Risk {
  id: string
  severity: string
  title: string
  description: string | null
  affectedPath: string | null
  domain: string | null
  createdAt: string
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  config: Code2,
  "file-leak": FileText,
  webshell: ShieldAlert,
  backup: Archive,
  "weak-password": KeyRound,
  logs: FileSearch,
}

function ScoreGauge({ score }: { score: number }) {
  const R = 80
  const CIRC = Math.PI * R
  const offset = CIRC * (1 - score / 100)
  const color = score >= 80 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-destructive"
  return (
    <div className="flex flex-col items-center">
      <svg width="220" height="130" viewBox="0 0 220 130">
        <path d="M 30 110 A 80 80 0 0 1 190 110" stroke="currentColor" strokeWidth="14" fill="none" className="text-muted/40" />
        <path
          d="M 30 110 A 80 80 0 0 1 190 110"
          stroke="currentColor"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          className={color}
          style={{ transition: "stroke-dashoffset 0.6s" }}
        />
      </svg>
      <div className={`text-4xl font-bold -mt-6 ${color}`}>{score}</div>
      <div className="text-xs text-muted-foreground mt-1">Score</div>
    </div>
  )
}

export function WebsiteSecurityTab() {
  const { toast } = useToast()
  const [scan, setScan] = useState<Scan | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [openCategory, setOpenCategory] = useState<string | null>(null)
  const [categoryRisks, setCategoryRisks] = useState<Risk[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const data = await fetch("/api/security/website").then(safeJson)
    if (data.scan) {
      setScan({ ...data.scan, topIps: data.scan.topIps ?? [] })
      setCategories(data.categories ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const runScan = async () => {
    setScanning(true)
    const res = await fetch("/api/security/website/scan", { method: "POST" })
    const d = await safeJson(res)
    setScanning(false)
    if (!res.ok) {
      toast({ variant: "destructive", title: "Escaneo fallido", description: d.error || "Error" })
      await load()
      return
    }
    toast({ title: "Escaneo completado", description: `Score: ${d.scan.score} — ${d.riskCount} riesgos` })
    await load()
  }

  const openCategoryDetails = async (id: string) => {
    setOpenCategory(id)
    setCategoryRisks([])
    const d = await fetch(`/api/security/website/risks/${id}`).then(safeJson)
    setCategoryRisks(d.risks ?? [])
  }

  if (loading) return <div className="text-sm text-muted-foreground py-8 text-center">Cargando...</div>
  if (!scan) return <div className="text-sm text-muted-foreground py-8 text-center">Sin datos</div>

  return (
    <div className="space-y-4">
      {/* Top: last scan + button */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card/40 px-4 py-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Último escaneo: </span>
          <span>{scan.lastScanAt ? new Date(scan.lastScanAt).toLocaleString() : "Nunca"}</span>
        </div>
        {scan.status === "running" && (
          <span className="text-xs text-amber-500">Escaneo en curso...</span>
        )}
        <div className="ml-auto">
          <Button
            onClick={runScan}
            disabled={scanning}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? "Escaneando..." : "Escanear ahora"}
          </Button>
        </div>
      </div>

      {/* Score + Top IPs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card/40 p-6">
          <h3 className="text-sm font-semibold mb-4">Puntaje de seguridad del sitio</h3>
          <ScoreGauge score={scan.score} />
          <div className="flex justify-center mt-2">
            <span className="text-xs text-muted-foreground">
              {scan.score >= 80 ? "Seguro" : scan.score >= 50 ? "Medio" : "Inseguro"}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card/40 p-6">
          <h3 className="text-sm font-semibold mb-4">IPs (Top 5)</h3>
          {scan.topIps.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12">Sin datos</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr><th className="text-left py-2">IP</th><th className="text-right py-2">Visitas</th></tr>
              </thead>
              <tbody>
                {scan.topIps.map((t, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-2 font-mono">{t.ip}</td>
                    <td className="py-2 text-right">{t.visits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={Timer} title="Duración" value={`${(scan.durationMs / 1000).toFixed(1)}s`} subtitle="Duración del escaneo" />
        <StatCard icon={Globe} title="XSS" value={scan.xssCount} subtitle="Intentos XSS" />
        <StatCard icon={Database} title="SQL" value={scan.sqlCount} subtitle="Intentos SQL injection" />
        <StatCard icon={AlertTriangle} title="Escaneos maliciosos" value={scan.maliciousCount} subtitle="Escaneos maliciosos" />
        <StatCard icon={Zap} title="Ataques PHP" value={scan.phpAttackCount} subtitle="Ataques a PHP" />
      </div>

      {/* Security items */}
      <div className="rounded-lg border border-border bg-card/40">
        <h3 className="text-sm font-semibold px-4 py-3 border-b border-border">Items de seguridad</h3>
        <div>
          {categories.map((c) => {
            const Icon = CATEGORY_ICONS[c.id] ?? Code2
            return (
              <button
                key={c.id}
                onClick={() => openCategoryDetails(c.id)}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/30 transition-colors text-left"
              >
                <Icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm flex-1">{c.label}</span>
                {c.riskCount > 0 ? (
                  <span className="text-xs text-destructive">{c.riskCount} riesgos</span>
                ) : (
                  <span className="text-xs text-emerald-500">Sin riesgos</span>
                )}
                <span className="text-xs text-muted-foreground flex items-center">
                  Detalles <ChevronRight className="w-3 h-3" />
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {openCategory && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-3xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-sm font-semibold">
                {categories.find((c) => c.id === openCategory)?.label}
              </h2>
              <button onClick={() => setOpenCategory(null)}><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {categoryRisks.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">Sin riesgos detectados</div>
              ) : (
                categoryRisks.map((r) => (
                  <div key={r.id} className="rounded-lg border border-border bg-background/40 p-4">
                    <div className="flex items-start gap-2">
                      <SeverityBadge severity={r.severity} />
                      <div className="flex-1">
                        <div className="text-sm font-semibold">{r.title}</div>
                        {r.description && <p className="text-xs text-muted-foreground mt-1">{r.description}</p>}
                        {r.affectedPath && (
                          <p className="text-xs font-mono text-muted-foreground mt-1 break-all">{r.affectedPath}</p>
                        )}
                        {r.domain && <p className="text-xs text-muted-foreground mt-1">Dominio: {r.domain}</p>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end px-6 py-4 border-t border-border">
              <Button onClick={() => setOpenCategory(null)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon, title, value, subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  value: number | string
  subtitle: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{title}</div>
          <div className="text-2xl font-bold mt-1">{value}</div>
        </div>
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">{subtitle}</p>
    </div>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-amber-500/20 text-amber-500 border-amber-500/30",
    high: "bg-destructive/20 text-destructive border-destructive/30",
  }
  const label = { low: "Bajo", medium: "Medio", high: "Alto" }
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded border ${colors[severity as keyof typeof colors] ?? colors.medium}`}>
      {label[severity as keyof typeof label] ?? severity}
    </span>
  )
}
