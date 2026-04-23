import { dnsAgent } from "@/lib/dns-agent"
import type { DnsProviderClient, ProviderResult, ZoneSyncPayload } from "./types"

export class BindProvider implements DnsProviderClient {
  async test(): Promise<ProviderResult> {
    const res = await dnsAgent.reload()
    return { ok: res.ok, error: res.error }
  }

  async listZones() {
    // BIND no tiene API de listado — las zonas están en la DB local
    return { ok: true, zones: [] }
  }

  async syncZone(zone: ZoneSyncPayload): Promise<ProviderResult> {
    const res = await dnsAgent.writeZone(zone)
    if (res.ok) await dnsAgent.reload()
    return { ok: res.ok, error: res.error }
  }

  async removeZone(domain: string): Promise<ProviderResult> {
    const res = await dnsAgent.removeZone(domain)
    if (res.ok) await dnsAgent.reload()
    return { ok: res.ok, error: res.error }
  }
}
