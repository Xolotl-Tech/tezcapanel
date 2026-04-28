import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const scan = await prisma.websiteSecurityScan.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    })

    const risks = await prisma.websiteSecurityRisk.findMany({
      where: { resolved: false },
      orderBy: { createdAt: "desc" },
    })

    const byCategory: Record<string, number> = {}
    for (const r of risks) byCategory[r.category] = (byCategory[r.category] || 0) + 1

    const categories = [
      { id: "config", label: "Seguridad de configuración del sitio" },
      { id: "file-leak", label: "Detección de fugas de archivos" },
      { id: "webshell", label: "Detección de webshells" },
      { id: "backup", label: "Archivos de respaldo" },
      { id: "weak-password", label: "Detección de contraseñas débiles" },
      { id: "logs", label: "Logs del sitio web" },
    ]

    return NextResponse.json({
      scan: {
        ...scan,
        topIps: safeParse(scan.topIps),
      },
      categories: categories.map((c) => ({ ...c, riskCount: byCategory[c.id] || 0 })),
    })
  } catch (err) {
    console.error("[api/security/website GET]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 })
  }
}

function safeParse(s: string) {
  try { return JSON.parse(s) } catch { return [] }
}
