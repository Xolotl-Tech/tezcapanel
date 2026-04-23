"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, X, Send } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface EditChannelDialogProps {
  channel: {
    name: string
    type: "email" | "whatsapp" | "telegram" | "slack"
    enabled: boolean
    value?: string
  }
  onClose: () => void
  onSave: (enabled: boolean, value: string) => Promise<void>
}

const placeholders: Record<string, string> = {
  email: "tu@email.com",
  whatsapp: "+1234567890",
  telegram: "123456789",
  slack: "https://hooks.slack.com/services/...",
}

const labels: Record<string, string> = {
  email: "Email",
  whatsapp: "Número de teléfono",
  telegram: "Chat ID",
  slack: "Webhook URL",
}

const instructions: Record<string, { title: string; steps: string[] }> = {
  email: {
    title: "Cómo configurar Email",
    steps: [
      "Usa tu dirección de email personal o corporativa",
      "Asegúrate de que puedas recibir correos",
      "Revisa la carpeta de spam si no lo recibes",
    ],
  },
  whatsapp: {
    title: "Cómo obtener tu número de WhatsApp",
    steps: [
      "Usa tu número de teléfono con código de país",
      "Ejemplo: +34 612 345 678 o +1 415 555 0123",
      "Asegúrate de que sea un número válido",
    ],
  },
  telegram: {
    title: "Cómo obtener tu Chat ID",
    steps: [
      "Abre Telegram y busca @userinfobot",
      "Escribe /start para obtener tu Chat ID",
      "También puedes usar @get_id_bot",
    ],
  },
  slack: {
    title: "Cómo crear un Webhook de Slack",
    steps: [
      "Ve a https://api.slack.com/apps",
      "Crea una app o usa una existente",
      "Ve a Incoming Webhooks y crea uno nuevo",
      "Copia la URL completa del webhook",
    ],
  },
}

export function EditChannelDialog({ channel, onClose, onSave }: EditChannelDialogProps) {
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [enabled, setEnabled] = useState(channel.enabled)
  const [value, setValue] = useState(channel.value || "")
  const [error, setError] = useState("")
  const { toast } = useToast()

  async function handleSaveChannel() {
    setError("")
    
    if (enabled && !value.trim()) {
      setError("Este campo es requerido para habilitar el canal")
      return
    }

    setLoading(true)
    try {
      await onSave(enabled, value)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setLoading(false)
    }
  }

  async function handleTestChannel() {
    if (!enabled || !value.trim()) {
      setError("Habilita el canal e ingresa los datos antes de hacer una prueba")
      return
    }

    setTesting(true)
    try {
      const res = await fetch("/api/settings/notification-channels/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: channel.type,
          value: value,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        toast({
          title: "Prueba enviada ✅",
          description: data.message,
          variant: "default",
        })
      } else {
        throw new Error(data.error || "Error al enviar prueba")
      }
    } catch (err: unknown) {
      toast({
        title: "Error en la prueba",
        description: err instanceof Error ? err.message : "No se pudo enviar la prueba",
        variant: "destructive",
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Configurar {channel.name}</h2>
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 text-muted-foreground"
            onClick={onClose}
            disabled={loading}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center justify-between p-3 bg-secondary/50 border border-border rounded-lg">
            <span className="text-sm">Habilitar {channel.name}</span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 cursor-pointer"
            />
          </div>

          {enabled && channel.type !== "email" && (
            <div className="space-y-2">
              <Label htmlFor="value">{labels[channel.type] || "Valor"}</Label>
              <Input
                id="value"
                placeholder={placeholders[channel.type] || "Ingresa el valor"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                type={channel.type === "slack" ? "url" : "text"}
                className="bg-input border-border font-mono text-sm"
              />
              
              {/* Instrucciones contextuales */}
              {instructions[channel.type] && (
                <div className="bg-secondary/50 border border-border rounded-lg p-3 mt-3">
                  <p className="text-xs font-semibold text-foreground mb-2">
                    {instructions[channel.type].title}
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {instructions[channel.type].steps.map((step, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="font-semibold text-primary shrink-0">{i + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          <div className="bg-secondary/50 border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              Los datos se encriptan y se almacenan de forma segura.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-2 px-6 py-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestChannel}
            disabled={loading || testing || !enabled || !value.trim()}
            className="border-primary/30 text-primary hover:bg-primary/10"
          >
            {testing ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Enviando...</>
            ) : (
              <><Send className="w-3.5 h-3.5 mr-1.5" />Probar</>
            )}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={loading || testing}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90"
              onClick={handleSaveChannel}
              disabled={loading || testing}
            >
              {loading ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Guardando...</>
              ) : (
                <>Guardar</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
