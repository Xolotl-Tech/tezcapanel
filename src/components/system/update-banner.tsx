"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Sparkles, X, ArrowUpCircle } from "lucide-react"

interface ChangelogEntry {
  sha: string
  message: string
  date: string
  author: string | null
}

interface VersionResponse {
  installed: string | null
  latest: string | null
  updateAvailable: boolean
  lastCheckedAt: string | null
  changelog: ChangelogEntry[]
  unknown?: boolean
}

const REPO_HTTPS = "https://github.com/Xolotl-Tech/tezcapanel"

export function UpdateBanner() {
  const [info, setInfo] = useState<VersionResponse | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/system/version", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setInfo(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!info?.updateAvailable) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
        title="Actualización disponible"
      >
        <Sparkles className="w-3 h-3" />
        Actualizar
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <ArrowUpCircle className="w-4 h-4 text-accent" />
                <h3 className="text-sm font-semibold">Actualización disponible</h3>
              </div>
              <button onClick={() => setOpen(false)}><X className="w-4 h-4" /></button>
            </div>

            <div className="px-6 py-4 border-b border-border space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Instalado</span>
                <code className="font-mono">{info.installed?.slice(0, 7) ?? "—"}</code>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Disponible</span>
                <code className="font-mono text-accent">{info.latest?.slice(0, 7) ?? "—"}</code>
              </div>
              {info.lastCheckedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Última verificación</span>
                  <span>{new Date(info.lastCheckedAt).toLocaleString("es-MX")}</span>
                </div>
              )}
            </div>

            {info.changelog.length > 0 && (
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <h4 className="text-xs font-semibold text-muted-foreground mb-3">
                  Cambios ({info.changelog.length})
                </h4>
                <ul className="space-y-2">
                  {info.changelog.map((c) => (
                    <li key={c.sha} className="text-xs flex gap-2">
                      <code className="font-mono text-muted-foreground shrink-0">{c.sha}</code>
                      <span className="break-words">{c.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="px-6 py-4 border-t border-border space-y-3">
              <div className="text-xs text-muted-foreground">
                Para actualizar, conéctate al servidor por SSH y ejecuta:
              </div>
              <pre className="bg-muted/50 border border-border rounded-md px-3 py-2 text-xs font-mono overflow-x-auto">
{`cd /opt/tezcapanel && sudo bash install.sh`}
              </pre>
              <div className="text-[11px] text-muted-foreground">
                El script hace pull del repositorio, reinstala dependencias, ejecuta migraciones y reinicia los servicios.
              </div>
            </div>

            <div className="flex justify-between px-6 py-3 border-t border-border">
              <a
                href={`${REPO_HTTPS}/compare/${info.installed?.slice(0, 7)}...${info.latest?.slice(0, 7)}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-accent hover:underline"
              >
                Ver diff completo en GitHub →
              </a>
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
