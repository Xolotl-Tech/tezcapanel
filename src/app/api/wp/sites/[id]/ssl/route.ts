import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { webAgent } from "@/lib/web-agent"
import { friendlyError } from "@/lib/agent-errors"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await params

  const site = await prisma.wpSite.findUnique({
    where: { id },
    include: { website: true },
  })
  if (!site) return NextResponse.json({ error: "Sitio no existe" }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  // Email para Let's Encrypt: el body manda, fallback al admin del sitio.
  // Sin email no podemos emitir cert (LE lo requiere para avisos de expiración).
  const email = (body?.email as string | undefined) || site.adminEmail
  if (!email) {
    return NextResponse.json({ error: "Email requerido" }, { status: 400 })
  }

  const r = await webAgent.provisionSsl({
    domain: site.website.domain,
    email,
    includeWww: body?.includeWww !== false,
  })

  if (!r.ok) {
    return NextResponse.json({ error: friendlyError(r.error) }, { status: 500 })
  }

  // Marcar SSL=true en la fila Website. certbot ya emitió, instaló y reload.
  await prisma.website.update({
    where: { id: site.websiteId },
    data: { ssl: true },
  })

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "wp_ssl_provision",
      target: site.website.domain,
    },
  })

  return NextResponse.json({ ok: true })
}
