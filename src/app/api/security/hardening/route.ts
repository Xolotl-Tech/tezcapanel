import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { hardeningAgent } from "@/lib/hardening-agent"

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const r = await hardeningAgent.check()
  return NextResponse.json({
    agentAvailable: r.ok,
    items: r.items ?? [],
  })
}
