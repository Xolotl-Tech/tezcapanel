import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { mailAgent } from "@/lib/mail-agent"

export async function GET() {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const aliases = await prisma.mailAlias.findMany({ orderBy: { createdAt: "desc" } })
    return NextResponse.json({ aliases })
  } catch (err) {
    console.error("[mail/aliases GET]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { source, destination } = await req.json()

    if (!source || !destination) {
      return NextResponse.json({ error: "Origen y destino son requeridos" }, { status: 400 })
    }

    const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/
    if (!emailRegex.test(source) || !emailRegex.test(destination)) {
      return NextResponse.json({ error: "Formato de email inválido" }, { status: 400 })
    }

    const existing = await prisma.mailAlias.findUnique({ where: { source } })
    if (existing) return NextResponse.json({ error: "El alias ya existe" }, { status: 409 })

    const record = await prisma.mailAlias.create({ data: { source, destination } })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "create_mail_alias",
        target: source,
        metadata: JSON.stringify({ destination }),
      },
    })

    // Provisionar en Postfix (best-effort)
    const provision = await mailAgent.addAlias(source, destination)

    return NextResponse.json({ alias: record, provisioned: provision.ok, provisionError: provision.error })
  } catch (err) {
    console.error("[mail/aliases POST]", err)
    return NextResponse.json({ error: "Error interno al crear el alias" }, { status: 500 })
  }
}
