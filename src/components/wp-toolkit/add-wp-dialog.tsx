"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { X, RefreshCw, ShoppingCart, FileText, Sparkles } from "lucide-react"
import { safeJson } from "@/lib/utils"

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
  categories: { id: string; name: string }[]
}

const TEMPLATES = [
  { id: "blog", label: "Blog", desc: "WordPress estándar para blog/sitio web", Icon: FileText },
  { id: "ecommerce", label: "Tienda", desc: "WordPress + WooCommerce + Storefront", Icon: ShoppingCart },
  { id: "landing", label: "Landing", desc: "WordPress + tema Astra", Icon: Sparkles },
] as const

export function AddWpDialog({ open, onClose, onCreated, categories }: Props) {
  const { toast } = useToast()
  const [domain, setDomain] = useState("")
  const [adminUser, setAdminUser] = useState("admin")
  const [adminEmail, setAdminEmail] = useState("")
  const [adminPassword, setAdminPassword] = useState("")
  const [siteTitle, setSiteTitle] = useState("")
  const [language, setLanguage] = useState("es_MX")
  const [template, setTemplate] = useState<"blog" | "ecommerce" | "landing">("blog")
  const [categoryId, setCategoryId] = useState("")
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const generatePassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$"
    let p = ""
    for (let i = 0; i < 18; i++) p += chars[Math.floor(Math.random() * chars.length)]
    setAdminPassword(p)
  }

  const submit = async () => {
    if (!domain.trim() || !adminUser || !adminEmail || !adminPassword) {
      toast({ variant: "destructive", title: "Faltan campos requeridos" })
      return
    }
    setLoading(true)
    const res = await fetch("/api/wp/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: domain.trim(),
        adminUser,
        adminEmail,
        adminPassword,
        siteTitle: siteTitle || domain,
        language,
        template,
        categoryId: categoryId || null,
      }),
    })
    const d = await safeJson(res)
    setLoading(false)
    if (!res.ok) {
      toast({
        variant: "destructive",
        title: "Instalación fallida",
        description: d.raw || d.error || "Error",
      })
      console.error("[wp install error]", d)
      return
    }
    toast({ title: "WordPress instalado", description: `Versión: ${d.site?.version ?? "—"}` })
    setDomain(""); setAdminEmail(""); setAdminPassword(""); setSiteTitle("")
    onCreated()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Agregar nuevo WordPress</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Template */}
          <div className="space-y-2">
            <Label className="text-xs">Plantilla</Label>
            <div className="grid grid-cols-3 gap-2">
              {TEMPLATES.map((t) => {
                const Icon = t.Icon
                const active = template === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplate(t.id)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      active ? "border-accent bg-accent/10" : "border-border hover:bg-muted/30"
                    }`}
                  >
                    <Icon className={`w-4 h-4 mb-1.5 ${active ? "text-accent" : "text-muted-foreground"}`} />
                    <div className="text-xs font-semibold">{t.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{t.desc}</div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Dominio *</Label>
              <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="ejemplo.com" className="font-mono text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Título del sitio</Label>
              <Input value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} placeholder="Mi sitio" className="text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Usuario admin *</Label>
              <Input value={adminUser} onChange={(e) => setAdminUser(e.target.value)} className="font-mono text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email admin *</Label>
              <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@ejemplo.com" className="text-sm" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Contraseña admin *</Label>
            <div className="flex gap-2">
              <Input value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} className="font-mono text-sm" />
              <Button variant="outline" type="button" onClick={generatePassword}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Idioma</Label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
              >
                <option value="es_MX">Español (México)</option>
                <option value="es_ES">Español (España)</option>
                <option value="en_US">English (US)</option>
                <option value="pt_BR">Português (Brasil)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Categoría</Label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
              >
                <option value="">Sin categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Tezcapanel creará automáticamente la base de datos, descargará WordPress core e instalará la plantilla seleccionada.
            La instalación puede tardar 1–3 minutos.
          </p>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={submit} disabled={loading} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {loading ? "Instalando..." : "Instalar WordPress"}
          </Button>
        </div>
      </div>
    </div>
  )
}
