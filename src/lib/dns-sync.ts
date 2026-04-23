import { prisma } from "@/lib/prisma"
import { getProviderClient } from "@/lib/dns-providers"

export async function syncZone(zoneId: string) {
  const zone = await prisma.dnsZone.findUnique({
    where: { id: zoneId },
    include: {
      provider: true,
      records: { where: { active: true } },
    },
  })
  if (!zone) return { ok: false, error: "Zona no encontrada" }

  const newSerial = Math.max(zone.serial + 1, Math.floor(Date.now() / 1000))
  await prisma.dnsZone.update({ where: { id: zoneId }, data: { serial: newSerial } })

  const client = getProviderClient(zone.provider)
  return client.syncZone({
    domain: zone.domain,
    primaryNs: zone.primaryNs,
    adminEmail: zone.adminEmail,
    serial: newSerial,
    refresh: zone.refresh,
    retry: zone.retry,
    expire: zone.expire,
    minimum: zone.minimum,
    defaultTtl: zone.defaultTtl,
    records: zone.records.map((r) => ({
      type: r.type,
      name: r.name,
      value: r.value,
      ttl: r.ttl,
      priority: r.priority,
    })),
  })
}
