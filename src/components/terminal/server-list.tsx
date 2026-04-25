"use client"

import { Trash2, Plug, FileX2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface SshServerEntry {
  id: string
  host: string
  port: number
  username: string
  authType: string
  remarks: string | null
}

interface Props {
  servers: SshServerEntry[]
  onConnect: (s: SshServerEntry) => void
  onDelete: (id: string) => void
  onAdd: () => void
}

export function ServerListPanel({ servers, onConnect, onDelete, onAdd }: Props) {
  return (
    <div className="space-y-3">
      <Button
        size="sm"
        className="w-full bg-[#10b77f] text-white hover:bg-[#0fa371]"
        onClick={onAdd}
      >
        Add server
      </Button>

      <div className="rounded-lg border border-border bg-card/40">
        <div className="grid grid-cols-[1fr_70px] px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
          <span>Server IP</span>
          <span className="text-right">Operate</span>
        </div>

        {servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
            <FileX2 className="w-6 h-6 opacity-60" />
            <span className="text-xs">No Data</span>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {servers.map((s) => (
              <li key={s.id} className="grid grid-cols-[1fr_70px] px-3 py-2 items-center text-xs">
                <button
                  className="text-left hover:text-primary truncate"
                  onClick={() => onConnect(s)}
                  title={`${s.username}@${s.host}:${s.port}`}
                >
                  <div className="truncate">{s.remarks || s.host}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {s.username}@{s.host}:{s.port}
                  </div>
                </button>
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => onConnect(s)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary"
                    title="Conectar"
                  >
                    <Plug className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(s.id)}
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
