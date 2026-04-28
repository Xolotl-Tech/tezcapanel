import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncZone } from "@/lib/dns-sync"

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await context.params
    const data = await req.json().catch(() => null)

    const record = await prisma.dnsRecord.findUnique({ where: { id }, include: { zone: true } })
    if (!record) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 })

    const updated = await prisma.dnsRecord.update({
      where: { id },
      data: {
        ...(data.name     !== undefined && { name:     String(data.name).trim() }),
        ...(data.value    !== undefined && { value:    String(data.value).trim() }),
        ...(data.ttl      !== undefined && { ttl:      Number(data.ttl) }),
        ...(data.priority !== undefined && { priority: data.priority === null ? null : Number(data.priority) }),
        ...(data.active   !== undefined && { active:   Boolean(data.active) }),
      },
    })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: "update_dns_record", target: record.zone.domain },
    })

    const provision = await syncZone(record.zoneId)

    return NextResponse.json({ record: updated, provisioned: provision.ok, provisionError: provision.error })
  } catch (err) {
    console.error("[dns/records PATCH]", err)
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
    const record = await prisma.dnsRecord.findUnique({ where: { id }, include: { zone: true } })
    if (!record) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 })

    await prisma.dnsRecord.delete({ where: { id } })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: "delete_dns_record", target: record.zone.domain },
    })

    const provision = await syncZone(record.zoneId)

    return NextResponse.json({ ok: true, provisioned: provision.ok, provisionError: provision.error })
  } catch (err) {
    console.error("[dns/records DELETE]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
