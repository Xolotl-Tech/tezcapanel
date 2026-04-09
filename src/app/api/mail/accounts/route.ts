import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { mailAgent } from "@/lib/mail-agent"

export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const accounts = await prisma.mailAccount.findMany({ orderBy: { createdAt: "desc" } })
    return NextResponse.json({ accounts })
  } catch (err) {
    console.error("[mail/accounts GET]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { email, password, quotaMB } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: "Email y contraseña son requeridos" }, { status: 400 })
    }

    const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Formato de email inválido" }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 })
    }

    if (password.includes(":")) {
      return NextResponse.json({ error: "La contraseña no puede contener ':'" }, { status: 400 })
    }

    const existing = await prisma.mailAccount.findUnique({ where: { email } })
    if (existing) return NextResponse.json({ error: "El correo ya existe" }, { status: 409 })

    const quota = quotaMB ?? 500
    const record = await prisma.mailAccount.create({ data: { email, password, quotaMB: quota } })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "create_mail_account",
        target: email,
        metadata: JSON.stringify({ quotaMB: quota }),
      },
    })

    // Provisionar en Postfix + Dovecot (best-effort)
    const provision = await mailAgent.addAccount(email, password, quota)

    return NextResponse.json({ account: record, provisioned: provision.ok, provisionError: provision.error })
  } catch (err) {
    console.error("[mail/accounts POST]", err)
    return NextResponse.json({ error: "Error interno al crear la cuenta" }, { status: 500 })
  }
}
