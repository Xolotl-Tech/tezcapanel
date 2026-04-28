import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET — obtener preferencias de notificación del usuario
export async function GET() {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    let prefs = await prisma.notificationPreferences.findUnique({
      where: { userId: session.user.id },
    })

    // Si no existen, crearlas
    if (!prefs) {
      prefs = await prisma.notificationPreferences.create({
        data: {
          userId: session.user.id,
          email: true,
        },
      })
    }

    return NextResponse.json({ prefs })
  } catch (error) {
    console.error("[API] Error getting notification preferences:", error)
    return NextResponse.json(
      { error: "Error fetching preferences" },
      { status: 500 }
    )
  }
}

// PATCH — actualizar preferencias de notificación
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const data = await req.json()

    const prefs = await prisma.notificationPreferences.upsert({
      where: { userId: session.user.id },
      update: data,
      create: {
        userId: session.user.id,
        ...data,
      },
    })

    return NextResponse.json({ prefs })
  } catch (error) {
    console.error("[API] Error updating notification preferences:", error)
    return NextResponse.json(
      { error: "Error updating preferences" },
      { status: 500 }
    )
  }
}
