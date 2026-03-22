import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const databases = await prisma.database.findMany({
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ databases })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name, user, password } = await req.json()

  if (!name || !user || !password) {
    return NextResponse.json({ error: "name, user y password son requeridos" }, { status: 400 })
  }

  // Validar que solo tenga caracteres seguros
  const safeRegex = /^[a-zA-Z0-9_]+$/
  if (!safeRegex.test(name) || !safeRegex.test(user)) {
    return NextResponse.json({ error: "Solo se permiten letras, números y guiones bajos" }, { status: 400 })
  }

  const existing = await prisma.database.findUnique({ where: { name } })
  if (existing) {
    return NextResponse.json({ error: "La base de datos ya existe" }, { status: 409 })
  }

  const db = await prisma.database.create({
    data: { name, user },
  })

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "create_database",
      target: name,
      metadata: JSON.stringify({ name, user }),
    },
  })

  return NextResponse.json({ database: db })
}