import { PrismaClient } from "@prisma/client"
import { encrypt, encryptJson, isEncrypted, decryptJson } from "../src/lib/crypto"

const prisma = new PrismaClient()

/**
 * Migra secretos en texto plano a AES-256-GCM.
 * Idempotente: si un valor ya empieza con "enc:v1:" lo deja intacto.
 * Requiere CRYPTO_SECRET (o NEXTAUTH_SECRET) definido en el entorno.
 */
async function main() {
  let total = 0

  // ── NotificationPreferences ───────────────────────────────────
  const prefs = await prisma.notificationPreferences.findMany()
  for (const p of prefs) {
    const patch: Record<string, string | null> = {}
    const fields = ["telegramBotToken", "twilioAccountSid", "twilioAuthToken", "sendgridApiKey"] as const
    for (const f of fields) {
      const v = p[f]
      if (v && !isEncrypted(v)) patch[f] = encrypt(v)
    }
    if (Object.keys(patch).length) {
      await prisma.notificationPreferences.update({ where: { id: p.id }, data: patch })
      total++
      console.log(`  · NotificationPreferences ${p.id}: ${Object.keys(patch).join(", ")}`)
    }
  }

  // ── MailAccount.password ──────────────────────────────────────
  const accounts = await prisma.mailAccount.findMany()
  for (const a of accounts) {
    if (a.password && !isEncrypted(a.password)) {
      await prisma.mailAccount.update({ where: { id: a.id }, data: { password: encrypt(a.password) } })
      total++
      console.log(`  · MailAccount ${a.email}`)
    }
  }

  // ── DnsProvider.config ────────────────────────────────────────
  const providers = await prisma.dnsProvider.findMany()
  for (const prov of providers) {
    if (prov.config && !isEncrypted(prov.config)) {
      // Convertir JSON-texto-plano a JSON-cifrado (conserva el contenido)
      const obj = decryptJson<Record<string, unknown>>(prov.config)
      await prisma.dnsProvider.update({ where: { id: prov.id }, data: { config: encryptJson(obj) } })
      total++
      console.log(`  · DnsProvider ${prov.alias}`)
    }
  }

  // ── NotificationChannel.config (por si se llega a usar) ──────
  const channels = await prisma.notificationChannel.findMany()
  for (const c of channels) {
    if (c.config && !isEncrypted(c.config)) {
      const obj = decryptJson<Record<string, unknown>>(c.config)
      await prisma.notificationChannel.update({ where: { id: c.id }, data: { config: encryptJson(obj) } })
      total++
      console.log(`  · NotificationChannel ${c.name}`)
    }
  }

  console.log(`\n✔ Migración completada: ${total} registro(s) cifrado(s)`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
