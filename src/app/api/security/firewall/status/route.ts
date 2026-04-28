import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { firewallAgent } from "@/lib/firewall-agent"

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [status, listening] = await Promise.all([
    firewallAgent.status(),
    firewallAgent.listeningPorts(),
  ])

  return NextResponse.json({
    enabled: !!status.enabled,
    agentAvailable: status.ok,
    listeningPorts: listening.ports ?? [],
    raw: status.raw,
  })
}
