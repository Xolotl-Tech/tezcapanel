import { sendNotificationToChannels } from "@/lib/notification-services"
import { prisma } from "@/lib/prisma"

/**
 * Enviar notificación de incidencia del servidor
 */
export async function notifyServerIncident(
  userId: string,
  subject: string,
  message: string,
  severity: "info" | "warning" | "critical" = "warning"
) {
  try {
    // Obtener preferencias de notificación del usuario y su email
    const prefs = await prisma.notificationPreferences.findUnique({
      where: { userId },
      include: { user: true },
    })

    if (!prefs) return

    // Construir lista de canales activos
    const channels: Array<{ type: string; value: string }> = []

    if (prefs.email && prefs.user?.email) channels.push({ type: "email", value: prefs.user.email })
    if (prefs.whatsapp && prefs.whatsappPhone) {
      channels.push({ type: "whatsapp", value: prefs.whatsappPhone })
    }
    if (prefs.telegram && prefs.telegramChatId) {
      channels.push({ type: "telegram", value: prefs.telegramChatId })
    }
    if (prefs.slack && prefs.slackWebhook) {
      channels.push({ type: "slack", value: prefs.slackWebhook })
    }

    if (channels.length === 0) return

    // Preparar mensaje formateado
    const severityEmoji =
      severity === "critical" ? "🔴" : severity === "warning" ? "🟠" : "🔵"

    const formattedMessage = `${severityEmoji} **${subject}**

${message}

Timestamp: ${new Date().toLocaleString("es-ES")}
Sistema: Tezcapanel`

    // Enviar a todos los canales configurados
    const results = await sendNotificationToChannels(channels, subject, formattedMessage)

    // Registrar envío
    console.log(`[NOTIFICATION] Sent to ${results.length} channels:`, results)

    return results
  } catch (error) {
    console.error("[NOTIFICATION] Error sending incident notification:", error)
  }
}

/**
 * Enviar notificación de alerta de servidor
 */
export async function notifyServerAlert(
  userId: string,
  serviceName: string,
  status: "down" | "recovered" | "high-cpu" | "high-memory" | "disk-full"
) {
  const alerts: Record<string, { subject: string; message: string; severity: "info" | "warning" | "critical" }> = {
    down: {
      subject: `⚠️ Servicio ${serviceName} está CAÍDO`,
      message: `El servicio ${serviceName} dejó de responder y requiere atención inmediata.`,
      severity: "critical",
    },
    recovered: {
      subject: `✅ Servicio ${serviceName} recuperado`,
      message: `El servicio ${serviceName} ha vuelto a estar en línea.`,
      severity: "info",
    },
    "high-cpu": {
      subject: `⚠️ Alto uso de CPU en ${serviceName}`,
      message: `El uso de CPU en ${serviceName} es superior al 80%. Verifica la actividad del sistema.`,
      severity: "warning",
    },
    "high-memory": {
      subject: `⚠️ Alto uso de memoria en ${serviceName}`,
      message: `El uso de memoria en ${serviceName} es superior al 80%. Considera liberar recursos.`,
      severity: "warning",
    },
    "disk-full": {
      subject: `🔴 Disco lleno en ${serviceName}`,
      message: `El espacio en disco en ${serviceName} está casi lleno. Libera espacio inmediatamente.`,
      severity: "critical",
    },
  }

  const alert = alerts[status]
  if (!alert) return

  return notifyServerIncident(userId, alert.subject, alert.message, alert.severity)
}
