import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const { password } = await req.json()

  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Contraseña debe tener al menos 8 caracteres" }, { status: 400 })
  }

  const db = await prisma.database.findUnique({ where: { id } })
  if (!db) return NextResponse.json({ error: "Base de datos no encontrada" }, { status: 404 })

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "change_db_password",
      target: db.name,
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const db = await prisma.database.findUnique({ where: { id } })
  if (!db) return NextResponse.json({ error: "Base de datos no encontrada" }, { status: 404 })

  await prisma.database.delete({ where: { id } })

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "delete_database",
      target: db.name,
    },
  })

  return NextResponse.json({ ok: true })
}