"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Toggle } from "@/components/security/toggle"
import { useToast } from "@/hooks/use-toast"
import { X, RefreshCw, Download, Eye } from "lucide-react"
import { safeJson } from "@/lib/utils"

interface ServerData {
  agentAvailable: boolean
  agentCheck: {
    sshPort: number | null
    passMinLen: number | null
    pamComplexity: boolean
    fail2banActive: boolean
    fail2banInstalled: boolean
    permitRoot: string | null
  }
  panelSettings: {
    alertOnSshLogin: boolean
    alertOnPanelLogin: boolean
    totpEnabled: boolean
    unauthStatusCode: number
    sslEnabled: boolean
  }
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export function SecurityConfigDialog({ open, onClose, onSaved }: Props) {
  const { toast } = useToast()
  const [data, setData] = useState<ServerData | null>(null)
  const [loading, setLoading] = useState(false)
  const [keysModal, setKeysModal] = useState<string | null>(null)

  const [sshPort, setSshPort] = useState("")
  const [passMinLen, setPassMinLen] = useState("")
  const [complexityLevel, setComplexityLevel] = useState(0)
  const [rootLogin, setRootLogin] = useState<"only-key" | "only-commands" | "password-and-key" | "prohibited">("only-key")

  const load = async () => {
    setLoading(true)
    const d = await fetch("/api/security/server").then(safeJson)
    setData(d as ServerData)
    setSshPort(String(d.agentCheck?.sshPort ?? 22))
    setPassMinLen(String(d.agentCheck?.passMinLen ?? 8))
    // map pwquality -> level approximation
    setComplexityLevel(d.agentCheck?.pamComplexity ? 3 : 0)
    const r = d.agentCheck?.permitRoot
    if (r === "prohibit-password") setRootLogin("only-key")
    else if (r === "forced-commands-only") setRootLogin("only-commands")
    else if (r === "yes") setRootLogin("password-and-key")
    else if (r === "no") setRootLogin("prohibited")
    setLoading(false)
  }

  useEffect(() => { if (open) load() }, [open])

  if (!open) return null

  const showErr = (description: string) => toast({ variant: "destructive", title: "Error", description })
  const showOk = (description: string) => toast({ title: "Actualizado", description })

  const act = async (body: Record<string, unknown>, successMsg: string) => {
    const res = await fetch("/api/security/server/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = await safeJson(res)
    if (!res.ok) { showErr(json.error || "Error"); return false }
    showOk(successMsg)
    await load()
    onSaved()
    return true
  }

  const patchPanel = async (patch: Record<string, unknown>) => {
    const res = await fetch("/api/security/server", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (!res.ok) { const d = await safeJson(res); showErr(d.error || "Error"); return }
    await load()
    onSaved()
  }

  const applySshPort = () => act({ action: "set-ssh-port", port: parseInt(sshPort, 10) }, "Puerto SSH actualizado")
  const applyPassLen = () => act({ action: "set-password-length", min: parseInt(passMinLen, 10) }, "Longitud mínima aplicada")
  const applyComplexity = () => act({ action: "set-password-complexity", level: complexityLevel }, "Complejidad aplicada")
  const applyRootLogin = () => {
    const map = {
      "only-key": { permitRoot: "prohibit-password", passwordAuth: true },
      "only-commands": { permitRoot: "forced-commands-only", passwordAuth: false },
      "password-and-key": { permitRoot: "yes", passwordAuth: true },
      "prohibited": { permitRoot: "no", passwordAuth: false },
    }
    return act({ action: "set-root-login", ...map[rootLogin] }, "Login de root actualizado")
  }

  const toggleFail2ban = async (enabled: boolean) => {
    if (enabled && !data?.agentCheck.fail2banInstalled) {
      if (!confirm("Fail2ban no está instalado. ¿Instalarlo ahora?")) return
      const ok = await act({ action: "install-fail2ban" }, "Fail2ban instalado y activado")
      if (!ok) return
      return
    }
    await act({ action: "fail2ban-toggle", enabled }, enabled ? "Fail2ban activado" : "Fail2ban desactivado")
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

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Configuración de seguridad</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading || !data ? (
            <div className="text-center text-sm text-muted-foreground py-8">Cargando...</div>
          ) : (
            <>
              {/* SSH Port */}
              <Section
                title="Cambio de puerto SSH"
                recommendation="Usa un puerto distinto de 22"
                tag={data.agentCheck.sshPort !== 22 ? null : "Importante"}
                description="Modifica el puerto SSH por defecto para evitar escaneo malicioso"
              >
                <Input value={sshPort} onChange={(e) => setSshPort(e.target.value)} className="w-28 font-mono" />
                <Button onClick={applySshPort} className="bg-accent text-accent-foreground hover:bg-accent/90">Aplicar</Button>
              </Section>

              {/* Password Complexity */}
              <Section
                title="Complejidad de contraseña"
                recommendation="Usa nivel mayor a 3"
                description="Habilita verificación de complejidad: números, mayúsculas, minúsculas y caracteres especiales"
              >
                <div className="flex items-center gap-3 w-full">
                  <span className="text-xs text-muted-foreground w-24">Nivel: {complexityLevel}/4</span>
                  <input
                    type="range"
                    min={0}
                    max={4}
                    value={complexityLevel}
                    onChange={(e) => setComplexityLevel(parseInt(e.target.value, 10))}
                    className="flex-1 accent-accent"
                  />
                  <Button onClick={applyComplexity} className="bg-accent text-accent-foreground hover:bg-accent/90">Aplicar</Button>
                </div>
              </Section>

              {/* Password length */}
              <Section
                title="Longitud mínima de contraseña"
                recommendation="9 a 20 caracteres"
                description="Establece el requisito de longitud mínima"
              >
                <span className="text-xs text-muted-foreground">Mínimo:</span>
                <Input value={passMinLen} onChange={(e) => setPassMinLen(e.target.value)} className="w-24 font-mono" />
                <Button onClick={applyPassLen} className="bg-accent text-accent-foreground hover:bg-accent/90">Aplicar</Button>
              </Section>

              {/* SSH login alert */}
              <Section
                title="Alerta de login SSH"
                recommendation="Actívala para detectar accesos"
                description="Envía notificación cuando haya login SSH"
              >
                <Toggle checked={data.panelSettings.alertOnSshLogin} onChange={(v) => patchPanel({ alertOnSshLogin: v })} />
              </Section>

              {/* Fail2ban / Brute Force */}
              <Section
                title="Protección SSH Brute Force"
                recommendation="Activar Fail2ban"
                description="Previene ataques de fuerza bruta contra SSH"
              >
                <Toggle
                  checked={data.agentCheck.fail2banActive}
                  onChange={toggleFail2ban}
                  disabled={!data.agentAvailable}
                />
              </Section>

              {/* Panel login alert */}
              <Section
                title="Alerta de login al panel"
                recommendation="Actívala para detectar accesos"
                description="Envía notificación cuando alguien inicie sesión en el panel"
              >
                <Toggle checked={data.panelSettings.alertOnPanelLogin} onChange={(v) => patchPanel({ alertOnPanelLogin: v })} />
              </Section>

              {/* Google Authenticator */}
              <Section
                title="Google Authenticator"
                recommendation="Habilita TOTP"
                description="Activa TOTP para login al panel"
              >
                <Toggle checked={data.panelSettings.totpEnabled} onChange={(v) => patchPanel({ totpEnabled: v })} />
              </Section>

              {/* Unauth status code */}
              <Section
                title="Código HTTP no autenticado"
                recommendation="404 como respuesta"
                description="Código HTTP que recibe quien no está autenticado"
              >
                <select
                  value={data.panelSettings.unauthStatusCode}
                  onChange={(e) => patchPanel({ unauthStatusCode: parseInt(e.target.value, 10) })}
                  className="bg-background border border-border rounded-md px-3 py-2 text-sm"
                >
                  <option value={404}>404 – Page Not Found</option>
                  <option value={403}>403 – Forbidden</option>
                  <option value={401}>401 – Unauthorized</option>
                  <option value={500}>500 – Internal Server Error</option>
                </select>
              </Section>

              {/* Panel SSL */}
              <Section
                title="SSL del panel"
                recommendation="Activa HTTPS"
                description="Habilita acceso por HTTPS (requiere reiniciar el panel)"
              >
                <Toggle checked={data.panelSettings.sslEnabled} onChange={(v) => patchPanel({ sslEnabled: v })} />
              </Section>

              {/* Root login */}
              <Section
                title="Login por contraseña de root"
                recommendation="Solo login por llave"
                description="Controla cómo puede autenticarse root vía SSH"
              >
                <div className="flex flex-wrap gap-3 items-center">
                  {([
                    { v: "only-key", label: "Solo llave" },
                    { v: "only-commands", label: "Solo comandos" },
                    { v: "password-and-key", label: "Contraseña + llave" },
                    { v: "prohibited", label: "Prohibido" },
                  ] as const).map((o) => (
                    <label key={o.v} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="root-login"
                        checked={rootLogin === o.v}
                        onChange={() => setRootLogin(o.v)}
                        className="accent-accent"
                      />
                      {o.label}
                    </label>
                  ))}
                  <Button onClick={applyRootLogin} className="bg-accent text-accent-foreground hover:bg-accent/90 ml-auto">Aplicar</Button>
                </div>
              </Section>

              {/* Root key */}
              <Section
                title="Llave de root"
                recommendation="Solo login por llave"
                description="Ver y descargar las llaves autorizadas de root"
              >
                <Button onClick={viewKeys} className="bg-accent text-accent-foreground hover:bg-accent/90">
                  <Eye className="w-3.5 h-3.5 mr-1.5" /> Ver llave
                </Button>
                <Button variant="outline" onClick={downloadKeys}>
                  <Download className="w-3.5 h-3.5 mr-1.5" /> Descargar
                </Button>
              </Section>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={load}><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Recargar</Button>
          <Button onClick={onClose}>Cerrar</Button>
        </div>
      </div>

      {keysModal !== null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Llaves autorizadas de root</h3>
              <button onClick={() => setKeysModal(null)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4">
              <pre className="bg-background border border-border rounded p-3 text-xs font-mono max-h-[60vh] overflow-auto whitespace-pre-wrap break-all">{keysModal}</pre>
            </div>
            <div className="flex justify-end px-6 py-4 border-t border-border">
              <Button onClick={() => setKeysModal(null)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({
  title, recommendation, description, tag, children,
}: {
  title: string
  recommendation: string
  description: string
  tag?: string | null
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            {tag && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">{tag}</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Recomendado: {recommendation}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">{children}</div>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}
