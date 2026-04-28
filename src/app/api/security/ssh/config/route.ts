import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { sshAgent } from "@/lib/ssh-agent"
import { prisma } from "@/lib/prisma"
import { friendlyError } from "@/lib/agent-errors"

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const r = await sshAgent.status()
  return NextResponse.json({
    agentAvailable: r.ok,
    running: !!r.running,
    config: r.config ?? null,
  })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const r = await sshAgent.updateConfig(body)
  if (!r.ok) return NextResponse.json({ error: friendlyError(r.error) }, { status: 500 })

  if (typeof body.port === "number") {
    await prisma.firewallSettings.upsert({
      where: { id: "singleton" },
      update: { sshPort: body.port },
      create: { id: "singleton", sshPort: body.port },
    })
  }

  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "update_ssh_config", metadata: JSON.stringify(body) },
  })
  return NextResponse.json({ ok: true })
}
