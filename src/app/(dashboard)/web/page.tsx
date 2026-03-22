"use client"

import { useState, useEffect, useCallback } from "react"
import { SiteCard } from "@/components/web/site-card"
import { CreateSiteDialog } from "@/components/web/create-site-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Globe, Plus, RefreshCw } from "lucide-react"

interface Site {
  id: string
  domain: string
  rootPath: string
  phpVersion?: string | null
  ssl: boolean
  active: boolean
  createdAt: string
}

export default function WebPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState("")

  const fetchSites = useCallback(async () => {
  setLoading(true)
  setError("") // limpiar error previo
  try {
    const res = await fetch("/api/web/sites")
    if (!res.ok) {
      if (res.status === 401) {
        setError("")  // no mostrar error en 401, el middleware redirige
        return
      }
      setError("Error al cargar los sitios")
      return
    }
    const data = await res.json()
    setSites(data.sites ?? [])
  } catch {
    setError("Error al cargar los sitios")
  } finally {
    setLoading(false)
  }
}, [])

  useEffect(() => { fetchSites() }, [fetchSites])

  async function handleCreate(formData: { domain: string; rootPath: string; phpVersion?: string }) {
    const res = await fetch("/api/web/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? "Error al crear el sitio")
    await fetchSites()
  }

  async function handleToggle(id: string, active: boolean) {
    await fetch(`/api/web/sites/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    })
    await fetchSites()
  }

  async function handleDelete(id: string) {
    await fetch(`/api/web/sites/${id}`, { method: "DELETE" })
    await fetchSites()
  }

  const activeSites   = sites.filter((s) => s.active)
  const inactiveSites = sites.filter((s) => !s.active)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Servidor Web</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestión de sitios Nginx, virtual hosts y SSL
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost" size="icon"
            className="w-8 h-8 text-muted-foreground"
            onClick={fetchSites}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90 h-8"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Nuevo sitio
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total",   value: sites.length },
          { label: "Activos", value: activeSites.length,           className: "text-primary" },
          { label: "SSL",     value: sites.filter((s) => s.ssl).length, className: "text-accent" },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className={`text-2xl font-semibold mt-1 ${stat.className ?? ""}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-5 h-16 animate-pulse" />
          ))}
        </div>
      ) : sites.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-muted border border-border flex items-center justify-center">
            <Globe className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">No hay sitios configurados</p>
            <p className="text-xs text-muted-foreground mt-1">
                Crea tu primer sitio web con el botón &quot;Nuevo sitio&quot;
            </p>
          </div>
          <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Crear primer sitio
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {activeSites.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Activos</span>
                <Badge variant="secondary" className="text-[10px] h-4">{activeSites.length}</Badge>
              </div>
              {activeSites.map((site) => (
                <SiteCard key={site.id} site={site} onToggle={handleToggle} onDelete={handleDelete} />
              ))}
            </div>
          )}
          {inactiveSites.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Inactivos</span>
                <Badge variant="secondary" className="text-[10px] h-4">{inactiveSites.length}</Badge>
              </div>
              {inactiveSites.map((site) => (
                <SiteCard key={site.id} site={site} onToggle={handleToggle} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreateSiteDialog onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      )}
    </div>
  )
}
