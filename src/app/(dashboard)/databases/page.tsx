"use client"

import { useState, useEffect, useCallback } from "react"
import { CreateDatabaseDialog } from "@/components/databases/create-database-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Database, Plus, RefreshCw, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface DB {
  id: string
  name: string
  user: string
  host: string
  size?: number | null
  createdAt: string
}

export default function DatabasesPage() {
  const [databases, setDatabases] = useState<DB[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState("")

  const fetchDatabases = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/databases")
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setDatabases(data.databases ?? [])
    } catch {
      setError("Error al cargar las bases de datos")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDatabases() }, [fetchDatabases])

  async function handleCreate(formData: { name: string; user: string; password: string }) {
    const res = await fetch("/api/databases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? "Error al crear")
    await fetchDatabases()
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar la base de datos ${name}?`)) return
    await fetch(`/api/databases/${id}`, { method: "DELETE" })
    await fetchDatabases()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Bases de datos</h1>
          <p className="text-sm text-muted-foreground mt-1">MySQL / MariaDB</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost" size="icon"
            className="w-8 h-8 text-muted-foreground"
            onClick={fetchDatabases}
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
            Nueva DB
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-2xl font-semibold mt-1">{databases.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <p className="text-xs text-muted-foreground">Motor</p>
          <p className="text-sm font-semibold mt-1 text-primary">MySQL / MariaDB</p>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-5 h-16 animate-pulse" />
          ))}
        </div>
      ) : databases.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-muted border border-border flex items-center justify-center">
            <Database className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">No hay bases de datos</p>
            <p className="text-xs text-muted-foreground mt-1">
              Crea tu primera base de datos con el botón &quot;Nueva DB&quot;
            </p>
          </div>
          <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Crear primera DB
          </Button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Database className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Bases de datos</span>
            <Badge variant="secondary" className="ml-auto">{databases.length}</Badge>
          </div>
          <div className="divide-y divide-border">
            {databases.map((db) => (
              <div key={db.id} className="px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Database className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium font-mono">{db.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Usuario: <span className="font-mono">{db.user}</span> · Host: {db.host}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(db.id, db.name)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCreate && (
        <CreateDatabaseDialog
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  )
}