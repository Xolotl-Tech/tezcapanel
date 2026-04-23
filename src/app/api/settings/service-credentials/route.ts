import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { encryptOptional } from "@/lib/crypto"

// GET — obtener credenciales (sin exponer tokens completos)
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const prefs = await prisma.notificationPreferences.findUnique({
    where: { userId: session.user.id },
    select: {
      telegramBotToken: true,
      twilioAccountSid: true,
      twilioPhoneNumber: true,
      sendgridFromEmail: true,
    },
  })

  return NextResponse.json({
    credentials: prefs || {},
  })
}

// PATCH — guardar credenciales
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const {
    telegramBotToken,
    twilioAccountSid,
    twilioAuthToken,
    twilioPhoneNumber,
    sendgridApiKey,
    sendgridFromEmail,
  } = await req.json()

  // Validaciones básicas
  if (telegramBotToken && !telegramBotToken.includes(":")) {
    return NextResponse.json(
      { error: "Formato de token Telegram inválido" },
      { status: 400 }
    )
  }

  if (twilioAccountSid && !twilioAccountSid.startsWith("AC")) {
    return NextResponse.json(
      { error: "Account SID de Twilio debe empezar con AC" },
      { status: 400 }
    )
  }

  if (sendgridFromEmail && !sendgridFromEmail.includes("@")) {
    return NextResponse.json(
      { error: "Email de SendGrid inválido" },
      { status: 400 }
    )
  }

  const secretFields = {
    telegramBotToken:  encryptOptional(telegramBotToken),
    twilioAccountSid:  encryptOptional(twilioAccountSid),
    twilioAuthToken:   encryptOptional(twilioAuthToken),
    sendgridApiKey:    encryptOptional(sendgridApiKey),
    // Display-only, sin cifrar
    twilioPhoneNumber: twilioPhoneNumber || null,
    sendgridFromEmail: sendgridFromEmail || null,
  }

  const prefs = await prisma.notificationPreferences.upsert({
    where:  { userId: session.user.id },
    create: { userId: session.user.id, ...secretFields },
    update: secretFields,
  })

  // Registrar en audit log
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "update_notification_credentials",
      target: "notification_services",
      metadata: JSON.stringify({
        services: [
          telegramBotToken ? "telegram" : null,
          twilioAccountSid ? "twilio" : null,
          sendgridApiKey ? "sendgrid" : null,
        ].filter(Boolean),
      }),
    },
  })

  return NextResponse.json({
    ok: true,
    credentials: {
      telegramBotToken: prefs.telegramBotToken ? "***" : null,
      twilioAccountSid: prefs.twilioAccountSid ? "***" : null,
      twilioPhoneNumber: prefs.twilioPhoneNumber,
      sendgridFromEmail: prefs.sendgridFromEmail,
    },
  })
}
