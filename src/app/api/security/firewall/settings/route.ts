import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { firewallAgent } from "@/lib/firewall-agent"

async function getSettings() {
  return prisma.firewallSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  })
}

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json(await getSettings())
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  const current = await getSettings()

  if (typeof body.enabled === "boolean" && body.enabled !== current.enabled) {
    const r = body.enabled ? await firewallAgent.enable() : await firewallAgent.disable()
    if (!r.ok) return NextResponse.json({ error: r.error || "Agent error" }, { status: 500 })
  }

  if (typeof body.blockIcmp === "boolean" && body.blockIcmp !== current.blockIcmp) {
    const r = await firewallAgent.blockIcmp(body.blockIcmp)
    if (!r.ok) return NextResponse.json({ error: r.error || "Agent error" }, { status: 500 })
  }

  const updated = await prisma.firewallSettings.update({
    where: { id: "singleton" },
    data: {
      enabled: body.enabled ?? current.enabled,
      blockIcmp: body.blockIcmp ?? current.blockIcmp,
      sshPort: body.sshPort ?? current.sshPort,
    },
  })

  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "update_firewall_settings", metadata: JSON.stringify(body) },
  })

  return NextResponse.json(updated)
}
