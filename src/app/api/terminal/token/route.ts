import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { signTerminalToken } from "@/lib/agent-ws-token"

const TTL_MS = 60_000

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!process.env.AGENT_TOKEN) {
    return NextResponse.json({ error: "AGENT_TOKEN no configurado" }, { status: 500 })
  }

  const token = signTerminalToken(session.user.id, TTL_MS)
  return NextResponse.json({ token, expiresIn: Math.floor(TTL_MS / 1000) }, {
    headers: { "Cache-Control": "no-store" },
  })
}
