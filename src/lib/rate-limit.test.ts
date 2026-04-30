import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { check, reset, clientIp } from "./rate-limit"

describe("check (sliding window)", () => {
  beforeEach(() => {
    // namespacing: cada test usa su propia key para no contaminar el Map global
  })

  it("permite hasta max intentos en la ventana", () => {
    const key = `t1-${Math.random()}`
    const cfg = { windowMs: 1000, max: 3 }
    expect(check(key, cfg).ok).toBe(true)
    expect(check(key, cfg).ok).toBe(true)
    expect(check(key, cfg).ok).toBe(true)
    expect(check(key, cfg).ok).toBe(false)
  })

  it("bloquea por blockMs después de exceder", () => {
    const key = `t2-${Math.random()}`
    const cfg = { windowMs: 100, max: 1, blockMs: 5000 }
    expect(check(key, cfg).ok).toBe(true)
    const blocked = check(key, cfg)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfterMs).toBeGreaterThan(0)
    expect(blocked.retryAfterMs!).toBeLessThanOrEqual(5000)
  })

  it("reset libera el bucket", () => {
    const key = `t3-${Math.random()}`
    const cfg = { windowMs: 1000, max: 1 }
    check(key, cfg)
    expect(check(key, cfg).ok).toBe(false)
    reset(key)
    expect(check(key, cfg).ok).toBe(true)
  })

  it("ventana se desliza con el tiempo (purga eventos viejos)", () => {
    vi.useFakeTimers()
    try {
      const key = `t4-${Math.random()}`
      const cfg = { windowMs: 1000, max: 2 }
      expect(check(key, cfg).ok).toBe(true)
      expect(check(key, cfg).ok).toBe(true)
      vi.advanceTimersByTime(1100) // pasa la ventana
      expect(check(key, cfg).ok).toBe(true) // los viejos ya no cuentan
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("clientIp", () => {
  const ORIGINAL_TRUST = process.env.TRUST_PROXY
  afterEach(() => {
    if (ORIGINAL_TRUST === undefined) delete process.env.TRUST_PROXY
    else process.env.TRUST_PROXY = ORIGINAL_TRUST
  })

  it("retorna 'direct' si TRUST_PROXY=false", () => {
    process.env.TRUST_PROXY = "false"
    const h = new Headers({ "x-forwarded-for": "1.2.3.4" })
    expect(clientIp(h)).toBe("direct")
  })

  it("usa primer XFF cuando TRUST_PROXY=true", () => {
    process.env.TRUST_PROXY = "true"
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" })
    expect(clientIp(h)).toBe("1.2.3.4")
  })

  it("default es trust=true", () => {
    delete process.env.TRUST_PROXY
    const h = new Headers({ "x-forwarded-for": "1.2.3.4" })
    expect(clientIp(h)).toBe("1.2.3.4")
  })

  it("rechaza XFF con caracteres inválidos", () => {
    process.env.TRUST_PROXY = "true"
    const h = new Headers({ "x-forwarded-for": "rm -rf /" })
    expect(clientIp(h)).toBe("invalid")
  })

  it("rechaza XFF excesivamente largos", () => {
    process.env.TRUST_PROXY = "true"
    const h = new Headers({ "x-forwarded-for": "1".repeat(100) })
    expect(clientIp(h)).toBe("invalid")
  })

  it("usa x-real-ip como fallback cuando no hay XFF", () => {
    process.env.TRUST_PROXY = "true"
    const h = new Headers({ "x-real-ip": "10.0.0.1" })
    expect(clientIp(h)).toBe("10.0.0.1")
  })

  it("retorna 'unknown' si no hay headers", () => {
    process.env.TRUST_PROXY = "true"
    expect(clientIp(new Headers())).toBe("unknown")
  })

  it("acepta plain object como headers", () => {
    process.env.TRUST_PROXY = "true"
    expect(clientIp({ "x-forwarded-for": "8.8.8.8" })).toBe("8.8.8.8")
  })

  it("acepta IPv6", () => {
    process.env.TRUST_PROXY = "true"
    const h = new Headers({ "x-forwarded-for": "2001:db8::1" })
    expect(clientIp(h)).toBe("2001:db8::1")
  })
})
