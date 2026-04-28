import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:7070"
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ""

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const db = await prisma.database.findUnique({ where: { id } })
  if (!db) return NextResponse.json({ error: "Base de datos no encontrada" }, { status: 404 })

  const filename = `${db.name}_${new Date().toISOString().slice(0, 10)}.sql`
  const path = `/var/backups/tezcapanel/${filename}`
  const command = `mysqldump ${db.name} > ${path}`

  try {
    const res = await fetch(`${AGENT_URL}/execute`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AGENT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ commands: [
        `mkdir -p /var/backups/tezcapanel`,
        command,
      ]}),
      signal: AbortSignal.timeout(60000),
    })

    const data = await res.json()
    const success = data.results?.every((r: { success: boolean }) => r.success)

    if (!success) {
      return NextResponse.json({
        error: "Error al crear el backup",
        details: data.results,
      }, { status: 500 })
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "backup_database",
        target: db.name,
        metadata: JSON.stringify({ filename, path }),
      },
    })

    return NextResponse.json({ ok: true, filename, path })
  } catch {
    return NextResponse.json({ error: "Agent unavailable" }, { status: 503 })
  }
}