import { createHmac, randomBytes, timingSafeEqual } from "crypto"

// Token efímero firmado para handshake del WebSocket del agente.
// Formato: v1.<base64url(payload)>.<base64url(sig)>
// payload = { s: "term", u: <userId>, e: <expMs>, j: <jti> }
// sig     = HMAC-SHA256(payload, AGENT_TOKEN)
//
// El secreto compartido es el AGENT_TOKEN (que ya conocen panel y agente),
// pero NUNCA viaja al navegador: sólo se usa para firmar/verificar.

const SCOPE = "term"
const VERSION = "v1"
const DEFAULT_TTL_MS = 60_000

interface Payload {
  s: string
  u: string
  e: number
  j: string
}

function getSecret(): string {
  const t = process.env.AGENT_TOKEN
  if (!t) throw new Error("AGENT_TOKEN no definido")
  return t
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64")
}

export function signTerminalToken(userId: string, ttlMs = DEFAULT_TTL_MS): string {
  const payload: Payload = {
    s: SCOPE,
    u: userId,
    e: Date.now() + ttlMs,
    j: randomBytes(12).toString("hex"),
  }
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"))
  const sig = createHmac("sha256", getSecret()).update(payloadB64).digest()
  return `${VERSION}.${payloadB64}.${b64url(sig)}`
}

export interface VerifiedToken {
  ok: boolean
  reason?: "format" | "signature" | "expired" | "scope"
  payload?: Payload
}

export function verifyTerminalToken(token: string, secret: string): VerifiedToken {
  if (typeof token !== "string") return { ok: false, reason: "format" }
  const parts = token.split(".")
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false, reason: "format" }
  const [, payloadB64, sigB64] = parts

  const expected = createHmac("sha256", secret).update(payloadB64).digest()
  let provided: Buffer
  try { provided = b64urlDecode(sigB64) } catch { return { ok: false, reason: "format" } }
  if (provided.length !== expected.length) return { ok: false, reason: "signature" }
  if (!timingSafeEqual(provided, expected)) return { ok: false, reason: "signature" }

  let payload: Payload
  try { payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8")) } catch { return { ok: false, reason: "format" } }
  if (payload.s !== SCOPE) return { ok: false, reason: "scope" }
  if (typeof payload.e !== "number" || payload.e < Date.now()) return { ok: false, reason: "expired" }
  return { ok: true, payload }
}
