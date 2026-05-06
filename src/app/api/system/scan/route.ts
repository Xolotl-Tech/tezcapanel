import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { scanSystem } from "@/lib/system-scan-agent"

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const result = await scanSystem()
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 })
  }
  return NextResponse.json(result.scan)
}
