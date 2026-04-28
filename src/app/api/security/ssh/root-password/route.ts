import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { sshAgent } from "@/lib/ssh-agent"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { password } = await req.json()
  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 })
  }
  const r = await sshAgent.resetRootPassword(password)
  if (!r.ok) return NextResponse.json({ error: (await import("@/lib/agent-errors")).friendlyError(r.error) }, { status: 500 })
  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "reset_root_password" },
  })
  return NextResponse.json({ ok: true })
}
