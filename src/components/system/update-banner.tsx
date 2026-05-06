"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Sparkles, X, ArrowUpCircle, CheckCircle2, Loader2 } from "lucide-react"

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

  // Estados visibles:
  //  - cargando: pill "Verificando…"
  //  - update disponible: pill accent "Actualizar a X.Y.Z"
  //  - al día: pill muted "v1.0.0"
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

      {open && (
        <UpdateModal info={info} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

function UpdateModal({ info, onClose }: { info: VersionResponse; onClose: () => void }) {
  const updateAvailable = info.updateAvailable
  const release = info.release

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border">
          <div className="flex items-start gap-3">
            {updateAvailable ? (
              <ArrowUpCircle className="w-5 h-5 text-accent mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
            )}
            <div>
              <h3 className="text-sm font-semibold">
                {updateAvailable
                  ? `Actualización disponible: ${info.latest}`
                  : `Tezcapanel v${info.installed}`}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {updateAvailable
                  ? `Tienes la versión ${info.installed} instalada`
                  : "Estás en la última versión"}
                {release && (
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
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        {/* Cuerpo: categorías del release */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {updateAvailable && release && release.categories.length > 0 ? (
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
              Esta actualización no incluye notas detalladas. Revisa el repositorio
              para más contexto.
            </p>
          ) : (
            <div className="text-xs text-muted-foreground space-y-2">
              <p>
                Estás corriendo la última versión publicada. Cuando publiquemos una
                nueva versión, este banner cambiará a “Actualizar” y verás aquí la
                lista de cambios incluidos.
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
          )}
        </div>

        {/* Footer con acciones */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          {updateAvailable ? (
            <>
              <Button size="sm" variant="ghost" onClick={onClose}>
                Tal vez después
              </Button>
              <Button
                size="sm"
                disabled
                title="Próximamente: actualización con un click"
                className="opacity-70"
              >
                Actualizar ahora
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
