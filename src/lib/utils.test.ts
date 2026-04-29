import { describe, expect, it } from "vitest"
import { formatBytes, formatUptime, safeJson } from "./utils"

describe("formatBytes", () => {
  it("handles 0", () => expect(formatBytes(0)).toBe("0 Bytes"))
  it("formats bytes", () => expect(formatBytes(512)).toBe("512 Bytes"))
  it("formats KB", () => expect(formatBytes(1024)).toBe("1 KB"))
  it("formats MB", () => expect(formatBytes(1024 * 1024)).toBe("1 MB"))
  it("formats GB", () => expect(formatBytes(1024 ** 3)).toBe("1 GB"))
  it("respects decimals param", () => expect(formatBytes(1536, 1)).toBe("1.5 KB"))
  it("defaults to 2 decimal places", () => expect(formatBytes(1536)).toBe("1.5 KB"))
})

describe("formatUptime", () => {
  it("shows only minutes under one hour", () => expect(formatUptime(300)).toBe("5m"))
  it("shows 0m at zero seconds", () => expect(formatUptime(0)).toBe("0m"))
  it("shows hours and minutes", () => expect(formatUptime(3900)).toBe("1h 5m"))
  it("shows days, hours, minutes", () => expect(formatUptime(90060)).toBe("1d 1h 1m"))
  it("shows multiple days", () => expect(formatUptime(3 * 86400)).toBe("3d 0h 0m"))
})

describe("safeJson", () => {
  const makeResponse = (body: string, status = 200) =>
    new Response(body, { status, headers: { "Content-Type": "application/json" } })

  it("parses valid JSON", async () => {
    const res = makeResponse('{"ok":true}')
    expect(await safeJson(res)).toEqual({ ok: true })
  })
  it("returns {} for empty body", async () => {
    const res = makeResponse("")
    expect(await safeJson(res)).toEqual({})
  })
  it("returns {} for malformed JSON", async () => {
    const res = makeResponse("not-json")
    expect(await safeJson(res)).toEqual({})
  })
})
