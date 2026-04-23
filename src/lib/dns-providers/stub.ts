import type { DnsProviderClient, ProviderResult } from "./types"

export class StubProvider implements DnsProviderClient {
  constructor(private label: string) {}

  async test(): Promise<ProviderResult> {
    return { ok: false, error: `${this.label} aún no está implementado — solo guarda credenciales` }
  }
  async listZones() { return this.test() }
  async syncZone()  { return this.test() }
  async removeZone() { return this.test() }
}
