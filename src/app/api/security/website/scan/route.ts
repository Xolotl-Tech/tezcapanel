import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { runWebsiteScan, type ScanRisks } from "@/lib/website-security-agent"
import { friendlyError } from "@/lib/agent-errors"

const LOG_PATHS = [
  "/var/log/nginx/access.log",
  "/var/log/apache2/access.log",
  "/www/wwwlogs/access.log",
]

export async function POST() {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await prisma.websiteSecurityScan.upsert({
      where: { id: "singleton" },
      update: { status: "running", error: null },
      create: { id: "singleton", status: "running" },
    })

    const websites = await prisma.website.findMany({ where: { active: true } })
    const payload = websites.map((w) => ({ domain: w.domain, rootPath: w.rootPath }))

    const result = await runWebsiteScan(payload, LOG_PATHS)

    if (!result.ok || !result.risks || !result.counts) {
      const err = friendlyError(result.error)
      await prisma.websiteSecurityScan.update({
        where: { id: "singleton" },
        data: { status: "error", error: err },
      })
      return NextResponse.json({ error: err }, { status: 500 })
    }

    await prisma.websiteSecurityRisk.deleteMany({})
    const flat: { category: string; severity: string; title: string; description?: string; affectedPath?: string; domain?: string }[] = []
    for (const [category, items] of Object.entries(result.risks as ScanRisks)) {
      for (const r of items) {
        flat.push({ category, severity: r.severity, title: r.title, description: r.description, affectedPath: r.affectedPath, domain: r.domain })
      }
    }
    if (flat.length) {
      await prisma.websiteSecurityRisk.createMany({ data: flat })
    }

    const updated = await prisma.websiteSecurityScan.update({
      where: { id: "singleton" },
      data: {
        status: "done",
        score: result.score ?? 0,
        durationMs: result.durationMs ?? 0,
        xssCount: result.counts.xss,
        sqlCount: result.counts.sql,
        phpAttackCount: result.counts.php,
        maliciousCount: result.counts.malicious,
        topIps: JSON.stringify(result.topIps ?? []),
        lastScanAt: new Date(),
        error: null,
      },
    })

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: "website_security_scan", metadata: JSON.stringify({ score: result.score, risks: flat.length }) },
    })

    return NextResponse.json({ ok: true, scan: updated, riskCount: flat.length })
  } catch (err) {
    console.error("[api/security/website/scan]", err)
    await prisma.websiteSecurityScan.update({
      where: { id: "singleton" },
      data: { status: "error", error: err instanceof Error ? err.message : "Error" },
    }).catch(() => {})
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 })
  }
}
