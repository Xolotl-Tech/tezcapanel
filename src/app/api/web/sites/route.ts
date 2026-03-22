import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sites = await prisma.website.findMany({
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ sites })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { domain, rootPath, phpVersion } = await req.json()

  if (!domain || !rootPath) {
    return NextResponse.json({ error: "domain y rootPath requeridos" }, { status: 400 })
  }

  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-\.]{0,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/
  if (!domainRegex.test(domain)) {
    return NextResponse.json({ error: "Formato de dominio inválido" }, { status: 400 })
  }

  const existing = await prisma.website.findUnique({ where: { domain } })
  if (existing) {
    return NextResponse.json({ error: "El dominio ya existe" }, { status: 409 })
  }

  const site = await prisma.website.create({
    data: { domain, rootPath, phpVersion },
  })

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "create_website",
      target: domain,
      metadata: JSON.stringify({ domain, rootPath }),
    },
  })

  return NextResponse.json({ site })
}