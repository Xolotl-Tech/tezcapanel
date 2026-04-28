import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  await prisma.sshServer.delete({ where: { id } }).catch(() => null)
  return NextResponse.json({ ok: true })
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const server = await prisma.sshServer.findUnique({
    where: { id },
    select: {
      id: true, host: true, port: true, username: true,
      authType: true, password: true, privateKey: true, remarks: true,
    },
  })
  if (!server) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json({ server })
}
