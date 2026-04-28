import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:7070"
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ""

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { commands, actionLabels } = await req.json()

  if (!Array.isArray(commands) || commands.length === 0) {
    return NextResponse.json({ error: "commands requerido" }, { status: 400 })
  }

  const safeCommands = commands.slice(0, 20)
  const target = (actionLabels?.join(", ") ?? safeCommands.join(", ")).slice(0, 500)

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "execute_commands",
      target,
      metadata: JSON.stringify({ commands: safeCommands }),
    },
  })

  try {
    const res = await fetch(`${AGENT_URL}/execute`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AGENT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ commands }),
      signal: AbortSignal.timeout(60000), // 60s para comandos largos
    })

    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "agent_unavailable" }, { status: 503 })
  }
}
