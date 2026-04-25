"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import {
  LogIn, RefreshCw, KeyRound, Trash2, MoreHorizontal, X, FolderTree,
} from "lucide-react"

async function safeJson(res: Response) {
  const text = await res.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { return {} }
}

interface Props {
  site: { id: string; adminUser: string; category: { id: string } | null; website: { domain: string } }
  categories: { id: string; name: string }[]
  onAutoLogin: () => void
  onUpdateCore: () => void
  onDelete: () => void
  onRefresh: () => void
  onChanged: () => void
}

export function WpRowActions({
  site, categories, onAutoLogin, onUpdateCore, onDelete, onRefresh, onChanged,
}: Props) {
  const { toast } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)
  const [catOpen, setCatOpen] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [selectedCat, setSelectedCat] = useState(site.category?.id ?? "")

  const close = () => setMenuOpen(false)

  const generatePwd = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#"
    let p = ""
    for (let i = 0; i < 18; i++) p += chars[Math.floor(Math.random() * chars.length)]
    setNewPassword(p)
  }

  const submitPassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      toast({ variant: "destructive", title: "Mínimo 8 caracteres" })
      return
    }
    const res = await fetch(`/api/wp/sites/${site.id}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    })
    const d = await safeJson(res)
    if (!res.ok) {
      toast({ variant: "destructive", title: "Error", description: d.error || "Error" })
      return
    }
    toast({ title: "Contraseña actualizada" })
    setPwdOpen(false); setNewPassword("")
  }

  const submitCategory = async () => {
    const res = await fetch(`/api/wp/sites/${site.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: selectedCat || null }),
    })
    if (!res.ok) {
      const d = await safeJson(res)
      toast({ variant: "destructive", title: "Error", description: d.error || "Error" })
      return
    }
    toast({ title: "Categoría actualizada" })
    setCatOpen(false)
    onChanged()
  }

  return (
    <div className="relative inline-flex items-center gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={() => { onAutoLogin(); close() }}
        title="Login como admin"
      >
        <LogIn className="w-3.5 h-3.5" />
      </Button>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted/30"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-md shadow-lg py-1 min-w-[180px]">
            <button onClick={() => { onRefresh(); close() }} className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5" /> Sincronizar info
            </button>
            <button onClick={() => { onUpdateCore(); close() }} className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5" /> Actualizar core
            </button>
            <button onClick={() => { setPwdOpen(true); close() }} className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center gap-2">
              <KeyRound className="w-3.5 h-3.5" /> Cambiar contraseña
            </button>
            <button onClick={() => { setCatOpen(true); close() }} className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center gap-2">
              <FolderTree className="w-3.5 h-3.5" /> Cambiar categoría
            </button>
            <div className="h-px bg-border my-1" />
            <button onClick={() => { onDelete(); close() }} className="w-full text-left px-3 py-2 text-xs hover:bg-destructive/10 text-destructive flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5" /> Eliminar sitio
            </button>
          </div>
        </>
      )}

      {pwdOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Cambiar contraseña de {site.adminUser}</h3>
              <button onClick={() => setPwdOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-3">
              <Label className="text-xs">Nueva contraseña</Label>
              <div className="flex gap-2">
                <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="font-mono" />
                <Button variant="outline" onClick={generatePwd}><RefreshCw className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={() => setPwdOpen(false)}>Cancelar</Button>
              <Button onClick={submitPassword} className="bg-accent text-accent-foreground hover:bg-accent/90">Actualizar</Button>
            </div>
          </div>
        </div>
      )}

      {catOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Categoría de {site.website.domain}</h3>
              <button onClick={() => setCatOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-3">
              <select
                value={selectedCat}
                onChange={(e) => setSelectedCat(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
              >
                <option value="">Sin categoría</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={() => setCatOpen(false)}>Cancelar</Button>
              <Button onClick={submitCategory} className="bg-accent text-accent-foreground hover:bg-accent/90">Guardar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
