import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  sendTelegramNotification,
  sendSlackNotification,
  sendWhatsAppNotification,
  sendEmailNotification,
} from "@/lib/notification-services"

// POST — enviar notificación de prueba a un canal
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { channel, value } = body

    if (!channel || !value) {
      return NextResponse.json(
        { error: "Channel y value requeridos" },
        { status: 400 }
      )
    }

    // Mensaje de prueba
    const timestamp = new Date().toLocaleString("es-ES")
    const testMessage = `✅ Prueba de conexión exitosa\n\nCanal: ${channel.toUpperCase()}\nTiempo: ${timestamp}\n\nEste mensaje confirma que tu ${channel} está configurado correctamente y recibirá notificaciones de incidencias del servidor.`

    // Enviar según el tipo de canal
    switch (channel) {
      case "whatsapp":
        await sendWhatsAppNotification(value, testMessage)
        break

      case "telegram":
        await sendTelegramNotification(value, testMessage)
        break

      case "slack":
        await sendSlackNotification(value, testMessage)
        break

      case "email":
        await sendEmailNotification(
          value,
          "Prueba de conexión - Tezcapanel",
          testMessage
        )
        break

      default:
        return NextResponse.json(
          { error: "Canal no soportado" },
          { status: 400 }
        )
    }

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "test_notification_channel",
        target: channel,
        metadata: JSON.stringify({ channel, timestamp }),
      },
    }).catch((err) => {
      console.error("[API] Error logging test:", err)
    })

    return NextResponse.json({
      success: true,
      message: `Prueba enviada a ${channel}. Revisa tu ${channel} en los próximos segundos.`,
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Error desconocido"
    console.error("[API] Error testing notification channel:", errorMessage)

    // Registrar error en audit log si es posible
    try {
      const session = await auth()
      if (session) {
        const body = await req.json().catch(() => ({}))
        await prisma.auditLog.create({
          data: {
            userId: session.user.id,
            action: "test_notification_channel_failed",
            target: body.channel || "unknown",
            metadata: JSON.stringify({ error: errorMessage }),
          },
        }).catch(() => {})
      }
    } catch {}

    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    )
  }
}
