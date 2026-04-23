import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"

// Formato del payload cifrado: enc:v1:<base64(iv|ciphertext|tag)>
const PREFIX = "enc:v1:"
const IV_LEN  = 12 // AES-GCM recomienda 12 bytes
const TAG_LEN = 16

function getKey(): Buffer {
  const raw = process.env.CRYPTO_SECRET || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
  if (!raw) {
    throw new Error(
      "CRYPTO_SECRET (o NEXTAUTH_SECRET) no está definido. Define uno en .env para poder cifrar secretos."
    )
  }
  // Derivar clave de 32 bytes con SHA-256 — determinista para el mismo secret
  return createHash("sha256").update(raw, "utf8").digest()
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX)
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext
  if (isEncrypted(plaintext)) return plaintext // idempotente

  const iv     = randomBytes(IV_LEN)
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv)
  const ct     = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag    = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, ct, tag]).toString("base64")
}

/**
 * Descifra un valor. Si el valor no tiene el prefijo, lo devuelve tal cual
 * (compatibilidad hacia atrás con datos en texto plano que aún no se han migrado).
 */
export function decrypt(value: string | null | undefined): string {
  if (!value) return ""
  if (!isEncrypted(value)) return value

  const buf = Buffer.from(value.slice(PREFIX.length), "base64")
  const iv  = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(buf.length - TAG_LEN)
  const ct  = buf.subarray(IV_LEN, buf.length - TAG_LEN)

  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return pt.toString("utf8")
}

/** Encripta sólo si el valor existe y tiene contenido. */
export function encryptOptional(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null
  return encrypt(value)
}

/** Encripta un objeto serializándolo a JSON primero. */
export function encryptJson(obj: unknown): string {
  return encrypt(JSON.stringify(obj))
}

/** Descifra y parsea JSON. Devuelve `{}` si está vacío o falla. */
export function decryptJson<T = Record<string, unknown>>(value: string | null | undefined): T {
  const raw = decrypt(value)
  if (!raw) return {} as T
  try { return JSON.parse(raw) as T } catch { return {} as T }
}
