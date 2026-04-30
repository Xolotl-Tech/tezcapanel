import { describe, it, expect } from "vitest"
import { validatePanelPassword, PANEL_PASSWORD_MIN_LEN } from "./password-policy"

describe("validatePanelPassword", () => {
  it("rechaza no-strings", () => {
    expect(validatePanelPassword(undefined).ok).toBe(false)
    expect(validatePanelPassword(null).ok).toBe(false)
    expect(validatePanelPassword(123).ok).toBe(false)
    expect(validatePanelPassword({}).ok).toBe(false)
  })

  it("rechaza menos de 12 chars", () => {
    expect(validatePanelPassword("Abc123def").ok).toBe(false)
    expect(validatePanelPassword("Abc1").ok).toBe(false)
    expect(validatePanelPassword("").ok).toBe(false)
  })

  it("rechaza más de 128 chars", () => {
    const tooLong = "Aa1" + "x".repeat(126)
    expect(validatePanelPassword(tooLong).ok).toBe(false)
  })

  it("rechaza si no contiene letra", () => {
    expect(validatePanelPassword("123456789012").ok).toBe(false)
  })

  it("rechaza si no contiene dígito", () => {
    expect(validatePanelPassword("abcdefghijkl").ok).toBe(false)
  })

  it("rechaza contraseñas comunes (case-insensitive)", () => {
    expect(validatePanelPassword("password1234").ok).toBe(false)
    expect(validatePanelPassword("PASSWORD1234").ok).toBe(false)
    expect(validatePanelPassword("Tezcapanel123").ok).toBe(false)
    expect(validatePanelPassword("qwertyuiop12").ok).toBe(false)
  })

  it("acepta variantes no triviales que no están en la lista", () => {
    expect(validatePanelPassword("Pass2026word!a").ok).toBe(true)
    expect(validatePanelPassword("MyTezca-2026").ok).toBe(true)
  })

  it("acepta una contraseña válida en el mínimo exacto", () => {
    const minPw = "abcdefghij12" // 12 chars, letras + dígitos
    expect(minPw.length).toBe(PANEL_PASSWORD_MIN_LEN)
    expect(validatePanelPassword(minPw).ok).toBe(true)
  })

  it("acepta passwords largas con mezcla", () => {
    expect(validatePanelPassword("Tezca-Panel-2026-x9k!").ok).toBe(true)
  })

  it("devuelve error message sólo cuando ok=false", () => {
    const bad = validatePanelPassword("short")
    expect(bad.ok).toBe(false)
    expect(typeof bad.error).toBe("string")
    expect(bad.error!.length).toBeGreaterThan(0)

    const good = validatePanelPassword("validPass123ok")
    expect(good.ok).toBe(true)
    expect(good.error).toBeUndefined()
  })
})
