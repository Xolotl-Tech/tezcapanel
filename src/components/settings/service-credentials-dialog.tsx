"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, X, Lock, Check, AlertCircle } from "lucide-react"

interface ServiceCredentials {
  telegramBotToken?: string
  twilioAccountSid?: string
  twilioAuthToken?: string
  twilioPhoneNumber?: string
  sendgridApiKey?: string
  sendgridFromEmail?: string
}

interface ServiceCredentialsDialogProps {
  onClose: () => void
  onSave: (credentials: ServiceCredentials) => Promise<void>
  initialCredentials: ServiceCredentials
}

export function ServiceCredentialsDialog({
  onClose,
  onSave,
  initialCredentials,
}: ServiceCredentialsDialogProps) {
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<{ service: string; ok: boolean; msg: string } | null>(null)
  const [error, setError] = useState("")

  const [credentials, setCredentials] = useState<ServiceCredentials>(initialCredentials)

  async function handleTest(service: string) {
    setTesting(service)
    setTestStatus(null)

    try {
      const res = await fetch("/api/settings/service-credentials/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service,
          credentials: {
            ...(service === "telegram" && { telegramBotToken: credentials.telegramBotToken }),
            ...(service === "twilio" && {
              twilioAccountSid: credentials.twilioAccountSid,
              twilioAuthToken: credentials.twilioAuthToken,
              twilioPhoneNumber: credentials.twilioPhoneNumber,
            }),
            ...(service === "sendgrid" && {
              sendgridApiKey: credentials.sendgridApiKey,
              sendgridFromEmail: credentials.sendgridFromEmail,
            }),
          },
        }),
      })

      const data = await res.json()
      setTestStatus({
        service,
        ok: res.ok,
        msg: data.message || (res.ok ? "✓ Credenciales válidas" : "✗ Credenciales inválidas"),
      })
    } catch (err) {
      setTestStatus({
        service,
        ok: false,
        msg: err instanceof Error ? err.message : "Error al probar",
      })
    } finally {
      setTesting(null)
    }
  }

  async function handleSave() {
    setError("")
    setLoading(true)

    try {
      await onSave(credentials)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
          <h2 className="text-sm font-semibold">Credenciales de servicios de notificación</h2>
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 text-muted-foreground"
            onClick={onClose}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-6">
          {/* Telegram */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Telegram</h3>
              {testStatus?.service === "telegram" && (
                <Badge
                  variant={testStatus.ok ? "default" : "destructive"}
                  className="text-[10px]"
                >
                  {testStatus.ok ? <Check className="w-2.5 h-2.5 mr-1" /> : <AlertCircle className="w-2.5 h-2.5 mr-1" />}
                  {testStatus.msg}
                </Badge>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="telegram-token">Bot Token</Label>
              <Input
                id="telegram-token"
                type="password"
                placeholder="123456:ABCDefGHijKLmnoPQRstuvWXYZabcd"
                value={credentials.telegramBotToken || ""}
                onChange={(e) =>
                  setCredentials({ ...credentials, telegramBotToken: e.target.value })
                }
                className="bg-input border-border font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Obtén tu token desde BotFather en Telegram: /newbot
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleTest("telegram")}
              disabled={!credentials.telegramBotToken || testing === "telegram"}
              className="w-full"
            >
              {testing === "telegram" ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Probando...</>
              ) : (
                "Probar credenciales"
              )}
            </Button>
          </div>

          <div className="border-t border-border" />

          {/* Twilio WhatsApp */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">WhatsApp (Twilio)</h3>
              {testStatus?.service === "twilio" && (
                <Badge
                  variant={testStatus.ok ? "default" : "destructive"}
                  className="text-[10px]"
                >
                  {testStatus.ok ? <Check className="w-2.5 h-2.5 mr-1" /> : <AlertCircle className="w-2.5 h-2.5 mr-1" />}
                  {testStatus.msg}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="twilio-sid">Account SID</Label>
                <Input
                  id="twilio-sid"
                  type="password"
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={credentials.twilioAccountSid || ""}
                  onChange={(e) =>
                    setCredentials({ ...credentials, twilioAccountSid: e.target.value })
                  }
                  className="bg-input border-border font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="twilio-token">Auth Token</Label>
                <Input
                  id="twilio-token"
                  type="password"
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
                  value={credentials.twilioAuthToken || ""}
                  onChange={(e) =>
                    setCredentials({ ...credentials, twilioAuthToken: e.target.value })
                  }
                  className="bg-input border-border font-mono text-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="twilio-phone">WhatsApp Number</Label>
              <Input
                id="twilio-phone"
                placeholder="+14155552671"
                value={credentials.twilioPhoneNumber || ""}
                onChange={(e) =>
                  setCredentials({ ...credentials, twilioPhoneNumber: e.target.value })
                }
                className="bg-input border-border font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Número de WhatsApp de tu cuenta Twilio (con código de país)
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleTest("twilio")}
              disabled={!credentials.twilioAccountSid || !credentials.twilioAuthToken || testing === "twilio"}
              className="w-full"
            >
              {testing === "twilio" ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Probando...</>
              ) : (
                "Probar credenciales"
              )}
            </Button>
          </div>

          <div className="border-t border-border" />

          {/* SendGrid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Email (SendGrid)</h3>
              {testStatus?.service === "sendgrid" && (
                <Badge
                  variant={testStatus.ok ? "default" : "destructive"}
                  className="text-[10px]"
                >
                  {testStatus.ok ? <Check className="w-2.5 h-2.5 mr-1" /> : <AlertCircle className="w-2.5 h-2.5 mr-1" />}
                  {testStatus.msg}
                </Badge>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sendgrid-key">API Key</Label>
              <Input
                id="sendgrid-key"
                type="password"
                placeholder="SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={credentials.sendgridApiKey || ""}
                onChange={(e) =>
                  setCredentials({ ...credentials, sendgridApiKey: e.target.value })
                }
                className="bg-input border-border font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sendgrid-email">From Email</Label>
              <Input
                id="sendgrid-email"
                type="email"
                placeholder="noreply@tudominio.com"
                value={credentials.sendgridFromEmail || ""}
                onChange={(e) =>
                  setCredentials({ ...credentials, sendgridFromEmail: e.target.value })
                }
                className="bg-input border-border text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Email verificado en SendGrid desde el cual se enviarán las notificaciones
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleTest("sendgrid")}
              disabled={!credentials.sendgridApiKey || !credentials.sendgridFromEmail || testing === "sendgrid"}
              className="w-full"
            >
              {testing === "sendgrid" ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Probando...</>
              ) : (
                "Probar credenciales"
              )}
            </Button>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Info */}
          <div className="bg-secondary/50 border border-border rounded-lg p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Las credenciales se almacenan de forma segura en la base de datos.
                Todas las comunicaciones usan HTTPS y NextAuth protege tu cuenta.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border sticky bottom-0 bg-card">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90"
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Guardando...</>
            ) : (
              "Guardar credenciales"
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
