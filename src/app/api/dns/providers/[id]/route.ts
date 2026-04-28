import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { PROVIDER_META, type ProviderType } from "@/lib/dns-providers"
import { encryptJson, decryptJson } from "@/lib/crypto"

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await context.params
    const data = await req.json().catch(() => null)

    const provider = await prisma.dnsProvider.findUnique({ where: { id } })
    if (!provider) return NextResponse.json({ error: "Provider no encontrado" }, { status: 404 })

    let nextConfig: string | undefined
    let nextAccount: string | null | undefined

    if (data.config && typeof data.config === "object") {
      // Mezclar con config existente: si un campo viene vacío, conservar el actual (el form puede no reenviar secrets)
      const incoming = data.config as Record<string, string>
      const current  = decryptJson<Record<string, string>>(provider.config)
      const merged: Record<string, string> = { ...current }
      for (const [k, v] of Object.entries(incoming)) {
        if (v !== undefined && v !== "") merged[k] = v
      }
      nextConfig = encryptJson(merged)
      const meta = PROVIDER_META[provider.type as ProviderType]
      if (meta?.accountField) nextAccount = merged[meta.accountField] ?? null
    }

    const updated = await prisma.dnsProvider.update({
      where: { id },
      data: {
        ...(data.alias      !== undefined && { alias: String(data.alias).trim() }),
        ...(data.status     !== undefined && { status: Boolean(data.status) }),
        ...(data.permission !== undefined && { permission: String(data.permission) }),
        ...(nextConfig      !== undefined && { config: nextConfig }),
        ...(nextAccount     !== undefined && { account: nextAccount }),
      },
    })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: "update_dns_provider", target: provider.alias },
    })

    return NextResponse.json({ provider: updated })
  } catch (err) {
    console.error("[dns/providers PATCH]", err)
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
    const provider = await prisma.dnsProvider.findUnique({
      where: { id },
      include: { _count: { select: { zones: true } } },
    })
    if (!provider) return NextResponse.json({ error: "Provider no encontrado" }, { status: 404 })
    if (provider.isBuiltIn) {
      return NextResponse.json({ error: "No se puede eliminar el provider built-in" }, { status: 400 })
    }
    if (provider._count.zones > 0) {
      return NextResponse.json({
        error: `Este provider tiene ${provider._count.zones} zona(s). Reasígnalas o elimínalas primero.`,
      }, { status: 400 })
    }

    await prisma.dnsProvider.delete({ where: { id } })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: "delete_dns_provider", target: provider.alias },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[dns/providers DELETE]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
