import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { validatePanelPassword } from "@/lib/password-policy"
import { check as rlCheck, clientIp } from "@/lib/rate-limit"

const SETUP_LIMIT = { windowMs: 60 * 60_000, max: 10, blockMs: 60 * 60_000 }

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers)
  const lim = rlCheck(`setup:${ip}`, SETUP_LIMIT)
  if (!lim.ok) {
    return NextResponse.json({ error: "Demasiados intentos. Intenta más tarde." }, { status: 429 })
  }

  const { name, email, password } = await req.json().catch(() => ({}))

  if (!name || !email || !password) {
    return NextResponse.json(
      { error: "Todos los campos son requeridos" },
      { status: 400 }
    )
  }

  const pw = validatePanelPassword(password)
  if (!pw.ok) {
    return NextResponse.json({ error: pw.error }, { status: 400 })
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