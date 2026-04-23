import type { DnsProviderClient, ProviderResult, RemoteZone, ZoneSyncPayload } from "./types"

const API = "https://api.cloudflare.com/client/v4"

interface CfResponse<T> {
  success: boolean
  errors?: Array<{ code: number; message: string }>
  result: T
}

interface CfZone { id: string; name: string }
interface CfRecord {
  id: string
  type: string
  name: string
  content: string
  ttl: number
  priority?: number
}

export class CloudflareProvider implements DnsProviderClient {
  constructor(private apiToken: string) {}

  private async req<T>(path: string, init?: RequestInit): Promise<CfResponse<T>> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(15000),
    })
    return res.json() as Promise<CfResponse<T>>
  }

  async test(): Promise<ProviderResult> {
    try {
      const r = await this.req<{ status: string }>("/user/tokens/verify")
      if (!r.success) return { ok: false, error: r.errors?.[0]?.message ?? "Token inválido" }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error de red" }
    }
  }

  async listZones(): Promise<ProviderResult & { zones?: RemoteZone[] }> {
    try {
      const r = await this.req<CfZone[]>("/zones?per_page=50")
      if (!r.success) return { ok: false, error: r.errors?.[0]?.message }
      return { ok: true, zones: r.result.map((z) => ({ id: z.id, domain: z.name })) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error de red" }
    }
  }

  private async findZoneId(domain: string): Promise<string | null> {
    const r = await this.req<CfZone[]>(`/zones?name=${encodeURIComponent(domain)}`)
    if (!r.success || !r.result.length) return null
    return r.result[0].id
  }

  async syncZone(zone: ZoneSyncPayload): Promise<ProviderResult> {
    try {
      const zoneId = await this.findZoneId(zone.domain)
      if (!zoneId) {
        return { ok: false, error: `La zona ${zone.domain} no existe en Cloudflare. Agrégala primero en el dashboard.` }
      }

      // Lee registros remotos
      const remoteRes = await this.req<CfRecord[]>(`/zones/${zoneId}/dns_records?per_page=200`)
      if (!remoteRes.success) return { ok: false, error: remoteRes.errors?.[0]?.message }

      const remote = remoteRes.result
      const desired = zone.records
        .filter((r) => ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV"].includes(r.type))

      const key = (r: { type: string; name: string; value: string; priority?: number | null }) => {
        const fullName = r.name === "@" ? zone.domain : `${r.name}.${zone.domain}`
        return `${r.type}|${fullName}|${r.value}|${r.priority ?? ""}`
      }

      const remoteByKey = new Map(remote.map((r) => [
        `${r.type}|${r.name}|${r.content}|${r.priority ?? ""}`,
        r,
      ]))
      const desiredByKey = new Map(desired.map((r) => [key(r), r]))

      // Crear los que faltan
      for (const [k, r] of desiredByKey) {
        if (remoteByKey.has(k)) continue
        const fullName = r.name === "@" ? zone.domain : `${r.name}.${zone.domain}`
        const body: Record<string, unknown> = {
          type: r.type,
          name: fullName,
          content: r.value,
          ttl: r.ttl || 3600,
        }
        if (r.priority !== null && r.priority !== undefined) body.priority = r.priority
        const created = await this.req(`/zones/${zoneId}/dns_records`, {
          method: "POST",
          body: JSON.stringify(body),
        })
        if (!created.success) return { ok: false, error: created.errors?.[0]?.message }
      }

      // Borrar los sobrantes (solo los que no estén en desired)
      for (const [k, r] of remoteByKey) {
        if (desiredByKey.has(k)) continue
        // No tocar NS del root — Cloudflare los administra
        if (r.type === "NS" && r.name === zone.domain) continue
        await this.req(`/zones/${zoneId}/dns_records/${r.id}`, { method: "DELETE" })
      }

      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error de red" }
    }
  }

  async removeZone(): Promise<ProviderResult> {
    // Por seguridad, no eliminamos la zona del proveedor, solo el panel deja de gestionarla
    return { ok: true }
  }
}
