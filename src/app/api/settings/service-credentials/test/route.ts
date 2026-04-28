import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

interface TestRequest {
  service: "telegram" | "twilio" | "sendgrid"
  credentials: {
    telegramBotToken?: string
    twilioAccountSid?: string
    twilioAuthToken?: string
    twilioPhoneNumber?: string
    sendgridApiKey?: string
    sendgridFromEmail?: string
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { service, credentials } = (await req.json().catch(() => null)) as TestRequest

  try {
    if (service === "telegram") {
      return await testTelegram(credentials.telegramBotToken!)
    } else if (service === "twilio") {
      return await testTwilio(
        credentials.twilioAccountSid!,
        credentials.twilioAuthToken!
      )
    } else if (service === "sendgrid") {
      return await testSendGrid(credentials.sendgridApiKey!, credentials.sendgridFromEmail!)
    }

    return NextResponse.json({ error: "Servicio no reconocido" }, { status: 400 })
  } catch (error) {
    console.error(`[Test ${service}]`, error)
    return NextResponse.json(
      {
        error: "Error al probar credenciales",
        message: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 400 }
    )
  }
}

async function testTelegram(botToken: string) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
  const data = await res.json()

  if (!data.ok) {
    return NextResponse.json(
      {
        error: "Token de Telegram inválido",
        message: data.description || "Error al verificar token",
      },
      { status: 400 }
    )
  }

  return NextResponse.json({
    ok: true,
    message: `✓ Bot conectado: ${data.result.username}`,
  })
}

async function testTwilio(accountSid: string, authToken: string) {
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64")

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  })

  if (!res.ok) {
    return NextResponse.json(
      {
        error: "Credenciales de Twilio inválidas",
        message: "Account SID o Auth Token incorrecto",
      },
      { status: 400 }
    )
  }

  const data = await res.json()

  return NextResponse.json({
    ok: true,
    message: `✓ Cuenta Twilio conectada: ${data.friendly_name}`,
  })
}

async function testSendGrid(apiKey: string, fromEmail: string) {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: fromEmail }],
          subject: "Test de Tezcapanel",
        },
      ],
      from: { email: fromEmail },
      content: [
        {
          type: "text/plain",
          value: "Este es un email de prueba de Tezcapanel",
        },
      ],
    }),
  })

  if (res.status === 202) {
    return NextResponse.json({
      ok: true,
      message: "✓ Email de prueba enviado (revisa tu bandeja)",
    })
  }

  if (!res.ok) {
    const error = await res.json()
    return NextResponse.json(
      {
        error: "Credenciales de SendGrid inválidas",
        message:
          error.errors?.[0]?.message ||
          `Error HTTP ${res.status}`,
      },
      { status: 400 }
    )
  }

  return NextResponse.json({
    ok: true,
    message: "✓ Credenciales de SendGrid válidas",
  })
}
