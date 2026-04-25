"use client"

import { useMemo, useState } from "react"
import { FileX2, Play, Search, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export interface SshCommandEntry {
  id: string
  name: string
  command: string
}

interface Props {
  commands: SshCommandEntry[]
  onRun: (c: SshCommandEntry) => void
  onDelete: (id: string) => void
  onAdd: () => void
}

export function CommandListPanel({ commands, onRun, onDelete, onAdd }: Props) {
  const [q, setQ] = useState("")
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return commands
    return commands.filter((c) => c.name.toLowerCase().includes(t))
  }, [q, commands])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="bg-[#10b77f] text-white hover:bg-[#0fa371] flex-shrink-0"
          onClick={onAdd}
        >
          Add command
        </Button>
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Command name"
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/40">
        <div className="grid grid-cols-[1fr_70px] px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
          <span>Command name</span>
          <span className="text-right">Operate</span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
            <FileX2 className="w-6 h-6 opacity-60" />
            <span className="text-xs">No Data</span>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((c) => (
              <li key={c.id} className="grid grid-cols-[1fr_70px] px-3 py-2 items-center text-xs">
                <button
                  className="text-left hover:text-primary truncate"
                  onClick={() => onRun(c)}
                  title={c.command}
                >
                  <div className="truncate">{c.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate font-mono">{c.command}</div>
                </button>
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => onRun(c)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary"
                    title="Ejecutar en la terminal activa"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(c.id)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
