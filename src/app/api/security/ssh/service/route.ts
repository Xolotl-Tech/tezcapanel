import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { sshAgent } from "@/lib/ssh-agent"
import { prisma } from "@/lib/prisma"
import { friendlyError } from "@/lib/agent-errors"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { enabled } = await req.json()
  const r = enabled ? await sshAgent.enable() : await sshAgent.disable()
  if (!r.ok) return NextResponse.json({ error: friendlyError(r.error) }, { status: 500 })
  await prisma.auditLog.create({
    data: { userId: session.user.id, action: enabled ? "enable_ssh" : "disable_ssh" },
  })
  return NextResponse.json({ ok: true })
}
