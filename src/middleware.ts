import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// --- CSP por request con nonce ---
// Reemplaza el CSP estático con `script-src 'self' 'nonce-XXX' 'strict-dynamic'`.
// 'strict-dynamic' = scripts cargados por scripts con nonce válido también pasan,
// lo que permite el bundle splitting de Next sin abrir 'unsafe-inline' a XSS.
// En dev necesitamos 'unsafe-eval' para React Refresh / HMR.
function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString("base64")
}

function buildCsp(nonce: string, isDev: boolean): string {
  // NOTE: ideally we'd use `'self' 'nonce-${nonce}' 'strict-dynamic'` here, but
  // Next.js 15.3 with our custom server (server.js) is not auto-injecting the
  // nonce attribute on the <script> tags it emits. Result: chunks load without
  // nonce, strict-dynamic blocks them, page never hydrates. Until we either
  // upgrade Next or wire nonce manually in the root layout, fall back to
  // 'self' 'unsafe-inline' so the panel actually works. Tradeoff: loses CSP's
  // XSS-via-inline-script protection. Other layers (input sanitization,
  // React's auto-escaping, X-Frame DENY, etc.) still hold.
  const scriptSrc = isDev
    ? `'self' 'unsafe-inline' 'unsafe-eval'`
    : `'self' 'unsafe-inline'`
  // nonce is still emitted in `x-nonce` request header for any future server
  // component that wants to use it; no harm leaving it.
  void nonce
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // TODO: migrar style-src a nonces — Tailwind/CSS-in-JS mete <style> inline
    // que rompe sin 'unsafe-inline'. Es un cambio aparte porque toca cómo Next
    // emite los estilos.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' wss: ws:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ")
}

function nextWithCsp(req: NextRequest, isHtml: boolean): NextResponse {
  const nonce = isHtml ? generateNonce() : ""
  const requestHeaders = new Headers(req.headers)
  if (isHtml) {
    const isDev = process.env.NODE_ENV !== "production"
    const csp = buildCsp(nonce, isDev)
    // Both must be set on the REQUEST headers: `x-nonce` so server components
    // can read it via headers(), and `Content-Security-Policy` so Next's
    // renderer auto-injects nonce="..." into the <script> tags it emits.
    // Without the CSP request header, Next emits chunks without nonce and
    // strict-dynamic blocks them — page never hydrates.
    requestHeaders.set("x-nonce", nonce)
    requestHeaders.set("Content-Security-Policy", csp)
    const res = NextResponse.next({ request: { headers: requestHeaders } })
    res.headers.set("Content-Security-Policy", csp)
    return res
  }
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isApi = pathname.startsWith("/api")
  const isHtml = !isApi

  // Rutas públicas que no necesitan sesión.
  // Boundary check: pathname debe ser exactamente la ruta o seguirla con `/`,
  // para que `/setupx` o `/login-fake` no se traten como públicas si Next algún
  // día rutea esos paths.
  const publicRoutes = [
    "/_next",
    "/favicon",
    "/setup",
    "/login",
    "/api/auth", // NextAuth endpoints
    "/api/setup", // Setup endpoints
  ]

  const isPublic = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )
  if (isPublic) return nextWithCsp(req, isHtml)

  // Todas las otras rutas necesitan sesión con rol ADMIN
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.redirect(new URL("/login", req.url))
  }

  return nextWithCsp(req, isHtml)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}