import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncZone } from "@/lib/dns-sync"
import { ensureBuiltInProvider } from "@/lib/dns-providers"

export async function GET() {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const zones = await prisma.dnsZone.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { records: true } },
        provider: { select: { id: true, alias: true, type: true } },
      },
    })
    return NextResponse.json({ zones })
  } catch (err) {
    console.error("[dns/zones GET]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { domain, primaryNs, adminEmail, serverIp, providerId } = await req.json()

    if (!domain) return NextResponse.json({ error: "El dominio es requerido" }, { status: 400 })

    const domainRegex = /^(?!.*\.\.)(?![-.])[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/
    if (!domainRegex.test(domain)) {
      return NextResponse.json({ error: "Formato de dominio inválido" }, { status: 400 })
    }

    const existing = await prisma.dnsZone.findUnique({ where: { domain } })
    if (existing) return NextResponse.json({ error: "La zona ya existe" }, { status: 409 })

    const provider = providerId
      ? await prisma.dnsProvider.findUnique({ where: { id: providerId } })
      : await ensureBuiltInProvider(prisma)

    if (!provider) return NextResponse.json({ error: "Provider no encontrado" }, { status: 400 })

    const ns = (primaryNs && String(primaryNs).trim()) || `ns1.${domain}.`
    const admin = (adminEmail && String(adminEmail).trim()) || `admin.${domain}.`

    const zone = await prisma.dnsZone.create({
      data: {
        domain,
        providerId: provider.id,
        primaryNs: ns.endsWith(".") ? ns : `${ns}.`,
        adminEmail: admin.endsWith(".") ? admin : `${admin}.`,
        serial: Math.floor(Date.now() / 1000),
      },
    })

    const baseRecords: Array<{ type: string; name: string; value: string; priority?: number }> = [
      { type: "NS", name: "@", value: ns.endsWith(".") ? ns : `${ns}.` },
    ]
    if (serverIp && /^\d{1,3}(\.\d{1,3}){3}$/.test(serverIp)) {
      baseRecords.push({ type: "A", name: "@", value: serverIp })
      baseRecords.push({ type: "A", name: "www", value: serverIp })
    }

    await prisma.dnsRecord.createMany({
      data: baseRecords.map((r) => ({
        zoneId: zone.id,
        type: r.type,
        name: r.name,
        value: r.value,
        ttl: zone.defaultTtl,
        priority: r.priority ?? null,
      })),
    })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: "create_dns_zone", target: domain },
    })

    const provision = await syncZone(zone.id)

    return NextResponse.json({
      zone,
      provisioned: provision.ok,
      provisionError: provision.error,
    })
  } catch (err) {
    console.error("[dns/zones POST]", err)
    return NextResponse.json({ error: "Error interno al crear la zona" }, { status: 500 })
  }
}
