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
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await context.params
    const { password, quotaMB, active } = await req.json()

    const record = await prisma.mailAccount.findUnique({ where: { id } })
    if (!record) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

    if (password !== undefined) {
      if (password.length < 8) {
        return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 })
      }
      if (password.includes(":")) {
        return NextResponse.json({ error: "La contraseña no puede contener ':'" }, { status: 400 })
      }
    }

    const updated = await prisma.mailAccount.update({
      where: { id },
      data: {
        ...(password !== undefined && { password }),
        ...(quotaMB  !== undefined && { quotaMB }),
        ...(active   !== undefined && { active }),
      },
    })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: "update_mail_account", target: record.email },
    })

    // Si cambió la contraseña, actualizar en Dovecot (best-effort)
    if (password !== undefined) {
      await mailAgent.updatePassword(record.email, password)
    }

    return NextResponse.json({ account: updated })
  } catch (err) {
    console.error("[mail/accounts PATCH]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await context.params
    const record = await prisma.mailAccount.findUnique({ where: { id } })
    if (!record) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

    await prisma.mailAccount.delete({ where: { id } })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: "delete_mail_account", target: record.email },
    })

    // Retirar de Postfix + Dovecot (best-effort)
    await mailAgent.removeAccount(record.email)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[mail/accounts DELETE]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
