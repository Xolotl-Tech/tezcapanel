import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { sshAgent } from "@/lib/ssh-agent"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const limit = Math.min(1000, Math.max(1, parseInt(new URL(req.url).searchParams.get("limit") || "200", 10)))
  const r = await sshAgent.logs(limit)
  return NextResponse.json({
    entries: r.entries ?? [],
    success: r.success ?? 0,
    failure: r.failure ?? 0,
    successToday: r.successToday ?? 0,
    failureToday: r.failureToday ?? 0,
  })
}
