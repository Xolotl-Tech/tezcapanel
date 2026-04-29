import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Una vez configurado el panel, el endpoint deja de existir (404). Así un
// scan no autenticado no puede distinguir "panel fresco" de "ya configurado".
// La UI del login interpreta 404 como "no redirigir a /setup".
export async function GET() {
  const count = await prisma.user.count()
  if (count > 0) return new NextResponse(null, { status: 404 })
  return NextResponse.json({ hasUsers: false })
}