export type ProviderType =
  | "bind"
  | "cloudflare"
  | "route53"
  | "godaddy"
  | "namecheap"
  | "namesilo"
  | "porkbun"

export interface ProviderResult {
  ok: boolean
  error?: string
  data?: unknown
}

export interface RemoteZone {
  id: string
  domain: string
}

export interface ZoneSyncPayload {
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

export interface DnsProviderClient {
  test(): Promise<ProviderResult>
  listZones(): Promise<ProviderResult & { zones?: RemoteZone[] }>
  syncZone(zone: ZoneSyncPayload): Promise<ProviderResult>
  removeZone(domain: string): Promise<ProviderResult>
}

export const PROVIDER_META: Record<ProviderType, {
  label: string
  brand: string
  fields: Array<{ key: string; label: string; secret?: boolean; placeholder?: string }>
  accountField?: string
  implemented: boolean
}> = {
  bind: {
    label:  "Built-in DNS (BIND9)",
    brand:  "TezcapanelDns",
    fields: [],
    implemented: true,
  },
  cloudflare: {
    label:  "CloudFlareDns",
    brand:  "CloudFlareDns",
    fields: [
      { key: "apiToken", label: "API Token", secret: true, placeholder: "Cloudflare API Token con permisos Zone:Edit" },
      { key: "accountEmail", label: "Email (opcional)", placeholder: "tu@correo.com" },
    ],
    accountField: "accountEmail",
    implemented: true,
  },
  route53: {
    label:  "AmazonRoute53Dns",
    brand:  "AmazonRoute53Dns",
    fields: [
      { key: "accessKeyId", label: "AccessKeyId", placeholder: "AKIA…" },
      { key: "secretAccessKey", label: "SecretAccessKey", secret: true },
      { key: "region", label: "Region", placeholder: "us-east-1" },
    ],
    accountField: "accessKeyId",
    implemented: false,
  },
  godaddy: {
    label:  "GodaddyDns",
    brand:  "GodaddyDns",
    fields: [
      { key: "apiKey", label: "API Key" },
      { key: "apiSecret", label: "API Secret", secret: true },
    ],
    accountField: "apiKey",
    implemented: false,
  },
  namecheap: {
    label:  "NameCheapDns",
    brand:  "NameCheapDns",
    fields: [
      { key: "apiUser", label: "ApiUser" },
      { key: "apiKey", label: "ApiKey", secret: true },
      { key: "clientIp", label: "ClientIp" },
    ],
    accountField: "apiUser",
    implemented: false,
  },
  namesilo: {
    label:  "NameSiloDns",
    brand:  "NameSiloDns",
    fields: [
      { key: "apiKey", label: "ApiKey", secret: true },
    ],
    accountField: "apiKey",
    implemented: false,
  },
  porkbun: {
    label:  "PorkBunDns",
    brand:  "PorkBunDns",
    fields: [
      { key: "apiKey", label: "ApiKey" },
      { key: "secretKey", label: "SecretKey", secret: true },
    ],
    accountField: "apiKey",
    implemented: false,
  },
}

export function maskAccount(value: string | null | undefined) {
  if (!value) return "—"
  if (value.length <= 4) return "***"
  return `${value.slice(0, 4)}***`
}
