"use client"

import { useCallback, useEffect, useState } from "react"
import { Toggle } from "@/components/security/toggle"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { RefreshCw, Info, Terminal } from "lucide-react"

async function safeJson(res: Response) {
  const text = await res.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { return {} }
}

interface Compiler {
  key: string
  label: string
  installed: boolean
  path: string | null
  accessible: boolean
}

export function CompilerAccessTab() {
  const { toast } = useToast()
  const [compilers, setCompilers] = useState<Compiler[]>([])
  const [agentUp, setAgentUp] = useState(true)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const d = await fetch("/api/security/compiler").then(safeJson)
    setAgentUp(!!d.agentAvailable)
    setCompilers(d.compilers ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = async (key: string, enabled: boolean) => {
    const res = await fetch("/api/security/compiler", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, enabled }),
    })
    const d = await safeJson(res)
    if (!res.ok) {
      toast({ variant: "destructive", title: "Error", description: d.error || "No se pudo cambiar" })
      await load()
      return
    }
    toast({ title: `${key} ${enabled ? "habilitado" : "restringido"}` })
    await load()
  }

  if (loading) return <div className="text-sm text-muted-foreground py-8 text-center">Cargando...</div>

  const disabledCount = compilers.filter((c) => c.installed && !c.accessible).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card/40 px-4 py-3">
        <Terminal className="w-4 h-4 text-muted-foreground" />
        <div className="text-sm">
          Controla qué compiladores e intérpretes son accesibles para usuarios no-root.
          <span className="text-muted-foreground ml-1">Deshabilitar evita que un atacante compile exploits tras un RCE.</span>
        </div>
        <Button variant="outline" onClick={load} className="ml-auto">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Actualizar
        </Button>
      </div>

      {!agentUp && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          <strong className="text-amber-500">Agente no disponible:</strong>{" "}
          <span className="text-muted-foreground">no se puede leer/modificar permisos.</span>
        </div>
      )}

      {disabledCount > 0 && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs flex items-center gap-2">
          <Info className="w-4 h-4 text-emerald-500" />
          <span>{disabledCount} compilador{disabledCount > 1 ? "es" : ""} restringido{disabledCount > 1 ? "s" : ""} a root</span>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card/40">
        <div className="grid grid-cols-5 text-xs text-muted-foreground px-4 py-3 border-b border-border">
          <div className="col-span-2">Compilador / intérprete</div>
          <div>Ruta</div>
          <div>Estado</div>
          <div className="text-right">Acceso</div>
        </div>
        {compilers.map((c) => (
          <div key={c.key} className="grid grid-cols-5 items-center px-4 py-3 border-b border-border last:border-0">
            <div className="col-span-2">
              <div className="text-sm font-semibold">{c.label}</div>
              <div className="text-xs text-muted-foreground font-mono">{c.key}</div>
            </div>
            <div className="text-xs font-mono text-muted-foreground">
              {c.path ?? <span className="italic">no instalado</span>}
            </div>
            <div>
              {!c.installed ? (
                <span className="text-xs text-muted-foreground">No instalado</span>
              ) : c.accessible ? (
                <span className="text-xs text-amber-500">Accesible a todos</span>
              ) : (
                <span className="text-xs text-emerald-500">Solo root</span>
              )}
            </div>
            <div className="flex justify-end">
              <Toggle
                checked={c.accessible}
                onChange={(v) => toggle(c.key, v)}
                disabled={!c.installed || !agentUp}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        <Info className="w-3 h-3 inline mr-1" />
        Habilitado = permisos 0755 (todos pueden ejecutar) • Restringido = permisos 0700 (solo root)
      </p>
    </div>
  )
}
