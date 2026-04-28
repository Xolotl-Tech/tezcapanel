import { prisma } from "./prisma"
import { decrypt } from "./crypto"

/**
 * Obtener credenciales de un usuario (con secretos descifrados)
 */
async function getUserCredentials(userId: string) {
  const raw = await prisma.notificationPreferences.findUnique({
    where: { userId },
    select: {
      telegramBotToken: true,
      twilioAccountSid: true,
      twilioAuthToken: true,
      twilioPhoneNumber: true,
      sendgridApiKey: true,
      sendgridFromEmail: true,
    },
  })
  if (!raw) return null
  return {
    telegramBotToken:  decrypt(raw.telegramBotToken)  || null,
    twilioAccountSid:  decrypt(raw.twilioAccountSid)  || null,
    twilioAuthToken:   decrypt(raw.twilioAuthToken)   || null,
    twilioPhoneNumber: raw.twilioPhoneNumber,
    sendgridApiKey:    decrypt(raw.sendgridApiKey)    || null,
    sendgridFromEmail: raw.sendgridFromEmail,
  }
}

/**
 * Telegram Notification Service
 */
export async function sendTelegramNotification(
  chatId: string,
  message: string,
  userId?: string
) {
  let botToken: string | undefined = process.env.TELEGRAM_BOT_TOKEN

  // Si se proporciona userId, intentar obtener credenciales de la base de datos
  if (userId && !botToken) {
    const creds = await getUserCredentials(userId)
    botToken = creds?.telegramBotToken || undefined
  }

  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN no configurado")

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    }),
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.description || "Error enviando a Telegram")
  }

  return response.json()
}

/**
 * Slack Notification Service
 */
export async function sendSlackNotification(webhookUrl: string, message: string) {
  if (!webhookUrl) throw new Error("Slack webhook URL no proporcionado")

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: message,
      mrkdwn: true,
    }),
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    throw new Error("Error enviando a Slack")
  }

  return response.json()
}

/**
 * WhatsApp Notification Service (Twilio)
 */
export async function sendWhatsAppNotification(
  phoneNumber: string,
  message: string,
  userId?: string
) {
  let accountSid: string | undefined = process.env.TWILIO_ACCOUNT_SID
  let authToken: string | undefined = process.env.TWILIO_AUTH_TOKEN
  let fromNumber: string | undefined = process.env.TWILIO_WHATSAPP_NUMBER

  // Si se proporciona userId, intentar obtener credenciales de la base de datos
  if (userId && (!accountSid || !authToken || !fromNumber)) {
    const creds = await getUserCredentials(userId)
    accountSid = creds?.twilioAccountSid || accountSid
    authToken = creds?.twilioAuthToken || authToken
    fromNumber = creds?.twilioPhoneNumber || fromNumber
  }

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Credenciales de Twilio no configuradas")
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64")
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`

  const formData = new URLSearchParams()
  formData.append("From", `whatsapp:${fromNumber}`)
  formData.append("To", `whatsapp:${phoneNumber}`)
  formData.append("Body", message)

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData,
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Error enviando a WhatsApp")
  }

  return response.json()
}

/**
 * Email Notification Service (SendGrid)
 */
export async function sendEmailNotification(
  email: string,
  subject: string,
  message: string,
  userId?: string
) {
  let apiKey: string | undefined = process.env.SENDGRID_API_KEY
  let fromEmail: string | undefined = process.env.SENDGRID_FROM_EMAIL

  // Si se proporciona userId, intentar obtener credenciales de la base de datos
  if (userId && (!apiKey || !fromEmail)) {
    const creds = await getUserCredentials(userId)
    apiKey = creds?.sendgridApiKey || apiKey
    fromEmail = creds?.sendgridFromEmail || fromEmail
  }

  if (!apiKey || !fromEmail) {
    throw new Error("Credenciales de SendGrid no configuradas")
  }

  const htmlContent = message.replace(/\n/g, "<br>")

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email }],
          subject,
        },
      ],
      from: { email: fromEmail },
      content: [
        {
          type: "text/html",
          value: htmlContent,
        },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error("Error enviando email")
  }

  return { success: true }
}

/**
 * Resolver notificaciones a múltiples canales
 */
export async function sendNotificationToChannels(
  channels: { type: string; value: string }[],
  subject: string,
  message: string
) {
  const results = []

  for (const channel of channels) {
    try {
      switch (channel.type) {
        case "telegram":
          await sendTelegramNotification(channel.value, message)
          results.push({ channel: channel.type, success: true })
          break

        case "slack":
          await sendSlackNotification(channel.value, message)
          results.push({ channel: channel.type, success: true })
          break

        case "whatsapp":
          await sendWhatsAppNotification(channel.value, message)
          results.push({ channel: channel.type, success: true })
          break

        case "email":
          await sendEmailNotification(channel.value, subject, message)
          results.push({ channel: channel.type, success: true })
          break

        default:
          results.push({ channel: channel.type, success: false, error: "Tipo de canal no soportado" })
      }
    } catch (error) {
      results.push({
        channel: channel.type,
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      })
    }
  }

  return results
}
