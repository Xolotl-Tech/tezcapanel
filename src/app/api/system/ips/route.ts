import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import os from "node:os"

// Devuelve las IPs del servidor para mostrar en formularios donde el
// usuario debe apuntar un dominio aquí. La pública la consultamos por
// HTTP saliente (api.ipify.org) y la cacheamos 1 hora — no cambia seguido
// y queremos evitar miles de requests al crear sitios.
let cachedPublic: { ip: string | null; at: number } = { ip: null, at: 0 }
const PUBLIC_TTL_MS = 60 * 60_000

async function getPublicIp(): Promise<string | null> {
  if (Date.now() - cachedPublic.at < PUBLIC_TTL_MS && cachedPublic.ip !== null) {
    return cachedPublic.ip
  }
  try {
    const res = await fetch("https://api.ipify.org", {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const ip = (await res.text()).trim()
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return null
    cachedPublic = { ip, at: Date.now() }
    return ip
  } catch {
    return null
  }
}

function getLanIps(): string[] {
  const out: string[] = []
  for (const ifaces of Object.values(os.networkInterfaces())) {
    if (!ifaces) continue
    for (const i of ifaces) {
      if (i.family === "IPv4" && !i.internal) out.push(i.address)
    }
  }
  return out
}

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const lan = getLanIps()
  const publicIp = await getPublicIp()
  return NextResponse.json({ lan, public: publicIp })
}
