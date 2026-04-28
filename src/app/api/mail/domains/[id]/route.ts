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
    const { spf, dkim, dmarc, active } = await req.json().catch(() => ({}))

    const record = await prisma.mailDomain.findUnique({ where: { id } })
    if (!record) return NextResponse.json({ error: "Dominio no encontrado" }, { status: 404 })

    const updated = await prisma.mailDomain.update({
      where: { id },
      data: {
        ...(spf    !== undefined && { spf }),
        ...(dkim   !== undefined && { dkim }),
        ...(dmarc  !== undefined && { dmarc }),
        ...(active !== undefined && { active }),
      },
    })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: "update_mail_domain", target: record.domain },
    })

    return NextResponse.json({ domain: updated })
  } catch (err) {
    console.error("[mail/domains PATCH]", err)
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
    const record = await prisma.mailDomain.findUnique({ where: { id } })
    if (!record) return NextResponse.json({ error: "Dominio no encontrado" }, { status: 404 })

    await prisma.mailDomain.delete({ where: { id } })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: "delete_mail_domain", target: record.domain },
    })

    // Retirar de Postfix (best-effort)
    await mailAgent.removeDomain(record.domain)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[mail/domains DELETE]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
