import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { wpAgent } from "@/lib/wp-agent"
import { webAgent } from "@/lib/web-agent"
import { friendlyError } from "@/lib/agent-errors"
import { randomBytes } from "crypto"

function randomPassword(len = 20) {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"
  // CSPRNG: descartamos el sesgo del módulo usando un buffer 4x y filtrando.
  const out = []
  const buf = randomBytes(len * 4)
  for (let i = 0; out.length < len && i < buf.length; i++) {
    const b = buf[i]
    if (b < Math.floor(256 / chars.length) * chars.length) {
      out.push(chars[b % chars.length])
    }
  }
  if (out.length < len) return randomPassword(len)
  return out.join("")
}

function dbNameFromDomain(domain: string) {
  return "wp_" + domain.replace(/[^a-z0-9]/gi, "_").slice(0, 24).toLowerCase()
}

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const sites = await prisma.wpSite.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      website: true,
      category: true,
    },
  })
  return NextResponse.json({ sites })
}

export async function POST(req: NextRequest) {
  try {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  const {
    domain,
    adminUser,
    adminPassword,
    adminEmail,
    language = "es_MX",
    template = "blog",
    categoryId,
    siteTitle,
  } = body

  if (!domain || !adminUser || !adminPassword || !adminEmail) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
  }
  if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
    return NextResponse.json({ error: "Dominio inválido" }, { status: 400 })
  }

  const existing = await prisma.website.findUnique({
    where: { domain },
    include: { wpSite: true },
  })
  if (existing?.wpSite) return NextResponse.json({ error: "Ya hay un sitio WP en ese dominio" }, { status: 409 })

  const rootPath = existing?.rootPath ?? `/var/www/${domain}`
  const dbName = dbNameFromDomain(domain)
  const dbUser = dbName.slice(0, 16)
  const dbPassword = randomPassword(20)

  // crea/actualiza Website
  const website = existing
    ? existing
    : await prisma.website.create({
        data: { domain, rootPath, active: true },
      })

  // dispara instalación en el agente
  const result = await wpAgent.install({
    domain,
    rootPath,
    dbName,
    dbUser,
    dbPassword,
    adminUser,
    adminPassword,
    adminEmail,
    siteTitle: siteTitle || domain,
    language,
    template,
  })

  if (!result.ok) {
    if (!existing) await prisma.website.delete({ where: { id: website.id } }).catch(() => {})
    console.error("[wp install fail]", result)
    return NextResponse.json({
      error: friendlyError(result.error),
      raw: result.error,
    }, { status: 500 })
  }

  // Provisionar vhost de Nginx para que el sitio sea servible. Si falla, el
  // sitio queda instalado en disco/DB pero no servido — devolvemos warning
  // en la respuesta para que la UI lo muestre, sin bloquear la creación.
  const vhost = await webAgent.createVhost({
    domain,
    rootPath,
    kind: "wp",
  })
  if (!vhost.ok) {
    console.error("[wp install vhost fail]", vhost)
  }

  const wpSite = await prisma.wpSite.create({
    data: {
      websiteId: website.id,
      categoryId: categoryId ?? null,
      template,
      version: result.version ?? null,
      adminUser,
      adminEmail,
      dbName,
      dbUser,
      language,
      lastSyncAt: new Date(),
    },
    include: { website: true, category: true },
  })

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "wp_install",
      target: domain,
      metadata: JSON.stringify({ template, version: result.version }),
    },
  })

  return NextResponse.json({
    site: wpSite,
    vhost: vhost.ok
      ? { ok: true }
      : { ok: false, warning: friendlyError(vhost.error) },
  })
  } catch (err) {
    // Detalles completos sólo en server-side log; nunca al cliente.
    console.error("[api/wp/sites POST] uncaught", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
