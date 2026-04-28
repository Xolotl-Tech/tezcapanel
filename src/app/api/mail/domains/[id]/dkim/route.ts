import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { mailAgent } from "@/lib/mail-agent"

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await context.params
    const record = await prisma.mailDomain.findUnique({ where: { id } })
    if (!record) return NextResponse.json({ error: "Dominio no encontrado" }, { status: 404 })

    const result = await mailAgent.genDkim(record.domain)

    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Error al generar DKIM" }, { status: 500 })
    }

    // Guardar la clave pública en la DB
    await prisma.mailDomain.update({
      where: { id },
      data: { dkim: result.public_key },
    })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: "gen_dkim", target: record.domain },
    })

    return NextResponse.json({ ok: true, public_key: result.public_key })
  } catch (err) {
    console.error("[mail/domains/dkim POST]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
