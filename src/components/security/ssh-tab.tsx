"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Toggle } from "@/components/security/toggle"
import { useToast } from "@/hooks/use-toast"
import { RefreshCw, Download, Copy, X } from "lucide-react"

async function safeJson(res: Response) {
  const text = await res.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { return {} }
}

interface SshConfig {
  port: number
  passwordAuth: boolean
  pubkeyAuth: boolean
  permitRoot: string
}

interface LogEntry {
  status: "success" | "failure"
  method: string
  user: string
  ip: string
  port: string
  timestamp: string | null
}

type SubTab = "basic" | "logs"

const ROOT_OPTIONS = [
  { v: "yes", label: "yes — llaves y contraseñas" },
  { v: "no", label: "no — deshabilitado" },
  { v: "prohibit-password", label: "prohibit-password — solo llaves" },
  { v: "forced-commands-only", label: "forced-commands-only" },
]

export function SshTab() {
  const { toast } = useToast()
  const [running, setRunning] = useState(false)
  const [config, setConfig] = useState<SshConfig | null>(null)
  const [portDraft, setPortDraft] = useState("22")
  const [stats, setStats] = useState({ success: 0, failure: 0, successToday: 0, failureToday: 0 })
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [agentUp, setAgentUp] = useState(true)
  const [subTab, setSubTab] = useState<SubTab>("basic")

  const [keysModal, setKeysModal] = useState<string | null>(null)
  const [pwdModal, setPwdModal] = useState(false)
  const [newPassword, setNewPassword] = useState("")

  const load = useCallback(async () => {
    const [cfg, logs] = await Promise.all([
      fetch("/api/security/ssh/config").then(safeJson),
      fetch("/api/security/ssh/logs").then(safeJson),
    ])
    setAgentUp(!!cfg.agentAvailable)
    setRunning(!!cfg.running)
    if (cfg.config) {
      setConfig(cfg.config)
      setPortDraft(String(cfg.config.port))
    }
    setEntries(logs.entries ?? [])
    setStats({
      success: logs.success ?? 0,
      failure: logs.failure ?? 0,
      successToday: logs.successToday ?? 0,
      failureToday: logs.failureToday ?? 0,
    })
  }, [])

  useEffect(() => { load() }, [load])

  const showError = (description: string) => {
    toast({ variant: "destructive", title: "No se pudo aplicar", description })
  }

  const toggleService = async (on: boolean) => {
    const res = await fetch("/api/security/ssh/service", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: on }),
    })
    if (!res.ok) { const d = await safeJson(res); showError(d.error || "Error al cambiar estado") }
    await load()
  }

  const patchConfig = async (patch: Partial<SshConfig>) => {
    const res = await fetch("/api/security/ssh/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (!res.ok) { const d = await safeJson(res); showError(d.error || "Error al guardar configuración") }
    await load()
  }

  const savePort = async () => {
    const p = parseInt(portDraft, 10)
    if (!(p >= 1 && p <= 65535)) { showError("Puerto inválido"); return }
    await patchConfig({ port: p })
  }

  const generatePassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%"
    let p = ""
    for (let i = 0; i < 20; i++) p += chars[Math.floor(Math.random() * chars.length)]
    setNewPassword(p)
  }

  const resetPassword = async () => {
    if (!newPassword || newPassword.length < 8) { showError("Mínimo 8 caracteres"); return }
    const res = await fetch("/api/security/ssh/root-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    })
    if (!res.ok) { const d = await safeJson(res); showError(d.error || "Error"); return }
    toast({ title: "Contraseña actualizada", description: "Guárdala, no se podrá recuperar." })
    setPwdModal(false)
    setNewPassword("")
  }

  const viewKeys = async () => {
    const r = await fetch("/api/security/ssh/root-keys").then(safeJson)
    setKeysModal(r.keys || "(sin llaves autorizadas)")
  }

  const downloadKeys = async () => {
    const r = await fetch("/api/security/ssh/root-keys").then(safeJson)
    const blob = new Blob([r.keys || ""], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "authorized_keys"
    a.click()
    URL.revokeObjectURL(url)
  }

  const devMode = !agentUp || !config

  return (
    <div className="space-y-4">
      {devMode && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          <strong className="text-amber-500">Entorno de desarrollo:</strong>{" "}
          <span className="text-muted-foreground">
            el agente no puede leer la configuración SSH. En producción (Linux con el agente como root) este módulo funcionará sin cambios.
          </span>
        </div>
      )}

      {/* Top: SSH toggle + stats */}
      <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border bg-card/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">Activar SSH</span>
          <Toggle checked={running} onChange={toggleService} disabled={!agentUp} />
        </div>
        <div className="h-6 w-px bg-border" />
        <div className="text-sm">
          <span className="text-muted-foreground">Logins SSH: </span>
          <span className="text-emerald-500">Éxitos: {stats.success} (hoy: {stats.successToday})</span>
          <span className="text-muted-foreground mx-2">/</span>
          <span className="text-destructive">Fallos: {stats.failure} (hoy: {stats.failureToday})</span>
        </div>
        {!agentUp && <span className="ml-auto text-xs text-destructive">Agente no disponible</span>}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2">
        {([
          { id: "basic", label: "Configuración básica" },
          { id: "logs", label: "Logs de login SSH" },
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

      {subTab === "basic" && config && (
        <div className="rounded-lg border border-border bg-card/40 p-6 space-y-6">
          <div className="flex flex-wrap gap-8">
            <div className="flex items-center gap-3">
              <span className="text-sm">Login SSH por contraseña</span>
              <Toggle checked={config.passwordAuth} onChange={(v) => patchConfig({ passwordAuth: v })} disabled={!agentUp} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm">Login SSH por llave</span>
              <Toggle checked={config.pubkeyAuth} onChange={(v) => patchConfig({ pubkeyAuth: v })} disabled={!agentUp} />
            </div>
          </div>

          <div className="flex items-end gap-3">
            <div className="space-y-1.5 w-40">
              <Label className="text-xs">Puerto SSH</Label>
              <Input value={portDraft} onChange={(e) => setPortDraft(e.target.value)} className="font-mono" />
            </div>
            <Button onClick={savePort} className="bg-accent text-accent-foreground hover:bg-accent/90">Guardar</Button>
            <p className="text-xs text-muted-foreground pb-2">Puerto usado por el protocolo SSH. Por defecto 22.</p>
          </div>

          <div className="h-px bg-border" />

          <div className="flex items-center gap-3">
            <Label className="text-xs w-40">Login de root</Label>
            <select
              value={config.permitRoot}
              onChange={(e) => patchConfig({ permitRoot: e.target.value as SshConfig["permitRoot"] })}
              className="bg-background border border-border rounded-md px-3 py-2 text-sm flex-1 max-w-md"
              disabled={!agentUp}
            >
              {ROOT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <Label className="text-xs w-40">Contraseña de root</Label>
            <Button variant="outline" onClick={() => { setPwdModal(true); generatePassword() }}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Cambiar contraseña
            </Button>
            <p className="text-xs text-muted-foreground">Usa una contraseña de alta complejidad.</p>
          </div>

          <div className="flex items-center gap-3">
            <Label className="text-xs w-40">Llave de root</Label>
            <Button onClick={viewKeys} className="bg-accent text-accent-foreground hover:bg-accent/90">Ver llaves</Button>
            <Button variant="outline" onClick={downloadKeys}><Download className="w-3.5 h-3.5 mr-1.5" /> Descargar</Button>
            <p className="text-xs text-muted-foreground">Se recomienda login por llave y deshabilitar contraseña.</p>
          </div>
        </div>
      )}

      {subTab === "logs" && (
        <div className="rounded-lg border border-border bg-card/40 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left px-4 py-3">Fecha</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="text-left px-4 py-3">Usuario</th>
                <th className="text-left px-4 py-3">IP</th>
                <th className="text-left px-4 py-3">Puerto</th>
                <th className="text-left px-4 py-3">Método</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Sin eventos</td></tr>
              )}
              {entries.map((e, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{e.timestamp ? new Date(e.timestamp).toLocaleString() : "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={e.status === "success" ? "text-emerald-500" : "text-destructive"}>
                      {e.status === "success" ? "Éxito" : "Fallo"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{e.user}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{e.ip}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{e.port}</td>
                  <td className="px-4 py-2.5 text-xs">{e.method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {keysModal !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-sm font-semibold">Llaves autorizadas de root</h2>
              <button onClick={() => setKeysModal(null)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4">
              <pre className="bg-background border border-border rounded p-3 text-xs font-mono max-h-[60vh] overflow-auto whitespace-pre-wrap break-all">{keysModal}</pre>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={() => { navigator.clipboard.writeText(keysModal); }}>
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar
              </Button>
              <Button onClick={() => setKeysModal(null)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}

      {pwdModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-sm font-semibold">Cambiar contraseña de root</h2>
              <button onClick={() => setPwdModal(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-3">
              <Label className="text-xs">Nueva contraseña</Label>
              <div className="flex gap-2">
                <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="font-mono" />
                <Button variant="outline" onClick={generatePassword}><RefreshCw className="w-3.5 h-3.5" /></Button>
              </div>
              <p className="text-xs text-muted-foreground">Mínimo 8 caracteres. No podrás recuperarla después.</p>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={() => setPwdModal(false)}>Cancelar</Button>
              <Button onClick={resetPassword} className="bg-accent text-accent-foreground hover:bg-accent/90">Actualizar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
