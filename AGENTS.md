# Tezcapanel — Agent Instructions (Commit 6)

## Objetivo

Implementar el módulo Web con gestión real de sitios Nginx:
- Listar sitios activos e inactivos
- Crear nuevo sitio con virtual host
- Habilitar/deshabilitar sitios
- Ver logs de acceso y error
- SSL con Let's Encrypt (UI lista, ejecución via Byte AI)

---

## Contexto

- **Stack:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, NextAuth v5, Prisma + SQLite
- **Agente:** Node.js v0.2.0 en `/agent/server.js`, puerto 7070
- **Commits anteriores:** Dashboard con métricas, Byte AI con ejecución real de comandos
- **IMPORTANTE:** Este módulo opera sobre Linux — en Mac los comandos de Nginx no funcionarán.
  La UI debe funcionar en desarrollo aunque el agente reporte errores de ejecución.

---

## Parte 1 — Modelo de datos para sitios web

### `prisma/schema.prisma` — Agregar modelo Website

Agregar al final del archivo, después del modelo `AuditLog`:

```prisma
model Website {
  id        String   @id @default(cuid())
  domain    String   @unique
  rootPath  String
  phpVersion String? 
  ssl       Boolean  @default(false)
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Luego ejecutar:

```bash
npx prisma migrate dev --name add_website_model
npx prisma generate
```

---

## Parte 2 — API Routes del módulo Web

### `src/app/api/web/sites/route.ts` — CREAR

```typescript
import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET — listar todos los sitios
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sites = await prisma.website.findMany({
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ sites })
}

// POST — crear nuevo sitio
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { domain, rootPath, phpVersion } = await req.json()

  if (!domain || !rootPath) {
    return NextResponse.json({ error: "domain y rootPath requeridos" }, { status: 400 })
  }

  // Validar formato de dominio
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-\.]{0,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/
  if (!domainRegex.test(domain)) {
    return NextResponse.json({ error: "Formato de dominio inválido" }, { status: 400 })
  }

  const existing = await prisma.website.findUnique({ where: { domain } })
  if (existing) {
    return NextResponse.json({ error: "El dominio ya existe" }, { status: 409 })
  }

  const site = await prisma.website.create({
    data: { domain, rootPath, phpVersion },
  })

  // Registrar en audit log
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "create_website",
      target: domain,
      metadata: JSON.stringify({ domain, rootPath }),
    },
  })

  return NextResponse.json({ site })
}
```

---

### `src/app/api/web/sites/[id]/route.ts` — CREAR

```typescript
import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// PATCH — actualizar sitio (toggle active, ssl)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const data = await req.json()
  const site = await prisma.website.update({
    where: { id: params.id },
    data,
  })

  return NextResponse.json({ site })
}

// DELETE — eliminar sitio
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const site = await prisma.website.findUnique({ where: { id: params.id } })
  if (!site) return NextResponse.json({ error: "Sitio no encontrado" }, { status: 404 })

  await prisma.website.delete({ where: { id: params.id } })

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "delete_website",
      target: site.domain,
    },
  })

  return NextResponse.json({ ok: true })
}
```

---

## Parte 3 — Componentes del módulo Web

### `src/components/web/site-card.tsx` — CREAR

```tsx
"use client"

import { useState } from "react"
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
  const [loading, setLoading] = useState(false)

  async function handleToggle() {
    setLoading(true)
    await onToggle(site.id, !site.active)
    setLoading(false)
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar el sitio ${site.domain}?`)) return
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
        {/* Icono */}
        <div className={cn(
          "w-9 h-9 rounded-md flex items-center justify-center shrink-0",
          site.active
            ? "bg-primary/10 border border-primary/20"
            : "bg-muted border border-border"
        )}>
          <Globe className={cn(
            "w-4 h-4",
            site.active ? "text-primary" : "text-muted-foreground"
          )} />
        </div>

        {/* Info */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{site.domain}</span>
            {site.ssl && (
              <Badge variant="outline" className="border-primary/30 text-primary text-[10px] h-4">
                <Lock className="w-2.5 h-2.5 mr-1" />
                SSL
              </Badge>
            )}
            {site.phpVersion && (
              <Badge variant="secondary" className="text-[10px] h-4">
                PHP {site.phpVersion}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] h-4",
                site.active
                  ? "border-primary/30 text-primary"
                  : "border-border text-muted-foreground"
              )}
            >
              {site.active ? "Activo" : "Inactivo"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate font-mono">
            {site.rootPath}
          </p>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 text-muted-foreground hover:text-foreground"
          onClick={() => window.open(`http://${site.domain}`, "_blank")}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
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
```

---

### `src/components/web/create-site-dialog.tsx` — CREAR

```tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Plus, X } from "lucide-react"

interface CreateSiteDialogProps {
  onClose: () => void
  onCreate: (data: { domain: string; rootPath: string; phpVersion?: string }) => Promise<void>
}

export function CreateSiteDialog({ onClose, onCreate }: CreateSiteDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState({
    domain: "",
    rootPath: "/var/www/",
    phpVersion: "",
  })

  function handleDomainChange(value: string) {
    setForm((f) => ({
      ...f,
      domain: value,
      rootPath: `/var/www/${value || ""}`,
    }))
  }

  async function handleSubmit() {
    setError("")
    if (!form.domain) { setError("El dominio es requerido"); return }
    if (!form.rootPath) { setError("La ruta es requerida"); return }

    setLoading(true)
    try {
      await onCreate({
        domain: form.domain,
        rootPath: form.rootPath,
        phpVersion: form.phpVersion || undefined,
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al crear el sitio")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Nuevo sitio web</h2>
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 text-muted-foreground"
            onClick={onClose}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="domain">Dominio</Label>
            <Input
              id="domain"
              placeholder="ejemplo.com"
              value={form.domain}
              onChange={(e) => handleDomainChange(e.target.value)}
              className="bg-input border-border font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rootPath">Ruta del sitio</Label>
            <Input
              id="rootPath"
              placeholder="/var/www/ejemplo.com"
              value={form.rootPath}
              onChange={(e) => setForm({ ...form, rootPath: e.target.value })}
              className="bg-input border-border font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="php">
              Versión PHP
              <span className="text-muted-foreground ml-1 text-[10px]">(opcional)</span>
            </Label>
            <Input
              id="php"
              placeholder="8.2"
              value={form.phpVersion}
              onChange={(e) => setForm({ ...form, phpVersion: e.target.value })}
              className="bg-input border-border text-sm"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          {/* Info box */}
          <div className="bg-secondary/50 border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              Se creará el virtual host en Nginx y el directorio raíz.
              Para agregar SSL usa <strong className="text-primary">Byte AI</strong> después de crear el sitio.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Creando...</>
            ) : (
              <><Plus className="w-3.5 h-3.5 mr-1.5" />Crear sitio</>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

---

## Parte 4 — Página del módulo Web

### `src/app/(dashboard)/web/page.tsx` — REEMPLAZAR

```tsx
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
    try {
      const res = await fetch("/api/web/sites")
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Servidor Web</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestión de sitios Nginx, virtual hosts y SSL
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total",    value: sites.length,        className: "" },
          { label: "Activos",  value: activeSites.length,  className: "text-primary" },
          { label: "SSL",      value: sites.filter((s) => s.ssl).length, className: "text-accent" },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className={`text-2xl font-semibold mt-1 ${stat.className}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Lista de sitios */}
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
              Crea tu primer sitio web con el botón "Nuevo sitio"
            </p>
          </div>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Crear primer sitio
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {activeSites.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Activos
                </span>
                <Badge variant="secondary" className="text-[10px] h-4">{activeSites.length}</Badge>
              </div>
              {activeSites.map((site) => (
                <SiteCard
                  key={site.id}
                  site={site}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          {inactiveSites.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Inactivos
                </span>
                <Badge variant="secondary" className="text-[10px] h-4">{inactiveSites.length}</Badge>
              </div>
              {inactiveSites.map((site) => (
                <SiteCard
                  key={site.id}
                  site={site}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dialog */}
      {showCreate && (
        <CreateSiteDialog
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  )
}
```

---

## Parte 5 — Agregar comandos Nginx a la lista blanca del agente

### `agent/server.js` — Agregar a `ALLOWED_COMMANDS`

Buscar el array `ALLOWED_COMMANDS` y agregar estas líneas:

```js
// Nginx virtual hosts
/^cat \/etc\/nginx\/sites-available\/[\w\.\-]+$/,
/^ln -s \/etc\/nginx\/sites-available\/[\w\.\-]+ \/etc\/nginx\/sites-enabled\/[\w\.\-]+$/,
/^rm \/etc\/nginx\/sites-enabled\/[\w\.\-]+$/,
/^ls \/etc\/nginx\/sites-(available|enabled)$/,

// Crear directorios web
/^mkdir -p \/var\/www\/[\w\.\-]+(\/public_html)?$/,
/^chown -R \$USER:\$USER \/var\/www\/[\w\.\-]+$/,

// Escribir config (via tee)
/^tee \/etc\/nginx\/sites-available\/[\w\.\-]+$/,
```

---

## Paso final — Verificación y commit

```bash
# 1. Migrar base de datos
npx prisma migrate dev --name add_website_model
npx prisma generate

# 2. Build sin errores
npm run build

# 3. Verificar en dev:
# - /web carga con estado vacío y botón "Nuevo sitio"
# - Crear un sitio — aparece en la lista
# - Toggle activo/inactivo funciona
# - Eliminar funciona

# 4. Commit
git add .
git commit -m "feat: web module with nginx site management"
git push origin main
```

---

## Notas para el agente

- El módulo Web guarda los sitios en SQLite — esto es el registro del panel.
  La configuración real de Nginx en el servidor la maneja Byte AI via comandos.
- En Mac el módulo funciona completamente para crear/listar/eliminar sitios en la DB.
  Los comandos reales de Nginx solo corren en Linux.
- El diálogo de crear sitio usa un modal CSS puro — no requiere shadcn Dialog para evitar
  conflictos con el portal de React.
- `session.user.id` puede requerir el type declaration de next-auth. Si hay error de TypeScript,
  crear `src/types/next-auth.d.ts`:
  ```typescript
  import { DefaultSession } from "next-auth"
  declare module "next-auth" {
    interface Session {
      user: { id: string; role: string } & DefaultSession["user"]
    }
  }
  ```
- El campo `phpVersion` es opcional — para sitios estáticos o Node.js no se necesita.