import { auth } from "@/lib/auth"
import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

interface Params { params: Promise<{ id: string }> }

// POST: agrega un mensaje a una conversación. El cliente manda role,
// content, y opcionalmente metadata (actions, stackProposal, installLog)
// que persistimos como JSON. Si es el primer mensaje del usuario, también
// auto-titulamos la conversación con sus primeras palabras (max 60
// chars) para que aparezca legible en la lista. Tocar updatedAt para
// que la conversación suba en el sort.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const { id } = await params
  const body = await req.json().catch(() => null) as {
    role?: string; content?: string; metadata?: Record<string, unknown>
  } | null
  if (!body || (body.role !== "user" && body.role !== "assistant") || typeof body.content !== "string") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
  }

  const conv = await prisma.byteConversation.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, title: true, _count: { select: { messages: true } } },
  })
  if (!conv) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const msg = await prisma.byteMessage.create({
    data: {
      conversationId: conv.id,
      role: body.role,
      content: body.content,
      metadata: body.metadata ? JSON.stringify(body.metadata) : null,
    },
  })

  // Auto-título: si es el primer mensaje del usuario y la conversación
  // sigue con el título por defecto, usamos las primeras palabras.
  const isFirstUserMessage = body.role === "user" && conv._count.messages === 0
  const stillDefaultTitle = conv.title === "Nueva conversación"
  if (isFirstUserMessage && stillDefaultTitle) {
    await prisma.byteConversation.update({
      where: { id: conv.id },
      data: { title: body.content.slice(0, 60).trim() || "Nueva conversación" },
    })
  } else {
    // Tocar updatedAt para reordenar la lista
    await prisma.byteConversation.update({
      where: { id: conv.id },
      data: { updatedAt: new Date() },
    })
  }

  return NextResponse.json({ id: msg.id, createdAt: msg.createdAt })
}

// PATCH: actualiza el último mensaje (caso típico: stream del asistente
// que va creciendo). El cliente debe pasar messageId para evitar tocar
// el mensaje equivocado si llegan respuestas fuera de orden.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const { id } = await params
  const body = await req.json().catch(() => null) as {
    messageId?: string; content?: string; metadata?: Record<string, unknown>
  } | null
  if (!body || typeof body.messageId !== "string") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
  }

  // Verifica que el mensaje pertenezca a una conversación del usuario.
  const msg = await prisma.byteMessage.findFirst({
    where: {
      id: body.messageId,
      conversation: { id, userId: session.user.id },
    },
    select: { id: true },
  })
  if (!msg) return NextResponse.json({ error: "not_found" }, { status: 404 })

  await prisma.byteMessage.update({
    where: { id: msg.id },
    data: {
      ...(typeof body.content === "string" ? { content: body.content } : {}),
      ...(body.metadata !== undefined
        ? { metadata: body.metadata ? JSON.stringify(body.metadata) : null }
        : {}),
    },
  })
  await prisma.byteConversation.update({
    where: { id },
    data: { updatedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
