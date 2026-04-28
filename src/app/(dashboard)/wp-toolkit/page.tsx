"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { AddWpDialog } from "@/components/wp-toolkit/add-wp-dialog"
import { WpRowActions } from "@/components/wp-toolkit/wp-row-actions"
import {
  Plus, RefreshCw, Search, Briefcase, ExternalLink, ShieldCheck, ShieldOff,
} from "lucide-react"
import { safeJson } from "@/lib/utils"

interface WpSite {
  id: string
  template: string
  version: string | null
  adminUser: string
  adminEmail: string
  pluginsCount: number
  themesCount: number
  diskUsageMB: number
  lastSyncAt: string | null
  createdAt: string
  website: {
    id: string
    domain: string
    rootPath: string
    ssl: boolean
    active: boolean
  }
  category: { id: string; name: string; color: string } | null
}

interface Category {
  id: string
  name: string
  color: string
  builtIn: boolean
  _count?: { sites: number }
}

const TEMPLATE_LABELS: Record<string, string> = {
  blog: "Blog",
  ecommerce: "Tienda (WooCommerce)",
  landing: "Landing",
}

export default function WpToolkitPage() {
  const { toast } = useToast()
  const [sites, setSites] = useState<WpSite[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [s, c] = await Promise.all([
      fetch("/api/wp/sites").then(safeJson),
      fetch("/api/wp/categories").then(safeJson),
    ])
    setSites(s.sites ?? [])
    setCategories(c.categories ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = sites.filter((s) => {
    if (filterCategory !== "all" && s.category?.id !== filterCategory) return false
    if (search && !s.website.domain.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const refresh = async (id: string) => {
    await fetch(`/api/wp/sites/${id}`)
    await load()
  }

  const updateCore = async (id: string) => {
    toast({ title: "Actualizando core..." })
    const res = await fetch(`/api/wp/sites/${id}/update-core`, { method: "POST" })
    const d = await safeJson(res)
    if (!res.ok) {
      toast({ variant: "destructive", title: "Error", description: d.error || "No se pudo actualizar" })
      return
    }
    toast({ title: "WordPress actualizado", description: `Versión: ${d.site?.version}` })
    await load()
  }

  const autoLogin = async (id: string) => {
    const res = await fetch(`/api/wp/sites/${id}/login`, { method: "POST" })
    const d = await safeJson(res)
    if (!res.ok) {
      toast({ variant: "destructive", title: "Error", description: d.error || "No se pudo generar login" })
      return
    }
    window.open(d.loginUrl, "_blank")
  }

  const removeSite = async (id: string, domain: string) => {
    if (!confirm(`¿Eliminar el sitio ${domain}? Esto borra archivos y la base de datos.`)) return
    const res = await fetch(`/api/wp/sites/${id}`, { method: "DELETE" })
    const d = await safeJson(res)
    if (!res.ok) {
      toast({ variant: "destructive", title: "Error", description: d.error || "No se pudo eliminar" })
      return
    }
    toast({ title: "Sitio eliminado" })
    await load()
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Briefcase className="w-4 h-4" /> WP Toolkit
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Instala y gestiona sitios WordPress: blogs, tiendas WooCommerce, landings.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Actualizar
          </Button>
          <Button onClick={() => setAddOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Agregar WordPress
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center rounded-lg border border-border bg-card/40 px-4 py-3">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-background border border-border rounded-md px-3 py-2 text-sm"
        >
          <option value="all">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c._count?.sites ?? 0})</option>
          ))}
        </select>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar dominio..."
            className="pl-8"
          />
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} sitios</span>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card/40 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b border-border">
            <tr>
              <th className="text-left px-4 py-3">Dominio</th>
              <th className="text-left px-4 py-3">Categoría</th>
              <th className="text-left px-4 py-3">Tipo</th>
              <th className="text-left px-4 py-3">Versión</th>
              <th className="text-left px-4 py-3">Plugins / Temas</th>
              <th className="text-left px-4 py-3">Espacio</th>
              <th className="text-center px-4 py-3">SSL</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Cargando...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <Briefcase className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm">Sin sitios WordPress</p>
                  <p className="text-xs text-muted-foreground mt-1">Crea tu primer sitio con el botón "Agregar WordPress"</p>
                </td>
              </tr>
            )}
            {!loading && filtered.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <a
                    href={`https://${s.website.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-sm hover:text-accent flex items-center gap-1"
                  >
                    {s.website.domain}
                    <ExternalLink className="w-3 h-3 opacity-50" />
                  </a>
                  <div className="text-xs text-muted-foreground">{s.adminUser}</div>
                </td>
                <td className="px-4 py-3">
                  {s.category ? (
                    <span
                      className="text-xs px-2 py-0.5 rounded border"
                      style={{
                        background: `${s.category.color}1a`,
                        borderColor: `${s.category.color}55`,
                        color: s.category.color,
                      }}
                    >
                      {s.category.name}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">{TEMPLATE_LABELS[s.template] ?? s.template}</td>
                <td className="px-4 py-3 font-mono text-xs">{s.version ?? "—"}</td>
                <td className="px-4 py-3 text-xs">
                  <span className="text-emerald-500">{s.pluginsCount}</span> /{" "}
                  <span>{s.themesCount}</span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {s.diskUsageMB > 0 ? `${s.diskUsageMB} MB` : "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  {s.website.ssl ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-500 inline" />
                  ) : (
                    <ShieldOff className="w-4 h-4 text-muted-foreground inline" />
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <WpRowActions
                    site={s}
                    categories={categories}
                    onAutoLogin={() => autoLogin(s.id)}
                    onUpdateCore={() => updateCore(s.id)}
                    onDelete={() => removeSite(s.id, s.website.domain)}
                    onRefresh={() => refresh(s.id)}
                    onChanged={load}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddWpDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        categories={categories}
        onCreated={() => { setAddOpen(false); load() }}
      />
    </div>
  )
}
