"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Toggle } from "@/components/security/toggle"
import { useToast } from "@/hooks/use-toast"
import { RefreshCw, ShieldCheck, Unlock, Ban, Info, Download } from "lucide-react"
import { safeJson } from "@/lib/utils"

interface Jail {
  name: string
  failed?: number
  totalFailed?: number
  banned?: number
  totalBanned?: number
  bannedIps?: string[]
  error?: string
}

interface Status {
  agentAvailable: boolean
  installed: boolean
  running: boolean
  jails: Jail[]
  global: { bantime?: string; findtime?: string; maxretry?: string }
  knownJails: string[]
}

const JAIL_LABELS: Record<string, string> = {
  sshd: "SSH",
  "apache-auth": "Apache (auth)",
  "nginx-http-auth": "Nginx (auth)",
  postfix: "Postfix (correo)",
  dovecot: "Dovecot (correo)",
  vsftpd: "FTP (vsftpd)",
  "mysqld-auth": "MySQL",
}

export function BruteForceTab() {
  const { toast } = useToast()
  const [data, setData] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [banIp, setBanIp] = useState("")
  const [banJail, setBanJail] = useState("sshd")
  const [globalDraft, setGlobalDraft] = useState({ maxretry: "5", bantime: "10m", findtime: "10m" })

  const load = useCallback(async () => {
    setLoading(true)
    const d = await fetch("/api/security/brute-force").then(safeJson)
    setData(d as Status)
    if (d?.global) {
      setGlobalDraft({
        maxretry: String(d.global.maxretry ?? "5"),
        bantime: String(d.global.bantime ?? "10m"),
        findtime: String(d.global.findtime ?? "10m"),
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const showErr = (d: string) => toast({ variant: "destructive", title: "Error", description: d })

  const toggleJail = async (name: string, enabled: boolean) => {
    const res = await fetch(`/api/security/brute-force/jail/${encodeURIComponent(name)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    })
    const d = await safeJson(res)
    if (!res.ok) { showErr(d.error || "Error"); return }
    toast({ title: `${JAIL_LABELS[name] ?? name} ${enabled ? "activado" : "desactivado"}` })
    await load()
  }

  const submitBan = async () => {
    if (!banIp.trim()) return
    const res = await fetch("/api/security/brute-force/ban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jail: banJail, ip: banIp.trim() }),
    })
    const d = await safeJson(res)
    if (!res.ok) { showErr(d.error || "Error"); return }
    toast({ title: "IP bloqueada", description: `${banIp} en ${banJail}` })
    setBanIp("")
    await load()
  }

  const unbanIp = async (jail: string, ip: string) => {
    const res = await fetch("/api/security/brute-force/unban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jail, ip }),
    })
    const d = await safeJson(res)
    if (!res.ok) { showErr(d.error || "Error"); return }
    toast({ title: "IP desbloqueada", description: ip })
    await load()
  }

  const saveGlobal = async () => {
    const res = await fetch("/api/security/brute-force/global", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(globalDraft),
    })
    const d = await safeJson(res)
    if (!res.ok) { showErr(d.error || "Error"); return }
    toast({ title: "Configuración global actualizada" })
    await load()
  }

  const installFail2ban = async () => {
    const res = await fetch("/api/security/server/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "install-fail2ban" }),
    })
    const d = await safeJson(res)
    if (!res.ok) { showErr(d.error || "Error"); return }
    toast({ title: "fail2ban instalado" })
    await load()
  }

  if (loading) return <div className="text-sm text-muted-foreground py-8 text-center">Cargando...</div>
  if (!data) return <div className="text-sm text-muted-foreground py-8 text-center">Sin datos</div>

  if (!data.installed) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-6 flex flex-col items-center gap-4">
        <ShieldCheck className="w-10 h-10 text-amber-500" />
        <h3 className="text-base font-semibold">Fail2ban no está instalado</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Fail2ban monitorea logs y bloquea IPs tras intentos fallidos. Es la base de la protección contra fuerza bruta.
        </p>
        <Button onClick={installFail2ban} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Download className="w-4 h-4 mr-1.5" /> Instalar fail2ban
        </Button>
      </div>
    )
  }

  const jailMap = new Map(data.jails.map((j) => [j.name, j]))
  const allJails = [...new Set([...data.knownJails, ...data.jails.map((j) => j.name)])]
  const totalBanned = data.jails.reduce((s, j) => s + (j.banned ?? 0), 0)
  const totalFailed = data.jails.reduce((s, j) => s + (j.totalFailed ?? 0), 0)

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border bg-card/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className={`w-4 h-4 ${data.running ? "text-emerald-500" : "text-destructive"}`} />
          <span className="text-sm">Fail2ban {data.running ? "activo" : "detenido"}</span>
        </div>
        <div className="h-6 w-px bg-border" />
        <div className="text-sm">
          <span className="text-muted-foreground">Bloqueos actuales: </span>
          <span className="text-destructive font-semibold">{totalBanned}</span>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Intentos fallidos totales: </span>
          <span className="font-semibold">{totalFailed}</span>
        </div>
        <Button variant="outline" onClick={load} className="ml-auto">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Actualizar
        </Button>
      </div>

      {/* Global config */}
      <div className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
        <h3 className="text-sm font-semibold">Configuración global</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground">Reintentos máximos</label>
            <Input
              value={globalDraft.maxretry}
              onChange={(e) => setGlobalDraft({ ...globalDraft, maxretry: e.target.value })}
              className="font-mono mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tiempo de bloqueo</label>
            <Input
              value={globalDraft.bantime}
              onChange={(e) => setGlobalDraft({ ...globalDraft, bantime: e.target.value })}
              className="font-mono mt-1"
              placeholder="10m, 1h, 24h..."
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Ventana de detección</label>
            <Input
              value={globalDraft.findtime}
              onChange={(e) => setGlobalDraft({ ...globalDraft, findtime: e.target.value })}
              className="font-mono mt-1"
              placeholder="10m..."
            />
          </div>
          <Button onClick={saveGlobal} className="bg-accent text-accent-foreground hover:bg-accent/90">Guardar</Button>
        </div>
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <Info className="w-3 h-3 mt-0.5" />
          Formatos: "600" (segundos), "10m", "1h", "1d"
        </p>
      </div>

      {/* Jails */}
      <div className="rounded-lg border border-border bg-card/40">
        <h3 className="text-sm font-semibold px-4 py-3 border-b border-border">Servicios protegidos</h3>
        <div>
          {allJails.map((name) => {
            const j = jailMap.get(name)
            const active = !!j
            return (
              <div key={name} className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
                <Toggle checked={active} onChange={(v) => toggleJail(name, v)} />
                <div className="flex-1">
                  <div className="text-sm font-semibold">{JAIL_LABELS[name] ?? name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{name}</div>
                </div>
                {j && (
                  <div className="text-xs space-x-4 text-muted-foreground">
                    <span>Fallidos: <span className="text-foreground">{j.totalFailed ?? 0}</span></span>
                    <span>Bloqueos: <span className="text-destructive">{j.banned ?? 0}</span></span>
                    <span>Total bloqueados: <span className="text-foreground">{j.totalBanned ?? 0}</span></span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Manual ban + banned list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
          <h3 className="text-sm font-semibold">Bloquear IP manualmente</h3>
          <div className="flex gap-2">
            <select
              value={banJail}
              onChange={(e) => setBanJail(e.target.value)}
              className="bg-background border border-border rounded-md px-3 py-2 text-sm"
            >
              {allJails.map((j) => <option key={j} value={j}>{JAIL_LABELS[j] ?? j}</option>)}
            </select>
            <Input value={banIp} onChange={(e) => setBanIp(e.target.value)} placeholder="192.168.1.100" className="font-mono" />
            <Button onClick={submitBan} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              <Ban className="w-3.5 h-3.5 mr-1.5" /> Bloquear
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card/40 p-4">
          <h3 className="text-sm font-semibold mb-3">IPs actualmente bloqueadas</h3>
          {totalBanned === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Ninguna IP bloqueada</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.jails.map((j) =>
                (j.bannedIps ?? []).map((ip) => (
                  <div key={`${j.name}-${ip}`} className="flex items-center gap-2 text-xs">
                    <span className="font-mono flex-1">{ip}</span>
                    <span className="text-muted-foreground">{JAIL_LABELS[j.name] ?? j.name}</span>
                    <button
                      onClick={() => unbanIp(j.name, ip)}
                      className="text-emerald-500 hover:text-emerald-400 flex items-center gap-1"
                    >
                      <Unlock className="w-3 h-3" /> Desbloquear
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
