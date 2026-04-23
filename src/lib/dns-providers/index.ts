import type { DnsProvider } from "@prisma/client"
import { decryptJson } from "@/lib/crypto"
import { BindProvider } from "./bind"
import { CloudflareProvider } from "./cloudflare"
import { StubProvider } from "./stub"
import { PROVIDER_META, type DnsProviderClient, type ProviderType } from "./types"

export { PROVIDER_META, maskAccount } from "./types"
export type { ProviderType, DnsProviderClient } from "./types"

export function getProviderClient(provider: DnsProvider | null | undefined): DnsProviderClient {
  if (!provider) return new BindProvider()

  const cfg = decryptJson<Record<string, string>>(provider.config)

  switch (provider.type as ProviderType) {
    case "bind":       return new BindProvider()
    case "cloudflare": return new CloudflareProvider(cfg.apiToken ?? "")
    case "route53":    return new StubProvider(PROVIDER_META.route53.label)
    case "godaddy":    return new StubProvider(PROVIDER_META.godaddy.label)
    case "namecheap":  return new StubProvider(PROVIDER_META.namecheap.label)
    case "namesilo":   return new StubProvider(PROVIDER_META.namesilo.label)
    case "porkbun":    return new StubProvider(PROVIDER_META.porkbun.label)
    default:           return new BindProvider()
  }
}

export async function ensureBuiltInProvider(prisma: typeof import("@/lib/prisma").prisma) {
  const existing = await prisma.dnsProvider.findFirst({ where: { isBuiltIn: true } })
  if (existing) return existing
  return prisma.dnsProvider.create({
    data: {
      type: "bind",
      alias: "Built-in DNS",
      account: null,
      config: "{}",
      status: true,
      permission: "global",
      isBuiltIn: true,
    },
  })
}
