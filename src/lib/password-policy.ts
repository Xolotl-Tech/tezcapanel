// Política de contraseña para el ADMIN del panel (frontera de auth principal).
// Operacionales (DB, mail, SSH) usan validaciones más laxas en sus propios endpoints.

const MIN_LEN = 12

// Lista mínima de muy comunes — no es exhaustiva ni pretende serlo, sólo evita
// los casos triviales más obvios. Para chequeo serio integrar HIBP (k-anonymity).
const COMMON = new Set([
  "password", "password1", "password123", "passw0rd", "qwerty", "qwerty123",
  "12345678", "123456789", "1234567890", "111111111", "11111111",
  "letmein", "welcome", "admin123", "administrator", "iloveyou",
  "abc123456", "tezcapanel", "tezcapanel1",
])

export interface PasswordCheck {
  ok: boolean
  error?: string
}

export function validatePanelPassword(pw: unknown): PasswordCheck {
  if (typeof pw !== "string") return { ok: false, error: "Contraseña requerida" }
  if (pw.length < MIN_LEN) return { ok: false, error: `Mínimo ${MIN_LEN} caracteres` }
  if (pw.length > 128) return { ok: false, error: "Máximo 128 caracteres" }
  if (!/[A-Za-z]/.test(pw)) return { ok: false, error: "Debe incluir al menos una letra" }
  if (!/\d/.test(pw)) return { ok: false, error: "Debe incluir al menos un dígito" }
  if (COMMON.has(pw.toLowerCase())) return { ok: false, error: "Contraseña demasiado común" }
  return { ok: true }
}

export const PANEL_PASSWORD_MIN_LEN = MIN_LEN
