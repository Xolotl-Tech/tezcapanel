import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hardeningAgent } from "@/lib/hardening-agent"
import { friendlyError } from "@/lib/agent-errors"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, all } = await req.json()
  const r = all ? await hardeningAgent.applyAll() : await hardeningAgent.applyItem(id)
  if (!r.ok) return NextResponse.json({ error: friendlyError(r.error) }, { status: 500 })
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: all ? "hardening_apply_all" : "hardening_apply",
      target: id ?? null,
    },
  })
  return NextResponse.json({ ok: true, fixed: r.fixed })
}
