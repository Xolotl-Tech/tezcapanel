import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { signTerminalToken, verifyTerminalToken } from "./agent-ws-token"

const SECRET = "test-secret-12345"
const ORIGINAL_AGENT_TOKEN = process.env.AGENT_TOKEN

describe("agent-ws-token", () => {
  beforeEach(() => {
    process.env.AGENT_TOKEN = SECRET
  })
  afterEach(() => {
    if (ORIGINAL_AGENT_TOKEN === undefined) delete process.env.AGENT_TOKEN
    else process.env.AGENT_TOKEN = ORIGINAL_AGENT_TOKEN
  })

  it("firma un token válido y lo verifica", () => {
    const token = signTerminalToken("user-123")
    const r = verifyTerminalToken(token, SECRET)
    expect(r.ok).toBe(true)
    expect(r.payload?.u).toBe("user-123")
    expect(r.payload?.s).toBe("term")
  })

  it("rechaza con firma inválida", () => {
    const token = signTerminalToken("user-123")
    const r = verifyTerminalToken(token, "wrong-secret")
    expect(r.ok).toBe(false)
    expect(r.reason).toBe("signature")
  })

  it("rechaza si se altera el payload", () => {
    const token = signTerminalToken("user-123")
    const [v, payload, sig] = token.split(".")
    // Cambiar el payload pero mantener la sig original
    const tamperedPayload = Buffer.from(JSON.stringify({
      s: "term", u: "attacker", e: Date.now() + 60000, j: "x",
    }), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    const tampered = `${v}.${tamperedPayload}.${sig}`
    const r = verifyTerminalToken(tampered, SECRET)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe("signature")
  })

  it("rechaza tokens con formato inválido", () => {
    expect(verifyTerminalToken("", SECRET).reason).toBe("format")
    expect(verifyTerminalToken("garbage", SECRET).reason).toBe("format")
    expect(verifyTerminalToken("v1.foo", SECRET).reason).toBe("format")
    expect(verifyTerminalToken("v2.foo.bar", SECRET).reason).toBe("format")
  })

  it("rechaza no-strings sin crashear", () => {
    expect(verifyTerminalToken(null as unknown as string, SECRET).ok).toBe(false)
    expect(verifyTerminalToken(undefined as unknown as string, SECRET).ok).toBe(false)
    expect(verifyTerminalToken(123 as unknown as string, SECRET).ok).toBe(false)
  })

  it("rechaza tokens expirados", () => {
    const token = signTerminalToken("user-123", -1) // ya expiró
    const r = verifyTerminalToken(token, SECRET)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe("expired")
  })

  it("genera jti único en cada firma", () => {
    const t1 = signTerminalToken("u")
    const t2 = signTerminalToken("u")
    const r1 = verifyTerminalToken(t1, SECRET)
    const r2 = verifyTerminalToken(t2, SECRET)
    expect(r1.payload?.j).not.toBe(r2.payload?.j)
  })

  it("falla si AGENT_TOKEN no está definido al firmar", () => {
    delete process.env.AGENT_TOKEN
    expect(() => signTerminalToken("u")).toThrow(/AGENT_TOKEN/)
  })

  it("usa timing-safe comparison (no leakea info por longitud)", () => {
    // No podemos medir timing en unit test, pero confirmamos que sigs de
    // longitud distinta también son rechazadas sin crashear.
    const token = signTerminalToken("u")
    const [v, p] = token.split(".")
    const shortSig = `${v}.${p}.AAAA`
    const r = verifyTerminalToken(shortSig, SECRET)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe("signature")
  })
})
