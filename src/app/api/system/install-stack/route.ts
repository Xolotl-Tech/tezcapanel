import { auth } from "@/lib/auth"
import { NextResponse, type NextRequest } from "next/server"

const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:7070"
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ""

// Proxy SSE del agente al cliente. La instalación tarda minutos: usamos
// streaming para mostrar progreso en vivo en el chat de Byte sin que el
// usuario vea una pantalla congelada. Devolvemos el body de la respuesta
// del agente tal cual — Next App Router acepta ReadableStream y respeta
// los headers de event-stream para que el navegador no buffer.
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: { stack?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "json_invalid" }, { status: 400 })
  }
  if (body.stack !== "lamp" && body.stack !== "lemp") {
    return NextResponse.json({ error: "invalid_stack" }, { status: 400 })
  }

  let upstream: Response
  try {
    upstream = await fetch(`${AGENT_URL}/system/install-stack`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AGENT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ stack: body.stack }),
      // Sin AbortSignal.timeout: el endpoint es streaming y dura minutos.
      // El cliente decide cuándo cerrar.
    })
  } catch {
    return NextResponse.json({ error: "agent_unavailable" }, { status: 503 })
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "")
    return NextResponse.json(
      { error: "agent_error", status: upstream.status, raw: text.slice(0, 300) },
      { status: 502 }
    )
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
