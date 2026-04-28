import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { mailAgent } from "@/lib/mail-agent"

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await context.params
    const { destination, active } = await req.json().catch(() => ({}))

    const record = await prisma.mailAlias.findUnique({ where: { id } })
    if (!record) return NextResponse.json({ error: "Alias no encontrado" }, { status: 404 })

    const updated = await prisma.mailAlias.update({
      where: { id },
      data: {
        ...(destination !== undefined && { destination }),
        ...(active      !== undefined && { active }),
      },
    })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: "update_mail_alias", target: record.source },
    })

    return NextResponse.json({ alias: updated })
  } catch (err) {
    console.error("[mail/aliases PATCH]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await context.params
    const record = await prisma.mailAlias.findUnique({ where: { id } })
    if (!record) return NextResponse.json({ error: "Alias no encontrado" }, { status: 404 })

    await prisma.mailAlias.delete({ where: { id } })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: "delete_mail_alias", target: record.source },
    })

    // Retirar de Postfix (best-effort)
    await mailAgent.removeAlias(record.source)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[mail/aliases DELETE]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
