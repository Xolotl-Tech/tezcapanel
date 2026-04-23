import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncZone } from "@/lib/dns-sync"

const VALID_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV"] as const

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await context.params
    const records = await prisma.dnsRecord.findMany({
      where: { zoneId: id },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    })
    return NextResponse.json({ records })
  } catch (err) {
    console.error("[dns/records GET]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await context.params
    const { type, name, value, ttl, priority } = await req.json()

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Tipo de registro inválido" }, { status: 400 })
    }
    if (!name || !value) {
      return NextResponse.json({ error: "name y value son requeridos" }, { status: 400 })
    }
    if ((type === "MX" || type === "SRV") && (priority === undefined || priority === null || priority === "")) {
      return NextResponse.json({ error: `Priority requerido para ${type}` }, { status: 400 })
    }

    const zone = await prisma.dnsZone.findUnique({ where: { id } })
    if (!zone) return NextResponse.json({ error: "Zona no encontrada" }, { status: 404 })

    const record = await prisma.dnsRecord.create({
      data: {
        zoneId: id,
        type,
        name: String(name).trim(),
        value: String(value).trim(),
        ttl: ttl ? Number(ttl) : zone.defaultTtl,
        priority: (type === "MX" || type === "SRV") ? Number(priority) : null,
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "create_dns_record",
        target: zone.domain,
        metadata: JSON.stringify({ type, name, value }),
      },
    })

    const provision = await syncZone(id)

    return NextResponse.json({ record, provisioned: provision.ok, provisionError: provision.error })
  } catch (err) {
    console.error("[dns/records POST]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
