import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const data = await req.json()
  const site = await prisma.website.update({
    where: { id },
    data,
  })

  return NextResponse.json({ site })
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const site = await prisma.website.findUnique({ where: { id } })
  if (!site) return NextResponse.json({ error: "Sitio no encontrado" }, { status: 404 })

  await prisma.website.delete({ where: { id } })

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "delete_website",
      target: site.domain,
    },
  })

  return NextResponse.json({ ok: true })
}