"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Edit2, Key } from "lucide-react"
import { EditChannelDialog } from "./edit-channel-dialog"
import { ServiceCredentialsDialog } from "./service-credentials-dialog"

interface Preferences {
  email: boolean
  whatsapp: boolean
  telegram: boolean
  slack: boolean
  whatsappPhone?: string
  telegramChatId?: string
  slackWebhook?: string
}

export function NotificationChannels() {
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingChannel, setEditingChannel] = useState<string | null>(null)
  const [showCredentials, setShowCredentials] = useState(false)
  const [credentials, setCredentials] = useState({
    telegramBotToken: "",
    twilioAccountSid: "",
    twilioAuthToken: "",
    twilioPhoneNumber: "",
    sendgridApiKey: "",
    sendgridFromEmail: "",
  })

  useEffect(() => {
    fetchPreferences()
    fetchCredentials()
  }, [])

  async function fetchCredentials() {
    try {
      const res = await fetch("/api/settings/service-credentials")
      if (res.ok) {
        const data = await res.json()
        setCredentials(data.credentials)
      }
    } catch (error) {
      console.error("Error fetching credentials:", error)
    }
  }

  async function fetchPreferences() {
    try {
      const res = await fetch("/api/settings/notification-channels")
      if (!res.ok) {
        console.error("Error fetching notification preferences:", res.status)
        setError("Error cargando preferencias")
        return
      }
      const data = await res.json()
      setPrefs(data.prefs)
    } catch (error) {
      console.error("Error fetching preferences:", error)
      setError("Error cargando preferencias")
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveChannel(type: string, enabled: boolean, value: string) {
    try {
      const updateData: Record<string, boolean | string> = {
        [type]: enabled,
      }

      if (type === "whatsapp") updateData.whatsappPhone = value
      if (type === "telegram") updateData.telegramChatId = value
      if (type === "slack") updateData.slackWebhook = value

      const res = await fetch("/api/settings/notification-channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      })

      const data = await res.json()
      if (res.ok) {
        setPrefs(data.prefs)
      } else {
        throw new Error(data.error || "Error al guardar")
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Error desconocido"
      setError(errorMessage)
      throw error
    }
  }

  const channels: Array<{
    type: "email" | "whatsapp" | "telegram" | "slack"
    name: string
    enabled: boolean
    value: string
  }> = [
    {
      type: "email",
      name: "Email",
      enabled: prefs?.email ?? false,
      value: "",
    },
    {
      type: "whatsapp",
      name: "WhatsApp",
      enabled: prefs?.whatsapp ?? false,
      value: prefs?.whatsappPhone || "",
    },
    {
      type: "telegram",
      name: "Telegram",
      enabled: prefs?.telegram ?? false,
      value: prefs?.telegramChatId || "",
    },
    {
      type: "slack",
      name: "Slack",
      enabled: prefs?.slack ?? false,
      value: prefs?.slackWebhook || "",
    },
  ]

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-medium">Canales de notificación</h2>
        </div>
        <div className="px-5 py-4 h-24 animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-medium">Canales de notificación</h2>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-medium">Canales de notificación</h2>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setShowCredentials(true)}
          >
            <Key className="w-3.5 h-3.5" />
            Credenciales de API
          </Button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {channels.map((channel, index) => (
            <div key={channel.type}>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{channel.name}</span>
                  <Badge
                    variant={channel.enabled ? "default" : "outline"}
                    className="text-[10px] h-4"
                  >
                    {channel.enabled ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setEditingChannel(channel.type)}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
              </div>
              {index < channels.length - 1 && <Separator className="mt-3" />}
            </div>
          ))}
        </div>
      </div>

      {editingChannel && (
        <EditChannelDialog
          channel={
            channels.find((c) => c.type === editingChannel) || {
              name: "",
              type: "email" as const,
              enabled: false,
              value: "",
            }
          }
          onClose={() => setEditingChannel(null)}
          onSave={(enabled, value) =>
            handleSaveChannel(editingChannel, enabled, value)
          }
        />
      )}

      {showCredentials && (
        <ServiceCredentialsDialog
          onClose={() => setShowCredentials(false)}
          onSave={async (creds) => {
            const res = await fetch("/api/settings/service-credentials", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(creds),
            })
            if (!res.ok) {
              const data = await res.json()
              throw new Error(data.error || "Error al guardar credenciales")
            }
            const data = await res.json()
            setCredentials(data.credentials)
          }}
          initialCredentials={credentials}
        />
      )}
    </>
  )
}
