import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const commands = await prisma.sshCommand.findMany({ orderBy: { createdAt: "desc" } })
  return NextResponse.json({ commands })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name, command } = await req.json()
  if (!name || !command) {
    return NextResponse.json({ error: "name y command requeridos" }, { status: 400 })
  }
  const created = await prisma.sshCommand.create({
    data: { name: String(name).trim(), command: String(command) },
  })
  return NextResponse.json({ command: created })
}
