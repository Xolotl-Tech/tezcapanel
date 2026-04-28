import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export async function POST(req: NextRequest) {
  const { name, email, password } = await req.json().catch(() => ({}))

  if (!name || !email || !password) {
    return NextResponse.json(
      { error: "Todos los campos son requeridos" },
      { status: 400 }
    )
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 8 caracteres" },
      { status: 400 }
    )
  }

  const hashed = await bcrypt.hash(password, 12)

  try {
    const user = await prisma.$transaction(async (tx) => {
      const count = await tx.user.count()
      if (count > 0) throw new Error("ALREADY_SETUP")
      return tx.user.create({
        data: { name, email, password: hashed, role: "ADMIN" },
      })
    })
    return NextResponse.json({ ok: true, userId: user.id })
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_SETUP") {
      return NextResponse.json(
        { error: "El panel ya está configurado" },
        { status: 403 }
      )
    }
    throw err
  }
}