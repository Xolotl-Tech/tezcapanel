import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncZone } from "@/lib/dns-sync"
import { getProviderClient } from "@/lib/dns-providers"

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await context.params
    const zone = await prisma.dnsZone.findUnique({
      where: { id },
      include: { records: { orderBy: [{ type: "asc" }, { name: "asc" }] } },
    })
    if (!zone) return NextResponse.json({ error: "Zona no encontrada" }, { status: 404 })

    return NextResponse.json({ zone })
  } catch (err) {
    console.error("[dns/zones/:id GET]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await context.params
    const data = await req.json().catch(() => null)

    const zone = await prisma.dnsZone.findUnique({ where: { id } })
    if (!zone) return NextResponse.json({ error: "Zona no encontrada" }, { status: 404 })

    const updated = await prisma.dnsZone.update({
      where: { id },
      data: {
        ...(data.primaryNs  !== undefined && { primaryNs:  data.primaryNs }),
        ...(data.adminEmail !== undefined && { adminEmail: data.adminEmail }),
        ...(data.refresh    !== undefined && { refresh:    Number(data.refresh) }),
        ...(data.retry      !== undefined && { retry:      Number(data.retry) }),
        ...(data.expire     !== undefined && { expire:     Number(data.expire) }),
        ...(data.minimum    !== undefined && { minimum:    Number(data.minimum) }),
        ...(data.defaultTtl !== undefined && { defaultTtl: Number(data.defaultTtl) }),
        ...(data.active     !== undefined && { active:     Boolean(data.active) }),
      },
    })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: "update_dns_zone", target: zone.domain },
    })

    const provision = await syncZone(id)
    return NextResponse.json({ zone: updated, provisioned: provision.ok, provisionError: provision.error })
  } catch (err) {
    console.error("[dns/zones/:id PATCH]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await context.params
    const zone = await prisma.dnsZone.findUnique({ where: { id }, include: { provider: true } })
    if (!zone) return NextResponse.json({ error: "Zona no encontrada" }, { status: 404 })

    const client = getProviderClient(zone.provider)
    await prisma.dnsZone.delete({ where: { id } })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: "delete_dns_zone", target: zone.domain },
    })

    const result = await client.removeZone(zone.domain)
    return NextResponse.json({ ok: true, provisioned: result.ok, provisionError: result.error })
  } catch (err) {
    console.error("[dns/zones/:id DELETE]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
