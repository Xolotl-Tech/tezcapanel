import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { wpAgent } from "@/lib/wp-agent"
import { friendlyError } from "@/lib/agent-errors"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const site = await prisma.wpSite.findUnique({
    where: { id },
    include: { website: true, category: true },
  })
  if (!site) return NextResponse.json({ error: "No existe" }, { status: 404 })

  // refrescar info en el agente
  const info = await wpAgent.info(site.website.rootPath)
  if (info.ok) {
    await prisma.wpSite.update({
      where: { id },
      data: {
        version: info.version ?? site.version,
        pluginsCount: info.pluginsCount ?? 0,
        themesCount: info.themesCount ?? 0,
        diskUsageMB: info.diskUsageMB ?? 0,
        lastSyncAt: new Date(),
      },
    })
  }

  const updated = await prisma.wpSite.findUnique({
    where: { id },
    include: { website: true, category: true },
  })
  return NextResponse.json({ site: updated, agentAvailable: info.ok })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

  const data: Record<string, unknown> = {}
  if ("categoryId" in body) data.categoryId = body.categoryId
  if ("template" in body) data.template = body.template

  const site = await prisma.wpSite.update({ where: { id }, data, include: { website: true, category: true } })
  return NextResponse.json({ site })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const site = await prisma.wpSite.findUnique({ where: { id }, include: { website: true } })
  if (!site) return NextResponse.json({ error: "No existe" }, { status: 404 })

  const r = await wpAgent.uninstall(site.website.rootPath, site.dbName, site.dbUser)
  if (!r.ok) {
    return NextResponse.json({ error: friendlyError(r.error) }, { status: 500 })
  }

  await prisma.wpSite.delete({ where: { id } })
  await prisma.website.delete({ where: { id: site.websiteId } }).catch(() => {})

  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "wp_uninstall", target: site.website.domain },
  })
  return NextResponse.json({ ok: true })
}
