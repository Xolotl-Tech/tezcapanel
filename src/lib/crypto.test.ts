import { beforeAll, describe, expect, it } from "vitest"
import { decrypt, decryptJson, encrypt, encryptJson, encryptOptional, isEncrypted } from "./crypto"

beforeAll(() => {
  process.env.CRYPTO_SECRET = "test-secret-for-unit-tests-only"
})

describe("isEncrypted", () => {
  it("returns true for enc:v1: prefix", () => expect(isEncrypted("enc:v1:abc")).toBe(true))
  it("returns false for plain strings", () => expect(isEncrypted("plaintext")).toBe(false))
  it("returns false for null", () => expect(isEncrypted(null)).toBe(false))
  it("returns false for numbers", () => expect(isEncrypted(42)).toBe(false))
})

describe("encrypt", () => {
  it("returns empty string unchanged", () => expect(encrypt("")).toBe(""))
  it("produces enc:v1: prefixed output", () => expect(encrypt("hello")).toMatch(/^enc:v1:/))
  it("is idempotent — double-encrypting is a no-op", () => {
    const once = encrypt("hello")
    expect(encrypt(once)).toBe(once)
  })
  it("uses a random IV — same input produces different ciphertext", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"))
  })
})

describe("decrypt", () => {
  it("round-trips a plaintext string", () => {
    const plain = "super-secret-password-123!"
    expect(decrypt(encrypt(plain))).toBe(plain)
  })
  it("returns empty string for null", () => expect(decrypt(null)).toBe(""))
  it("returns empty string for undefined", () => expect(decrypt(undefined)).toBe(""))
  it("returns value as-is for non-encrypted strings (backwards compat)", () => {
    expect(decrypt("legacy-plaintext")).toBe("legacy-plaintext")
  })
})

describe("encryptOptional", () => {
  it("returns null for null", () => expect(encryptOptional(null)).toBeNull())
  it("returns null for undefined", () => expect(encryptOptional(undefined)).toBeNull())
  it("returns null for empty string", () => expect(encryptOptional("")).toBeNull())
  it("encrypts a non-empty string", () => expect(isEncrypted(encryptOptional("value")!)).toBe(true))
})

describe("encryptJson / decryptJson", () => {
  it("round-trips a plain object", () => {
    const obj = { host: "example.com", port: 22, active: true }
    expect(decryptJson(encryptJson(obj))).toEqual(obj)
  })
  it("round-trips a nested object", () => {
    const obj = { a: { b: [1, 2, 3] } }
    expect(decryptJson(encryptJson(obj))).toEqual(obj)
  })
  it("decryptJson returns {} for null", () => expect(decryptJson(null)).toEqual({}))
  it("decryptJson returns {} for undefined", () => expect(decryptJson(undefined)).toEqual({}))
})
