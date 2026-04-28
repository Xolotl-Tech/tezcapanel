import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ category: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { category } = await params
  const risks = await prisma.websiteSecurityRisk.findMany({
    where: { category, resolved: false },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json({ risks })
}
