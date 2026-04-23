const AGENT_URL   = process.env.AGENT_URL   ?? "http://127.0.0.1:7070"
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ""

export interface DnsZonePayload {
  domain: string
  primaryNs: string
  adminEmail: string
  serial: number
  refresh: number
  retry: number
  expire: number
  minimum: number
  defaultTtl: number
  records: Array<{
    type: string
    name: string
    value: string
    ttl: number
    priority?: number | null
  }>
}

interface ProvisionResult {
  ok: boolean
  error?: string
  output?: string
}

async function provision(data: Record<string, unknown>): Promise<ProvisionResult> {
  try {
    const res = await fetch(`${AGENT_URL}/dns/provision`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AGENT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(15000),
    })
    return await res.json()
  } catch {
    return { ok: false, error: "Agent no disponible" }
  }
}

export const dnsAgent = {
  writeZone:    (zone: DnsZonePayload) => provision({ action: "write-zone",    zone }),
  removeZone:   (domain: string)       => provision({ action: "remove-zone",   domain }),
  checkZone:    (domain: string)       => provision({ action: "check-zone",    domain }),
  reload:       ()                     => provision({ action: "reload" }),
}
