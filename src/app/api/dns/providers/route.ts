import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ensureBuiltInProvider, PROVIDER_META, type ProviderType } from "@/lib/dns-providers"
import { encryptJson } from "@/lib/crypto"

function publicProvider(p: {
  id: string; type: string; alias: string; account: string | null;
  status: boolean; permission: string; isBuiltIn: boolean;
  _count?: { zones: number }
}) {
  const meta = PROVIDER_META[p.type as ProviderType]
  return {
    id: p.id,
    type: p.type,
    alias: p.alias,
    account: p.account,
    brand: meta?.brand ?? p.type,
    status: p.status,
    permission: p.permission,
    isBuiltIn: p.isBuiltIn,
    domainCount: p._count?.zones ?? 0,
  }
}

export async function GET() {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureBuiltInProvider(prisma)

    const providers = await prisma.dnsProvider.findMany({
      orderBy: [{ isBuiltIn: "asc" }, { createdAt: "desc" }],
      include: { _count: { select: { zones: true } } },
    })

    return NextResponse.json({ providers: providers.map(publicProvider) })
  } catch (err) {
    console.error("[dns/providers GET]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { type, alias, config, status, permission } = await req.json()

    if (!type || !PROVIDER_META[type as ProviderType]) {
      return NextResponse.json({ error: "Tipo de provider inválido" }, { status: 400 })
    }
    if (!alias || !String(alias).trim()) {
      return NextResponse.json({ error: "Alias requerido" }, { status: 400 })
    }

    const meta = PROVIDER_META[type as ProviderType]
    const cfg = (config && typeof config === "object") ? config as Record<string, string> : {}
    const account = meta.accountField ? (cfg[meta.accountField] ?? null) : null

    const provider = await prisma.dnsProvider.create({
      data: {
        type,
        alias: String(alias).trim(),
        account,
        config: encryptJson(cfg),
        status: status !== false,
        permission: permission ?? "global",
        isBuiltIn: false,
      },
    })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: "create_dns_provider", target: provider.alias },
    })

    return NextResponse.json({ provider: publicProvider({ ...provider, _count: { zones: 0 } }) })
  } catch (err) {
    console.error("[dns/providers POST]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
