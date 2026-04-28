import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { bruteForceAgent } from "@/lib/brute-force-agent"
import { friendlyError } from "@/lib/agent-errors"

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  const r = await bruteForceAgent.updateGlobal(body)
  if (!r.ok) return NextResponse.json({ error: friendlyError(r.error) }, { status: 500 })
  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "fail2ban_update_global", metadata: JSON.stringify(body) },
  })
  return NextResponse.json({ ok: true })
}
