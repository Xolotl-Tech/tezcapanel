"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { SecurityConfigDialog } from "@/components/security/security-config-dialog"
import { CheckCircle2, XCircle, Info, Settings } from "lucide-react"

async function safeJson(res: Response) {
  const text = await res.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { return {} }
}

interface Check {
  id: string
  label: string
  description: string
  ok: boolean
  value?: string | number
}

interface LoginRecord {
  id: string
  createdAt: string
  userId: string
  meta?: { ip?: string | null; userAgent?: string | null }
  user?: { id: string; email: string; name: string | null } | null
}

interface SshRecord {
  status: string
  user: string
  ip: string
  port: string
  timestamp: string | null
}

interface ServerData {
  agentAvailable: boolean
  stats: {
    today: { success: number; failure: number }
    yesterday: { success: number; failure: number }
    week: { success: number; failure: number }
    totalSuccess: number
    totalFailure: number
  }
  lastSsh: SshRecord | null
  lastPanel: LoginRecord | null
  checks: Check[]
  rating: number
  sshRecent: SshRecord[]
  panelRecent: LoginRecord[]
}

function browserFromUA(ua: string | null | undefined) {
  if (!ua) return "—"
  if (/Chrome/.test(ua)) return "Chrome"
  if (/Firefox/.test(ua)) return "Firefox"
  if (/Safari/.test(ua)) return "Safari"
  if (/Edge/.test(ua)) return "Edge"
  return "Otro"
}

export function ServerSecurityTab() {
  const [data, setData] = useState<ServerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/security/server")
      const d = await safeJson(res)
      if (!res.ok || !d?.stats) {
        setError(d?.error || `No se pudo cargar (HTTP ${res.status})`)
        setData(null)
      } else {
        setData(d as ServerData)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Cargando...</div>
  }
  if (error || !data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
        <p className="text-destructive font-semibold">No se pudo cargar Server security</p>
        <p className="text-xs text-muted-foreground mt-1">{error ?? "Respuesta vacía"}</p>
      </div>
    )
  }

  const ratingLabel = data.rating >= 80 ? "Seguro" : data.rating >= 50 ? "Aceptable" : "Inseguro"
  const ratingColor = data.rating >= 80 ? "text-emerald-500" : data.rating >= 50 ? "text-amber-500" : "text-destructive"

  return (
    <div className="space-y-4">
      {/* Top stats row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card/40 p-4 grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4 flex flex-col items-center justify-center">
            <div className="text-3xl font-bold text-emerald-500">{data.stats.totalSuccess}</div>
            <div className="text-xs text-muted-foreground mt-1">Logins SSH exitosos</div>
          </div>
          <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 flex flex-col items-center justify-center">
            <div className="text-3xl font-bold text-destructive">{data.stats.totalFailure}</div>
            <div className="text-xs text-muted-foreground mt-1">Logins SSH fallidos</div>
          </div>
          <div className="space-y-2 text-sm">
            <StatRow label="Hoy" ok={data.stats.today.success} fail={data.stats.today.failure} />
            <StatRow label="Ayer" ok={data.stats.yesterday.success} fail={data.stats.yesterday.failure} />
            <StatRow label="7 días" ok={data.stats.week.success} fail={data.stats.week.failure} />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card/40 p-4">
          <h3 className="text-sm font-semibold mb-3">Último login</h3>
          <div className="grid grid-cols-2 gap-3">
            <LastLoginCard
              title="SSH"
              status={data.lastSsh ? "Éxito" : "—"}
              ip={data.lastSsh?.ip}
              time={data.lastSsh?.timestamp}
              port={data.lastSsh?.port}
            />
            <LastLoginCard
              title="Panel"
              status={data.lastPanel ? "Éxito" : "—"}
              ip={data.lastPanel?.meta?.ip ?? undefined}
              time={data.lastPanel?.createdAt}
              user={data.lastPanel?.user?.email}
            />
          </div>
        </div>
      </div>

      {/* SSH protection banner */}
      {!data.checks.find((c) => c.id === "ssh-bruteforce")?.ok && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold">Protección SSH no instalada</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Instala fail2ban para prevenir ataques de fuerza bruta contra SSH.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Ejecútalo en el servidor: <code className="bg-background/50 px-1.5 py-0.5 rounded">apt install fail2ban -y && systemctl enable --now fail2ban</code>
            </p>
          </div>
        </div>
      )}

      {/* Safety rating */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card/40 p-4">
        <div>
          <span className="text-sm text-muted-foreground">Puntaje de seguridad: </span>
          <span className={`text-2xl font-bold ${ratingColor}`}>{data.rating}</span>
          <span className="text-sm text-muted-foreground"> / 100</span>
          <span className={`ml-3 text-sm ${ratingColor}`}>{ratingLabel}</span>
        </div>
        <Button onClick={() => setConfigOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Settings className="w-3.5 h-3.5 mr-1.5" /> Configurar
        </Button>
      </div>

      {/* Check cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.checks.map((c) => (
          <div
            key={c.id}
            className={`rounded-lg border p-4 ${
              c.ok
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-destructive/30 bg-destructive/5"
            }`}
          >
            <h4 className="text-sm font-semibold mb-2">{c.label}</h4>
            <div className="flex items-start gap-2 text-xs">
              {c.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              )}
              <span className={c.ok ? "text-emerald-500" : "text-destructive"}>
                {c.description}
              </span>
            </div>
            {c.value !== undefined && c.value !== null && (
              <p className="text-xs text-muted-foreground mt-2 font-mono">Actual: {String(c.value)}</p>
            )}
          </div>
        ))}
      </div>

      {/* Recent logins */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card/40 p-4">
          <h3 className="text-sm font-semibold mb-3">Últimos 5 logins SSH</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left py-2">IP</th>
                  <th className="text-left py-2">Fecha</th>
                  <th className="text-left py-2">Puerto</th>
                  <th className="text-left py-2">Estado</th>
                  <th className="text-left py-2">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {data.sshRecent.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Sin registros</td></tr>
                )}
                {data.sshRecent.map((e, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-2 font-mono">{e.ip}</td>
                    <td className="py-2">{e.timestamp ? new Date(e.timestamp).toLocaleString() : "—"}</td>
                    <td className="py-2 font-mono">{e.port}</td>
                    <td className="py-2 text-emerald-500">Éxito</td>
                    <td className="py-2 font-mono">{e.user}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card/40 p-4">
          <h3 className="text-sm font-semibold mb-3">Últimos 5 logins al panel</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left py-2">IP</th>
                  <th className="text-left py-2">Fecha</th>
                  <th className="text-left py-2">Usuario</th>
                  <th className="text-left py-2">Estado</th>
                  <th className="text-left py-2">Navegador</th>
                </tr>
              </thead>
              <tbody>
                {data.panelRecent.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Sin registros</td></tr>
                )}
                {data.panelRecent.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2 font-mono">{p.meta?.ip ?? "—"}</td>
                    <td className="py-2">{new Date(p.createdAt).toLocaleString()}</td>
                    <td className="py-2 font-mono">{p.user?.email ?? "—"}</td>
                    <td className="py-2 text-emerald-500">Éxito</td>
                    <td className="py-2">{browserFromUA(p.meta?.userAgent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <SecurityConfigDialog
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        onSaved={load}
      />
    </div>
  )
}

function StatRow({ label, ok, fail }: { label: string; ok: number; fail: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex gap-3">
        <span className="text-emerald-500">{ok}</span>
        <span className="text-destructive">{fail}</span>
      </div>
    </div>
  )
}

function LastLoginCard({
  title, status, ip, time, port, user,
}: {
  title: string; status: string; ip?: string; time?: string | null; port?: string; user?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3 space-y-1 text-xs">
      <div className="flex justify-between">
        <span className="font-semibold">{title}</span>
        <span className="text-emerald-500">{status}</span>
      </div>
      <div className="text-muted-foreground">IP: <span className="font-mono text-foreground">{ip ?? "—"}</span></div>
      <div className="text-muted-foreground">Fecha: <span className="text-foreground">{time ? new Date(time).toLocaleString() : "—"}</span></div>
      {port && <div className="text-muted-foreground">Puerto: <span className="font-mono text-foreground">{port}</span></div>}
      {user && <div className="text-muted-foreground">Usuario: <span className="font-mono text-foreground">{user}</span></div>}
    </div>
  )
}
