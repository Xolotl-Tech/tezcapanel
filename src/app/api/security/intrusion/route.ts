import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const scan = await prisma.intrusionScan.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    })
    const findings = await prisma.intrusionFinding.findMany({
      where: { resolved: false },
      orderBy: { createdAt: "desc" },
    })
    const baselineCount = await prisma.intrusionBaseline.count()

    const byType: Record<string, number> = {}
    for (const f of findings) byType[f.type] = (byType[f.type] || 0) + 1

    return NextResponse.json({
      scan,
      findings,
      baselineCount,
      byType,
    })
  } catch (err) {
    console.error("[api/security/intrusion GET]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 })
  }
}
