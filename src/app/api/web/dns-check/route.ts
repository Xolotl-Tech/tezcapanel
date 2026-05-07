import { auth } from "@/lib/auth"
import { NextResponse, type NextRequest } from "next/server"
import dns from "node:dns/promises"
import os from "node:os"

// Verifica si un dominio resuelve a alguna de las IPs de este servidor.
// Lo usa el formulario de "Crear sitio" para avisar al usuario antes
// de provisionar nginx con un server_name que su navegador nunca podrá
// alcanzar (típico al usar dominios .local, .test o un dominio real
// que aún no apunta acá).
//
// Tres casos visibles para el usuario:
//   ok        → resuelve a IP local o pública del server
//   mismatch  → resuelve, pero a otra IP (probable A record viejo)
//   unresolved → no resuelve (NXDOMAIN, .local, dominio nuevo sin DNS)

interface Result {
  status: "ok" | "mismatch" | "unresolved"
  resolved: string[]   // IPs A obtenidas
  serverIps: string[]  // IPs locales+pública conocidas del server
}

function getLocalIps(): string[] {
  const out: string[] = []
  for (const ifaces of Object.values(os.networkInterfaces())) {
    if (!ifaces) continue
    for (const i of ifaces) {
      if (i.family === "IPv4" && !i.internal) out.push(i.address)
    }
  }
  return out
}

function isValidDomain(d: string): boolean {
  return /^[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(d) && d.length <= 253 && !d.includes("..")
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const domain = req.nextUrl.searchParams.get("domain")?.trim().toLowerCase() ?? ""
  if (!domain || !isValidDomain(domain)) {
    return NextResponse.json({ error: "invalid_domain" }, { status: 400 })
  }

  // Servidor de este host
  const serverIps = getLocalIps()
  // Cache de IP pública (lazy import del otro endpoint sería un círculo —
  // mejor consultar de nuevo aquí, igual son segundos por TTL externo)
  try {
    const r = await fetch("https://api.ipify.org", { signal: AbortSignal.timeout(2500) })
    if (r.ok) {
      const ip = (await r.text()).trim()
      if (/^\d+\.\d+\.\d+\.\d+$/.test(ip) && !serverIps.includes(ip)) serverIps.push(ip)
    }
  } catch {}

  let resolved: string[] = []
  try {
    resolved = await dns.resolve4(domain)
  } catch {
    // NXDOMAIN, SERVFAIL, .local sin mDNS, etc.
    const result: Result = { status: "unresolved", resolved: [], serverIps }
    return NextResponse.json(result)
  }

  const matches = resolved.some((ip) => serverIps.includes(ip))
  const result: Result = {
    status: matches ? "ok" : "mismatch",
    resolved,
    serverIps,
  }
  return NextResponse.json(result)
}
