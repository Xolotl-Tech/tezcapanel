import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { bruteForceAgent } from "@/lib/brute-force-agent"
import { friendlyError } from "@/lib/agent-errors"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { name } = await params
  const body = await req.json()
  const r = await bruteForceAgent.updateJail(name, body)
  if (!r.ok) return NextResponse.json({ error: friendlyError(r.error) }, { status: 500 })
  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "fail2ban_update_jail", target: name, metadata: JSON.stringify(body) },
  })
  return NextResponse.json({ ok: true })
}
