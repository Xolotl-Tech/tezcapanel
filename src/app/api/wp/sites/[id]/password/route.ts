import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { wpAgent } from "@/lib/wp-agent"
import { friendlyError } from "@/lib/agent-errors"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const { password } = await req.json()
  if (!password || password.length < 8) return NextResponse.json({ error: "Mínimo 8 caracteres" }, { status: 400 })

  const site = await prisma.wpSite.findUnique({ where: { id }, include: { website: true } })
  if (!site) return NextResponse.json({ error: "No existe" }, { status: 404 })

  const r = await wpAgent.changePassword(site.website.rootPath, site.adminUser, password)
  if (!r.ok) return NextResponse.json({ error: friendlyError(r.error) }, { status: 500 })

  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "wp_change_admin_password", target: site.website.domain },
  })
  return NextResponse.json({ ok: true })
}
