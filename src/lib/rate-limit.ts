// Rate limiter sencillo en memoria (sliding window de eventos discretos).
// Diseñado para single-process. Si en el futuro se escala horizontalmente,
// migrar a Redis o similar.

interface Bucket {
  hits: number[]
  blockedUntil?: number
}

const buckets = new Map<string, Bucket>()

export interface LimitConfig {
  windowMs: number
  max: number
  /** Tiempo de bloqueo tras superar el límite. Default = windowMs. */
  blockMs?: number
}

export interface LimitResult {
  ok: boolean
  retryAfterMs?: number
}

function prune(b: Bucket, now: number, windowMs: number) {
  if (b.hits.length === 0) return
  const cutoff = now - windowMs
  b.hits = b.hits.filter((t) => t >= cutoff)
}

/**
 * Registra un intento bajo `key` y devuelve si está permitido.
 * Si supera el umbral, bloquea por `blockMs`.
 */
export function check(key: string, cfg: LimitConfig): LimitResult {
  const now = Date.now()
  const blockMs = cfg.blockMs ?? cfg.windowMs
  let b = buckets.get(key)
  if (!b) {
    b = { hits: [] }
    buckets.set(key, b)
  }

  if (b.blockedUntil && b.blockedUntil > now) {
    return { ok: false, retryAfterMs: b.blockedUntil - now }
  }

  prune(b, now, cfg.windowMs)
  b.hits.push(now)

  if (b.hits.length > cfg.max) {
    b.blockedUntil = now + blockMs
    b.hits = []
    return { ok: false, retryAfterMs: blockMs }
  }
  return { ok: true }
}

/** Limpia el bucket — llamar en éxito (login válido) para no penalizar al usuario. */
export function reset(key: string) {
  buckets.delete(key)
}

/** Cleanup pasivo: cada N llamadas, purga buckets antiguos. */
let opsSincePurge = 0
const PURGE_EVERY = 500
export function maybeGc(maxAgeMs = 60 * 60 * 1000) {
  if (++opsSincePurge < PURGE_EVERY) return
  opsSincePurge = 0
  const cutoff = Date.now() - maxAgeMs
  for (const [k, b] of buckets) {
    if ((b.blockedUntil ?? 0) < Date.now() && (b.hits[b.hits.length - 1] ?? 0) < cutoff) {
      buckets.delete(k)
    }
  }
}

/**
 * Devuelve la IP del cliente confiando en `x-forwarded-for` SÓLO si
 * `TRUST_PROXY=true` (default). En despliegues sin proxy delante, el header
 * lo controla el atacante y permitiría rotar IPs para bypassear rate limits;
 * en ese caso devolvemos "direct" (todos los requests comparten bucket).
 *
 * Convención asumida: hay un proxy reverso (Nginx) que sobrescribe XFF con
 * la IP real. Si tu deploy lo *agrega* en lugar de sobrescribirlo, tomamos
 * el primer valor (el más a la izquierda) como cliente original.
 */
export function clientIp(headers: Record<string, string | string[] | undefined> | Headers): string {
  const trust = (process.env.TRUST_PROXY ?? "true").toLowerCase() !== "false"
  if (!trust) return "direct"

  const get = (k: string): string => {
    if (headers instanceof Headers) return headers.get(k) ?? ""
    const v = headers[k]
    return Array.isArray(v) ? v[0] ?? "" : v ?? ""
  }
  const xff = get("x-forwarded-for")
  if (xff) {
    const first = xff.split(",")[0].trim()
    // Validación mínima: rechazar valores absurdos para evitar buckets corruptos.
    if (/^[0-9a-f.:]+$/i.test(first) && first.length <= 45) return first
    return "invalid"
  }
  const real = get("x-real-ip").trim()
  if (real && /^[0-9a-f.:]+$/i.test(real) && real.length <= 45) return real
  return "unknown"
}
