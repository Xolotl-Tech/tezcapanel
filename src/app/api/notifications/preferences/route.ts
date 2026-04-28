import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const prefs = await prisma.notificationPreferences.findUnique({
    where: { userId: session.user.id },
  })

  return NextResponse.json({ prefs })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const data = await req.json().catch(() => null)

  const prefs = await prisma.notificationPreferences.upsert({
    where: { userId: session.user.id },
    update: data,
    create: { userId: session.user.id, ...data },
  })

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "update_notification_preferences",
      target: "notifications",
    },
  })

  return NextResponse.json({ prefs })
}