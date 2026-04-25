import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const servers = await prisma.sshServer.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, host: true, port: true, username: true,
      authType: true, remarks: true, createdAt: true,
    },
  })
  return NextResponse.json({ servers })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { host, port, username, authType, password, privateKey, remarks } = body

  if (!host || !username) {
    return NextResponse.json({ error: "host y username son obligatorios" }, { status: 400 })
  }
  if (authType === "password" && !password) {
    return NextResponse.json({ error: "Password requerido" }, { status: 400 })
  }
  if (authType === "key" && !privateKey) {
    return NextResponse.json({ error: "Private key requerida" }, { status: 400 })
  }

  const server = await prisma.sshServer.create({
    data: {
      host: String(host).trim(),
      port: Number(port) || 22,
      username: String(username).trim(),
      authType: authType === "key" ? "key" : "password",
      password: authType === "password" ? password : null,
      privateKey: authType === "key" ? privateKey : null,
      remarks: remarks || null,
    },
    select: {
      id: true, host: true, port: true, username: true,
      authType: true, remarks: true, createdAt: true,
    },
  })
  return NextResponse.json({ server })
}
