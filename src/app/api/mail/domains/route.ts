import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { mailAgent } from "@/lib/mail-agent"

export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const domains = await prisma.mailDomain.findMany({ orderBy: { createdAt: "desc" } })
    return NextResponse.json({ domains })
  } catch (err) {
    console.error("[mail/domains GET]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { domain } = await req.json()

    if (!domain) return NextResponse.json({ error: "El dominio es requerido" }, { status: 400 })

    const domainRegex = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    if (!domainRegex.test(domain)) {
      return NextResponse.json({ error: "Formato de dominio inválido" }, { status: 400 })
    }

    const existing = await prisma.mailDomain.findUnique({ where: { domain } })
    if (existing) return NextResponse.json({ error: "El dominio ya existe" }, { status: 409 })

    const record = await prisma.mailDomain.create({ data: { domain } })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: "create_mail_domain", target: domain },
    })

    // Provisionar en Postfix (best-effort)
    const provision = await mailAgent.addDomain(domain)

    return NextResponse.json({ domain: record, provisioned: provision.ok, provisionError: provision.error })
  } catch (err) {
    console.error("[mail/domains POST]", err)
    return NextResponse.json({ error: "Error interno al crear el dominio" }, { status: 500 })
  }
}
