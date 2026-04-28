import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const logs = await prisma.auditLog.findMany({
      where: { action: { contains: "dns_" } },
      orderBy: { createdAt: "desc" },
      take: 100,
    })

    const userIds = [...new Set(logs.map((l) => l.userId))]
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, name: true },
    })
    const userMap = new Map(users.map((u) => [u.id, u]))

    return NextResponse.json({
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        target: l.target,
        metadata: l.metadata,
        createdAt: l.createdAt,
        user: userMap.get(l.userId) ?? null,
      })),
    })
  } catch (err) {
    console.error("[dns/logs GET]", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
