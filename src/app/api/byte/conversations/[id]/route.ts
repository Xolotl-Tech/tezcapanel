import { auth } from "@/lib/auth"
import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

interface Params { params: Promise<{ id: string }> }

// GET: devuelve la conversación con todos sus mensajes parseados (metadata
// JSON → objeto). Verifica ownership por userId — un admin no puede leer
// las conversaciones de otro admin sin pasar por la cuenta.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const { id } = await params

  const conv = await prisma.byteConversation.findFirst({
    where: { id, userId: session.user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  })
  if (!conv) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  return NextResponse.json({
    ...conv,
    messages: conv.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.createdAt,
      // metadata JSON contiene actions, stackProposal, installLog
      ...(m.metadata ? safeParse(m.metadata) : {}),
    })),
  })
}

// DELETE: borra la conversación y sus mensajes (cascade en schema).
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const { id } = await params

  const result = await prisma.byteConversation.deleteMany({
    where: { id, userId: session.user.id },
  })
  if (result.count === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

// PATCH: rename. Sólo permite cambiar `title`. Útil para el feature de
// renombrar manualmente desde la UI (futuro), por ahora también lo usa
// el endpoint de messages para auto-titular con el primer mensaje.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const title = typeof body.title === "string" ? body.title.slice(0, 100).trim() : null
  if (!title) return NextResponse.json({ error: "invalid_title" }, { status: 400 })

  const result = await prisma.byteConversation.updateMany({
    where: { id, userId: session.user.id },
    data: { title },
  })
  if (result.count === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

function safeParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s) } catch { return {} }
}
