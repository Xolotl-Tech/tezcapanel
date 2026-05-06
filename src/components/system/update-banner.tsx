"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Sparkles, X, ArrowUpCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react"

interface ReleaseCategory {
  label: string
  icon: string
  items: string[]
}

interface ReleaseInfo {
  version: string
  name: string
  publishedAt: string
  url: string
  author: { name: string; url: string }
  categories: ReleaseCategory[]
  raw: string
}

interface VersionResponse {
  installed: string
  latest: string | null
  updateAvailable: boolean
  lastCheckedAt: string | null
  release: ReleaseInfo | null
}

type UpdateState = "idle" | "running" | "success" | "failed"
interface UpdateStatusResponse {
  state: UpdateState
  installedVersion: string
  log: string[]
  exitCode: number | null
}

export function UpdateBanner() {
  const [info, setInfo] = useState<VersionResponse | null>(null)
  const [open, setOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const fetchInfo = async (force = false) => {
    if (force) setRefreshing(true)
    try {
      const r = await fetch(
        "/api/system/version" + (force ? "?force=1" : ""),
        { cache: "no-store" }
      )
      if (r.ok) setInfo(await r.json())
    } catch {
      // silencioso: el badge mantiene el último estado conocido
    } finally {
      if (force) setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchInfo()
    // Refetch al regresar foco a la pestaña. Throttle a 1 vez por minuto
    // para que tab-switching no queme el rate limit anónimo de GitHub.
    // Forzamos `force=1` porque el TTL server-side de la BD ignoraría un
    // GET normal (devolvería caché vieja).
    let lastForceMs = 0
    const onFocus = () => {
      if (document.hidden) return
      const now = Date.now()
      if (now - lastForceMs < 60_000) return
      lastForceMs = now
      fetchInfo(true)
    }
    document.addEventListener("visibilitychange", onFocus)
    window.addEventListener("focus", onFocus)
    return () => {
      document.removeEventListener("visibilitychange", onFocus)
      window.removeEventListener("focus", onFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loading = info === null
  const updateAvailable = !!info?.updateAvailable
  const installed = info?.installed ?? "—"
  const latest = info?.latest ?? null

  if (loading) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border border-border bg-secondary/30 text-muted-foreground"
        title="Verificando actualizaciones"
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        Verificando…
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          updateAvailable
            ? "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
            : "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border border-border bg-secondary/30 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
        }
        title={updateAvailable ? `Actualizar a ${latest}` : `Versión ${installed}`}
      >
        {updateAvailable ? (
          <>
            <Sparkles className="w-3 h-3" />
            Actualizar a {latest}
          </>
        ) : (
          <>
            <CheckCircle2 className="w-3 h-3" />
            v{installed}
          </>
        )}
      </button>

      {open && info && (
        <UpdateModal
          info={info}
          refreshing={refreshing}
          onRefresh={() => fetchInfo(true)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function UpdateModal({
  info,
  refreshing,
  onRefresh,
  onClose,
}: {
  info: VersionResponse
  refreshing: boolean
  onRefresh: () => void
  onClose: () => void
}) {
  const updateAvailable = info.updateAvailable
  const release = info.release
  const { toast } = useToast()

  // Estado local del proceso de actualización (independiente de info).
  const [phase, setPhase] = useState<"review" | "running" | "success" | "failed">("review")
  const [log, setLog] = useState<string[]>([])
  const pollRef = useRef<number | null>(null)
  const expectedVersion = info.latest ?? ""

  function stopPolling() {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  useEffect(() => () => stopPolling(), [])

  async function pollStatus() {
    try {
      const r = await fetch("/api/system/update/status", { cache: "no-store" })
      if (!r.ok) {
        // 502/503 durante el restart del panel: ignoramos hasta que vuelva.
        return
      }
      const data = (await r.json()) as UpdateStatusResponse
      setLog(data.log)

      if (data.state === "running") {
        setPhase("running")
      } else if (data.state === "success") {
        // Confirmación dura: la versión instalada coincide con la esperada.
        if (!expectedVersion || data.installedVersion === expectedVersion) {
          setPhase("success")
          stopPolling()
          // Dejamos que el usuario vea el resultado y refresque cuando quiera.
        }
      } else if (data.state === "failed") {
        setPhase("failed")
        stopPolling()
      }
    } catch {
      // Ignorar errores de red transitorios (panel reiniciándose).
    }
  }

  async function startUpdate() {
    if (!confirm(
      `Esto actualizará Tezcapanel a la versión ${info.latest}. ` +
      `El panel se reiniciará — toma ~30-60 segundos. ¿Continuar?`
    )) return

    setPhase("running")
    setLog([])

    const r = await fetch("/api/system/update", { method: "POST" })
    if (r.status === 429) {
      toast({
        variant: "destructive",
        title: "Demasiados intentos",
        description: "Espera un momento antes de volver a intentarlo.",
      })
      setPhase("review")
      return
    }
    if (!r.ok && r.status !== 202) {
      const data = await r.json().catch(() => ({}))
      toast({
        variant: "destructive",
        title: "No se pudo iniciar la actualización",
        description: data.detail || "Revisa los logs del servidor.",
      })
      setPhase("review")
      return
    }

    // Polling cada 2s. La primera respuesta puede estar mientras el unit aún
    // no fue creado por systemd-run, así que no salimos al primer "idle".
    pollRef.current = window.setInterval(pollStatus, 2000)
    pollStatus()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border">
          <div className="flex items-start gap-3">
            {phase === "running" ? (
              <Loader2 className="w-5 h-5 text-accent animate-spin mt-0.5" />
            ) : phase === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
            ) : updateAvailable ? (
              <ArrowUpCircle className="w-5 h-5 text-accent mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
            )}
            <div>
              <h3 className="text-sm font-semibold">
                {phase === "running" ? `Actualizando a ${info.latest}…` :
                 phase === "success" ? `Actualizado a ${info.latest}` :
                 phase === "failed" ? "La actualización falló" :
                 updateAvailable ? `Actualización disponible: ${info.latest}` :
                 `Tezcapanel v${info.installed}`}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {phase === "running" ? "El panel se reiniciará automáticamente al terminar." :
                 phase === "success" ? "Refresca la página para usar la nueva versión." :
                 phase === "failed" ? "Revisa el log abajo o usa SSH para diagnosticar." :
                 updateAvailable ? `Tienes la versión ${info.installed} instalada` :
                 "Estás en la última versión"}
                {phase === "review" && release && (
                  <>
                    {" · por "}
                    <a
                      href={release.author.url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-foreground hover:underline"
                    >
                      {release.author.name}
                    </a>
                  </>
                )}
              </p>
            </div>
          </div>
          {phase !== "running" && (
            <button onClick={onClose}><X className="w-4 h-4" /></button>
          )}
        </div>

        {/* Cuerpo */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {phase === "review" ? (
            updateAvailable && release && Array.isArray(release.categories) && release.categories.length > 0 ? (
              <div className="space-y-5">
                {release.categories.map((cat) => (
                  <div key={cat.label}>
                    <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-2">
                      {cat.icon && <span aria-hidden>{cat.icon}</span>}
                      {cat.label}
                    </h4>
                    <ul className="space-y-1.5 pl-1">
                      {cat.items.map((item, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex gap-2">
                          <span className="text-accent shrink-0">›</span>
                          <span className="break-words">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : updateAvailable ? (
              <p className="text-xs text-muted-foreground">
                Esta actualización no incluye notas detalladas.
              </p>
            ) : (
              <div className="text-xs text-muted-foreground space-y-2">
                <p>
                  Estás corriendo la última versión publicada. Cuando publiquemos
                  una nueva versión, este banner cambiará a “Actualizar” y verás
                  aquí la lista de cambios incluidos.
                </p>
                {release && (
                  <p>
                    Última publicación:{" "}
                    <span className="text-foreground">
                      {new Date(release.publishedAt).toLocaleDateString("es-MX", {
                        day: "numeric", month: "long", year: "numeric",
                      })}
                    </span>
                  </p>
                )}
              </div>
            )
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {phase === "running" ?
                  "Procesando — no cierres esta ventana. El panel puede dejar de responder por unos segundos durante el reinicio." :
                  phase === "success" ?
                  "El servicio fue reiniciado con la nueva versión." :
                  "El proceso terminó con error. Estás en la versión anterior."}
              </p>
              <pre className="bg-muted/50 border border-border rounded-md px-3 py-2 text-[11px] font-mono overflow-auto max-h-64">
                {log.length > 0 ? log.join("\n") : "Esperando salida del proceso…"}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          {phase === "review" && updateAvailable && (
            <>
              <Button size="sm" variant="ghost" onClick={onClose}>
                Tal vez después
              </Button>
              <Button size="sm" onClick={startUpdate}>
                Actualizar ahora
              </Button>
            </>
          )}
          {phase === "review" && !updateAvailable && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={onRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={`w-3 h-3 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Verificando…" : "Re-verificar"}
              </Button>
              <Button size="sm" variant="outline" onClick={onClose}>Cerrar</Button>
            </>
          )}
          {phase === "running" && (
            <Button size="sm" disabled>
              <Loader2 className="w-3 h-3 mr-2 animate-spin" />
              Actualizando…
            </Button>
          )}
          {phase === "success" && (
            <Button size="sm" onClick={() => window.location.reload()}>
              Refrescar página
            </Button>
          )}
          {phase === "failed" && (
            <>
              <Button size="sm" variant="ghost" onClick={onClose}>Cerrar</Button>
              <Button size="sm" variant="outline" onClick={() => setPhase("review")}>
                Reintentar
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
