"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { X, Send, Loader2 } from "lucide-react"

interface Props {
  open: boolean
  onClose: () => void
}

const CATEGORIES = [
  { id: "general", label: "Comentario general" },
  { id: "bug", label: "Reportar un bug" },
  { id: "feature", label: "Sugerir una función" },
  { id: "other", label: "Otro" },
] as const

export function FeedbackDialog({ open, onClose }: Props) {
  const { toast } = useToast()
  const [category, setCategory] = useState<string>("general")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)

  if (!open) return null

  async function handleSubmit() {
    if (!subject.trim() || !message.trim()) {
      toast({ variant: "destructive", title: "Faltan datos", description: "Asunto y mensaje son requeridos." })
      return
    }
    setSending(true)
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, subject, message }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        toast({ variant: "destructive", title: "No se pudo enviar", description: data.error ?? "Intenta más tarde." })
        return
      }
      toast({
        title: "Feedback recibido",
        description: data.delivered
          ? "Gracias, lo enviamos por correo a Xolotl Tech."
          : "Gracias. Quedó guardado y te lo agradecemos.",
      })
      setSubject(""); setMessage(""); setCategory("general")
      onClose()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Enviar feedback</h2>
          <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-muted-foreground leading-snug">
            Tu opinión va directo a Xolotl Tech para mejorar el panel. Cuéntanos qué te gustó, qué falló o qué te haría falta.
          </p>

          <div className="space-y-1.5">
            <Label className="text-xs">Categoría</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Asunto</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Resumen breve"
              maxLength={200}
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Mensaje</Label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={5000}
              placeholder="Detalles, pasos para reproducir, lo que esperabas, etc."
              className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm resize-none"
            />
            <div className="text-[10px] text-muted-foreground text-right">
              {message.length}/5000
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={sending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={sending}>
            {sending
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Enviando…</>
              : <><Send className="w-3.5 h-3.5 mr-1.5" />Enviar</>
            }
          </Button>
        </div>
      </div>
    </div>
  )
}
