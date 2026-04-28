import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getProviderClient } from "@/lib/dns-providers"

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await context.params
    const provider = await prisma.dnsProvider.findUnique({ where: { id } })
    if (!provider) return NextResponse.json({ error: "Provider no encontrado" }, { status: 404 })

    const client = getProviderClient(provider)
    const result = await client.test()
    return NextResponse.json(result)
  } catch (err) {
    console.error("[dns/providers/test]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
