import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  await prisma.intrusionFinding.update({ where: { id }, data: { resolved: true } })
  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "intrusion_dismiss_finding", target: id },
  })
  return NextResponse.json({ ok: true })
}
