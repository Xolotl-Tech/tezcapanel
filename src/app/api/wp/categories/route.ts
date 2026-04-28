import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const DEFAULT_CATEGORIES = [
  { name: "Blog", color: "#3b82f6" },
  { name: "Tienda", color: "#10b981" },
  { name: "Portfolio", color: "#a855f7" },
  { name: "Landing", color: "#f59e0b" },
]

async function ensureDefaults() {
  const count = await prisma.wpCategory.count()
  if (count === 0) {
    await prisma.wpCategory.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({ ...c, builtIn: true })),
    })
  }
}

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  await ensureDefaults()
  const categories = await prisma.wpCategory.findMany({
    orderBy: [{ builtIn: "desc" }, { name: "asc" }],
    include: { _count: { select: { sites: true } } },
  })
  return NextResponse.json({ categories })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { name, color } = await req.json()
  if (!name) return NextResponse.json({ error: "name requerido" }, { status: 400 })
  const cat = await prisma.wpCategory.create({ data: { name, color: color ?? "#10b981" } })
  return NextResponse.json({ category: cat })
}
