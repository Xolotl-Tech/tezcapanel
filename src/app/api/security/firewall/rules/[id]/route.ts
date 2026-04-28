import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { firewallAgent } from "@/lib/firewall-agent"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

  const rule = await prisma.firewallRule.update({ where: { id }, data: body })
  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "update_firewall_rule", target: id },
  })
  return NextResponse.json({ rule })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const rule = await prisma.firewallRule.findUnique({ where: { id } })
  if (!rule) return NextResponse.json({ error: "No existe" }, { status: 404 })

  if (rule.kind === "port" || rule.kind === "ip") {
    await firewallAgent.deleteRule({
      strategy: rule.strategy as "allow" | "deny",
      direction: rule.direction as "inbound" | "outbound",
      protocol: rule.protocol as "tcp" | "udp" | "both",
      port: rule.port,
      sourceIp: rule.sourceIp,
    })
  }

  await prisma.firewallRule.delete({ where: { id } })
  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "delete_firewall_rule", target: id },
  })
  return NextResponse.json({ ok: true })
}
