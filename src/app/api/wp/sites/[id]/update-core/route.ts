import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { wpAgent } from "@/lib/wp-agent"
import { friendlyError } from "@/lib/agent-errors"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const site = await prisma.wpSite.findUnique({ where: { id }, include: { website: true } })
  if (!site) return NextResponse.json({ error: "No existe" }, { status: 404 })

  const r = await wpAgent.updateCore(site.website.rootPath)
  if (!r.ok) return NextResponse.json({ error: friendlyError(r.error) }, { status: 500 })

  const updated = await prisma.wpSite.update({
    where: { id },
    data: { version: r.version, lastSyncAt: new Date() },
    include: { website: true, category: true },
  })

  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "wp_update_core", target: site.website.domain, metadata: JSON.stringify({ version: r.version }) },
  })
  return NextResponse.json({ site: updated })
}
