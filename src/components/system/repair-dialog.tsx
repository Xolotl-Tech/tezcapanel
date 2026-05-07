"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { X, Wrench, Loader2 } from "lucide-react"

interface Props {
  open: boolean
  onClose: () => void
}

// Reparar = re-correr el flujo de update aunque no haya nueva versión.
// install.sh es idempotente: reinstala deps, reescribe units de systemd
// y CLI, regenera prisma, reinicia servicios. Suficiente para destrabar
// la mayoría de fallas (panel colgado, agente no responde, permisos
// chuecos tras cambios manuales).
//
// Reusa /api/system/update — el panel ya sabe lanzar el unit transitorio
// systemd-run que sobrevive al restart. Aquí sólo confirmamos antes y
// dejamos que el modal de update normal tome el flujo desde ahí.
export function RepairDialog({ open, onClose }: Props) {
  const { toast } = useToast()
  const [version, setVersion] = useState<string>("")
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch("/api/system/version")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.installed) setVersion(d.installed) })
      .catch(() => {})
  }, [open])

  if (!open) return null

  async function handleRepair() {
    setRunning(true)
    const r = await fetch("/api/system/update", { method: "POST" })
    if (r.status === 429) {
      toast({ variant: "destructive", title: "Demasiados intentos", description: "Espera un momento." })
      setRunning(false)
      return
    }
    if (!r.ok && r.status !== 202) {
      const data = await r.json().catch(() => ({}))
      toast({
        variant: "destructive",
        title: "No se pudo iniciar la reparación",
        description: data.detail || "Revisa los logs del servidor.",
      })
      setRunning(false)
      return
    }
    toast({
      title: "Reparación en curso",
      description: "El panel se reiniciará. Esto toma 30-60 segundos. Refresca cuando termine.",
    })
    onClose()
    setRunning(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold">Reparar panel</h2>
          </div>
          <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-sm leading-snug">
            Reparar el panel resuelve varios problemas inesperados.
          </p>
          {version && (
            <p className="text-xs text-muted-foreground">
              A punto de reparar a la versión: <strong className="text-foreground font-mono">{version}</strong>
            </p>
          )}
          <div className="bg-secondary/50 border border-border rounded-md p-3">
            <p className="text-xs text-muted-foreground leading-snug">
              Este proceso reinstala dependencias, regenera la BD y reinicia los servicios.
              Tu configuración y datos se conservan. El panel quedará inaccesible 30-60 segundos.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={running}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleRepair} disabled={running}>
            {running
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Reparando…</>
              : <><Wrench className="w-3.5 h-3.5 mr-1.5" />Reparar panel</>
            }
          </Button>
        </div>
      </div>
    </div>
  )
}
