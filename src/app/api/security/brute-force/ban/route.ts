import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { bruteForceAgent } from "@/lib/brute-force-agent"
import { friendlyError } from "@/lib/agent-errors"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { jail, ip } = await req.json()
  if (!jail || !ip) return NextResponse.json({ error: "jail e ip requeridos" }, { status: 400 })
  const r = await bruteForceAgent.ban(jail, ip)
  if (!r.ok) return NextResponse.json({ error: friendlyError(r.error) }, { status: 500 })
  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "fail2ban_ban", target: `${jail}:${ip}` },
  })
  return NextResponse.json({ ok: true })
}
