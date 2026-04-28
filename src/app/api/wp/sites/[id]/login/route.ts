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

  const r = await wpAgent.autoLogin(site.website.rootPath, site.adminUser)
  if (!r.ok) return NextResponse.json({ error: friendlyError(r.error) }, { status: 500 })

  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "wp_auto_login", target: site.website.domain },
  })

  // URL de auto-login: el sitio WP necesita un MU-plugin que valide el _tezca_login_key
  // Por ahora devolvemos la URL de login admin estándar y la key generada
  return NextResponse.json({
    loginUrl: `https://${site.website.domain}/wp-login.php?tezca_key=${r.key}&user=${encodeURIComponent(site.adminUser)}`,
    key: r.key,
    user: r.user,
  })
}
