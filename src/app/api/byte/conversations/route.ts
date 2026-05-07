import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET: lista las conversaciones del usuario actual ordenadas por la más
// recientemente activa. Sólo devuelve metadatos (no los mensajes), así la
// lista carga rápido aunque haya cientos. Mensajes se piden con
// /api/byte/conversations/[id].
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const conversations = await prisma.byteConversation.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  })

  return NextResponse.json({ conversations })
}

// POST: crea una conversación vacía. La devolvemos con su ID para que el
// cliente le mande el primer mensaje. El título arranca en "Nueva
// conversación" y se actualiza automáticamente con las primeras palabras
// del primer mensaje del usuario (ver POST /messages).
export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const conv = await prisma.byteConversation.create({
    data: { userId: session.user.id },
  })

  return NextResponse.json(conv)
}
