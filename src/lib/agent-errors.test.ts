import { describe, expect, it } from "vitest"
import { friendlyError } from "./agent-errors"

describe("friendlyError", () => {
  it("returns default message for undefined", () =>
    expect(friendlyError(undefined)).toBe("Error desconocido"))

  it("returns default message for empty string", () =>
    expect(friendlyError("")).toBe("Error desconocido"))

  it("detects systemctl not found", () =>
    expect(friendlyError("bash: command not found: systemctl")).toMatch(/no usa systemctl/))

  it("detects EACCES", () =>
    expect(friendlyError("EACCES: permission denied, open '/etc/passwd'")).toMatch(/permisos/))

  it("detects 'permission denied' (case-insensitive)", () =>
    expect(friendlyError("Permission Denied")).toMatch(/permisos/))

  it("detects ENOENT", () =>
    expect(friendlyError("ENOENT: no such file or directory")).toMatch(/no encontrado/))

  it("detects Agent no disponible sentinel", () =>
    expect(friendlyError("Agent no disponible")).toBe("Agente no disponible"))

  it("passes unknown errors through unchanged", () => {
    const msg = "some completely unknown error"
    expect(friendlyError(msg)).toBe(msg)
  })
})
