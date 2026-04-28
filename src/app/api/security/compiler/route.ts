import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { compilerAgent } from "@/lib/compiler-agent"
import { friendlyError } from "@/lib/agent-errors"

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const r = await compilerAgent.status()
  return NextResponse.json({
    agentAvailable: r.ok,
    compilers: r.compilers ?? [],
  })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { key, enabled } = await req.json()
  if (!key || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "key y enabled requeridos" }, { status: 400 })
  }
  const r = await compilerAgent.toggle(key, enabled)
  if (!r.ok) return NextResponse.json({ error: friendlyError(r.error) }, { status: 500 })
  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "compiler_toggle", target: key, metadata: JSON.stringify({ enabled }) },
  })
  return NextResponse.json({ ok: true })
}
