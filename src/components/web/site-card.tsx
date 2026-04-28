"use client"

import { useState } from "react"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Globe, Lock, MoreVertical, Power, Trash2, ExternalLink } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

interface Site {
  id: string
  domain: string
  rootPath: string
  phpVersion?: string | null
  ssl: boolean
  active: boolean
  createdAt: string
}

interface SiteCardProps {
  site: Site
  onToggle: (id: string, active: boolean) => Promise<void>
  onDelete: (id: string, domain: string) => Promise<void>
}

export function SiteCard({ site, onToggle, onDelete }: SiteCardProps) {
  const confirm = useConfirm()
  const [loading, setLoading] = useState(false)

  async function handleToggle() {
    setLoading(true)
    await onToggle(site.id, !site.active)
    setLoading(false)
  }

  async function handleDelete() {
    if (!(await confirm(`¿Eliminar el sitio ${site.domain}?`))) return
    setLoading(true)
    await onDelete(site.id, site.domain)
    setLoading(false)
  }

  return (
    <div className={cn(
      "bg-card border border-border rounded-lg p-5 flex items-center justify-between gap-4",
      !site.active && "opacity-60"
    )}>
      <div className="flex items-center gap-4 min-w-0">
        <div className={cn(
          "w-9 h-9 rounded-md flex items-center justify-center shrink-0",
          site.active ? "bg-primary/10 border border-primary/20" : "bg-muted border border-border"
        )}>
          <Globe className={cn("w-4 h-4", site.active ? "text-primary" : "text-muted-foreground")} />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{site.domain}</span>
            {site.ssl && (
              <Badge variant="outline" className="border-primary/30 text-primary text-[10px] h-4">
                <Lock className="w-2.5 h-2.5 mr-1" />SSL
              </Badge>
            )}
            {site.phpVersion && (
              <Badge variant="secondary" className="text-[10px] h-4">PHP {site.phpVersion}</Badge>
            )}
            <Badge variant="outline" className={cn(
              "text-[10px] h-4",
              site.active ? "border-primary/30 text-primary" : "border-border text-muted-foreground"
            )}>
              {site.active ? "Activo" : "Inactivo"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate font-mono">{site.rootPath}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="ghost" size="icon"
          className="w-8 h-8 text-muted-foreground hover:text-foreground"
          onClick={() => window.open(`http://${site.domain}`, "_blank")}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost" size="icon"
              className="w-8 h-8 text-muted-foreground hover:text-foreground"
              disabled={loading}
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={handleToggle}>
              <Power className="mr-2 h-3.5 w-3.5" />
              {site.active ? "Deshabilitar" : "Habilitar"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}