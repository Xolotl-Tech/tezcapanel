import { auth } from "@/lib/auth"
import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import pkg from "../../../../package.json"

// Entrega de feedback vía Web3Forms (https://web3forms.com). Razones:
//  - No requiere postfix/sendmail en la VM, ni SPF/DKIM, ni reverse DNS.
//  - 250 envíos/mes gratis es de sobra para beta.
//  - Outlook/Gmail aceptan los emails porque salen de IPs reputadas de
//    web3forms, no del VPS del usuario.
//
// La access key está embebida en el código a propósito: web3forms está
// diseñado para que la key viva en el cliente (HTML público), por eso
// la rate-limita por origen, no por secrecía. El destinatario real
// (contacto@xolotl.tech) está configurado en el dashboard de la cuenta
// de Xolotl Tech, NO se controla desde acá. Si alguien hace fork del
// panel y quiere su propia bandeja de feedback, sobreescribe con env
// vars WEB3FORMS_KEY y FEEDBACK_TO sin tocar código.
const WEB3FORMS_ENDPOINT = "https://api.web3forms.com/submit"
const WEB3FORMS_KEY = process.env.WEB3FORMS_KEY || "de27e24d-9097-42a0-83cc-07c5a0a5a3dc"
const FEEDBACK_TO = process.env.FEEDBACK_TO || "contacto@xolotl.tech"

interface DeliveryResult {
  delivered: boolean
  error: string | null
}

async function deliver(payload: {
  category: string
  subject: string
  message: string
  panelVersion: string
  userEmail: string | null
  userAgent: string | null
}): Promise<DeliveryResult> {
  if (!WEB3FORMS_KEY) {
    return { delivered: false, error: "web3forms_key_not_configured" }
  }
  try {
    const res = await fetch(WEB3FORMS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        access_key: WEB3FORMS_KEY,
        // Web3Forms reconoce estos campos especiales para armar el correo:
        from_name: "Tezcapanel — Feedback",
        subject: `[Tezcapanel] [${payload.category}] ${payload.subject}`,
        // El "to" lo controla la cuenta de Web3Forms (configurado en su
        // dashboard). FEEDBACK_TO va como referencia en el cuerpo por si
        // alguien revisa raw.
        replyto: payload.userEmail ?? "",
        // Cuerpo: estructura plana para que web3forms lo serialice. Los
        // campos extra aparecen en el correo final como label/value.
        category: payload.category,
        panel_version: payload.panelVersion,
        user_email: payload.userEmail ?? "anónimo",
        user_agent: payload.userAgent ?? "n/a",
        target_inbox: FEEDBACK_TO,
        message: payload.message,
      }),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.success) {
      return { delivered: false, error: `web3forms ${res.status}: ${data?.message ?? "unknown"}` }
    }
    return { delivered: true, error: null }
  } catch (err) {
    return { delivered: false, error: `fetch_error: ${(err as Error).message}` }
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null) as {
    category?: string; subject?: string; message?: string
  } | null
  if (!body || typeof body.subject !== "string" || typeof body.message !== "string") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
  }
  const subject = body.subject.trim().slice(0, 200)
  const message = body.message.trim().slice(0, 5000)
  const category = ["general", "bug", "feature", "other"].includes(body.category ?? "")
    ? body.category!
    : "general"
  if (!subject || !message) {
    return NextResponse.json({ error: "subject_or_message_empty" }, { status: 400 })
  }

  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null

  const fb = await prisma.feedback.create({
    data: {
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      category,
      subject,
      message,
      panelVersion: pkg.version,
      userAgent,
    },
  })

  const result = await deliver({
    category,
    subject,
    message,
    panelVersion: pkg.version,
    userEmail: session.user.email ?? null,
    userAgent,
  })

  await prisma.feedback.update({
    where: { id: fb.id },
    data: result.delivered
      ? { emailedAt: new Date() }
      : { emailError: result.error },
  })

  return NextResponse.json({ ok: true, id: fb.id, delivered: result.delivered })
}
