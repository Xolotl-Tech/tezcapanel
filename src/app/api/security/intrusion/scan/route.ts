import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { intrusionAgent } from "@/lib/intrusion-agent"
import { friendlyError } from "@/lib/agent-errors"

export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await prisma.intrusionScan.upsert({
    where: { id: "singleton" },
    update: { status: "running", error: null },
    create: { id: "singleton", status: "running" },
  })

  const baseline = await prisma.intrusionBaseline.findMany()
  const payload = baseline.map((b) => ({
    path: b.path,
    sha256: b.sha256,
    size: b.size,
    mtime: b.mtime?.toISOString() ?? null,
  }))

  const r = await intrusionAgent.scan(payload)
  if (!r.ok || !r.findings) {
    const err = friendlyError(r.error)
    await prisma.intrusionScan.update({
      where: { id: "singleton" },
      data: { status: "error", error: err },
    })
    return NextResponse.json({ error: err }, { status: 500 })
  }

  await prisma.intrusionFinding.deleteMany({ where: { resolved: false } })
  if (r.findings.length) {
    await prisma.intrusionFinding.createMany({
      data: r.findings.map((f) => ({
        type: f.type,
        severity: f.severity,
        title: f.title,
        description: f.description,
        path: f.path,
        extra: f.extra,
      })),
    })
  }

  const scan = await prisma.intrusionScan.update({
    where: { id: "singleton" },
    data: {
      status: "done",
      lastScanAt: new Date(),
      durationMs: r.durationMs ?? 0,
      totalFindings: r.findings.length,
      error: null,
    },
  })

  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "intrusion_scan", metadata: JSON.stringify({ findings: r.findings.length }) },
  })

  return NextResponse.json({ ok: true, scan, findingCount: r.findings.length, chkrootkitInstalled: !!r.chkrootkitInstalled })
}
