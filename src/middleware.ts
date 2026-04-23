import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Rutas públicas que no necesitan sesión
  const publicRoutes = [
    "/_next",
    "/favicon",
    "/setup",
    "/login",
    "/api/auth", // NextAuth endpoints
    "/api/setup", // Setup endpoints
  ]

  const isPublic = publicRoutes.some((route) => pathname.startsWith(route))

  if (isPublic) {
    return NextResponse.next()
  }

  // Todas las otras rutas necesitan sesión
  const session = await auth()
  if (!session) {
    // Si es una API, retornar 401
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    // Si es una página, redirigir a login
    return NextResponse.redirect(new URL("/login", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}