import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { intrusionAgent } from "@/lib/intrusion-agent"
import { friendlyError } from "@/lib/agent-errors"

export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const r = await intrusionAgent.createBaseline()
  if (!r.ok || !r.baseline) return NextResponse.json({ error: friendlyError(r.error) }, { status: 500 })

  await prisma.intrusionBaseline.deleteMany({})
  await prisma.intrusionBaseline.createMany({
    data: r.baseline.map((b) => ({
      path: b.path,
      sha256: b.sha256,
      size: b.size,
      mtime: b.mtime ? new Date(b.mtime) : null,
    })),
  })

  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "intrusion_baseline_create", metadata: JSON.stringify({ count: r.baseline.length }) },
  })

  return NextResponse.json({ ok: true, count: r.baseline.length })
}
