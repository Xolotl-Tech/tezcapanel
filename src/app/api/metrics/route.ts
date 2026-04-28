import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:7070"
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ""

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const [metricsRes, servicesRes] = await Promise.all([
      fetch(`${AGENT_URL}/metrics`, {
        headers: { Authorization: `Bearer ${AGENT_TOKEN}` },
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      }),
      fetch(`${AGENT_URL}/services`, {
        headers: { Authorization: `Bearer ${AGENT_TOKEN}` },
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      }),
    ])

    const metrics = await metricsRes.json()
    const services = await servicesRes.json()

    return NextResponse.json({ metrics, services })
  } catch {
    return NextResponse.json({ error: "agent_unavailable" }, { status: 503 })
  }
}
