import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { dnsAgent } from "@/lib/dns-agent"
import { syncZone } from "@/lib/dns-sync"

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await context.params
    const zone = await prisma.dnsZone.findUnique({ where: { id } })
    if (!zone) return NextResponse.json({ error: "Zona no encontrada" }, { status: 404 })

    // Reescribe el archivo de zona y luego ejecuta named-checkzone
    await syncZone(id)
    const result = await dnsAgent.checkZone(zone.domain)

    return NextResponse.json(result)
  } catch (err) {
    console.error("[dns/zones/:id/check POST]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
