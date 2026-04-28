import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  })

  const unread = notifications.filter((n) => !n.read).length

  return NextResponse.json({ notifications, unread })
}

export async function POST() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Marcar todas como leídas
  await prisma.notification.updateMany({
    where: { read: false },
    data: { read: true },
  })

  return NextResponse.json({ ok: true })
}