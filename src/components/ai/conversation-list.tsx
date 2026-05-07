"use client"

import { useEffect, useState } from "react"
import { listConversations, deleteConversation, type ConversationSummary } from "@/lib/byte-api"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { Plus, Trash2, MessageSquare, ArrowLeft } from "lucide-react"

interface Props {
  currentId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onBack: () => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffH = (now.getTime() - d.getTime()) / 36e5
  if (diffH < 24) return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
  if (diffH < 24 * 7) return d.toLocaleDateString("es-MX", { weekday: "short", hour: "2-digit", minute: "2-digit" })
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" })
}

export function ConversationList({ currentId, onSelect, onNew, onBack }: Props) {
  const [items, setItems] = useState<ConversationSummary[] | null>(null)
  const confirm = useConfirm()

  useEffect(() => {
    listConversations().then(setItems)
  }, [])

  async function handleDelete(id: string, title: string, e: React.MouseEvent) {
    e.stopPropagation()
    const ok = await confirm(`¿Borrar "${title}"? Esta acción no se puede deshacer.`, "Borrar conversación")
    if (!ok) return
    const success = await deleteConversation(id)
    if (success) {
      setItems((prev) => prev?.filter((c) => c.id !== id) ?? [])
      if (currentId === id) onNew()
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={onBack}
          title="Volver al chat"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </Button>
        <span className="text-xs font-medium flex-1">Historial</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs gap-1.5"
          onClick={onNew}
        >
          <Plus className="w-3 h-3" />
          Nueva
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {items === null && (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">Cargando…</div>
        )}
        {items?.length === 0 && (
          <div className="px-4 py-8 text-center">
            <MessageSquare className="w-6 h-6 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-xs text-muted-foreground">Aún no tienes conversaciones</p>
            <Button size="sm" className="mt-3 h-7 text-xs" onClick={onNew}>
              <Plus className="w-3 h-3 mr-1" />
              Empezar la primera
            </Button>
          </div>
        )}
        {items && items.length > 0 && (
          <ul className="divide-y divide-border">
            {items.map((c) => (
              <li
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`group px-3 py-2.5 cursor-pointer hover:bg-muted/40 flex items-start gap-2 ${
                  currentId === c.id ? "bg-muted/60" : ""
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{c.title}</div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                    <span>{formatDate(c.updatedAt)}</span>
                    <span>·</span>
                    <span>{c._count.messages} {c._count.messages === 1 ? "mensaje" : "mensajes"}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => handleDelete(c.id, c.title, e)}
                  className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-destructive p-1"
                  title="Borrar"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
