import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { firewallAgent } from "@/lib/firewall-agent"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const kind = searchParams.get("kind") ?? "port"
  const direction = searchParams.get("direction") // "inbound" | "outbound" | null

  const where: { kind: string; direction?: string } = { kind }
  if (direction && direction !== "all") where.direction = direction

  const rules = await prisma.firewallRule.findMany({
    where,
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json({ rules })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  const {
    kind = "port",
    protocol = "tcp",
    port = null,
    sourceIp = null,
    destIp = null,
    destPort = null,
    country = null,
    direction = "inbound",
    strategy = "allow",
    remark = null,
  } = body

  if (kind === "port" && !port) {
    return NextResponse.json({ error: "Puerto requerido" }, { status: 400 })
  }
  if (kind === "ip" && !sourceIp) {
    return NextResponse.json({ error: "IP requerida" }, { status: 400 })
  }

  const rule = await prisma.firewallRule.create({
    data: { kind, protocol, port, sourceIp, destIp, destPort, country, direction, strategy, remark },
  })

  if (kind === "port" || kind === "ip") {
    const r = await firewallAgent.addRule({
      strategy,
      direction,
      protocol,
      port,
      sourceIp,
    })
    if (!r.ok) {
      await prisma.firewallRule.update({ where: { id: rule.id }, data: { active: false } })
      return NextResponse.json({ rule, warning: r.error || "Agent no aplicó la regla" })
    }
  }

  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "create_firewall_rule", target: rule.id, metadata: JSON.stringify(body) },
  })

  return NextResponse.json({ rule })
}
