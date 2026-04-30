// Política de contraseña para el ADMIN del panel (frontera de auth principal).
// Operacionales (DB, mail, SSH) usan validaciones más laxas en sus propios endpoints.

const MIN_LEN = 12

// Lista mínima de muy comunes — no es exhaustiva ni pretende serlo, sólo evita
// los casos triviales más obvios. Para chequeo serio integrar HIBP (k-anonymity).
//
// Todas las entradas DEBEN cumplir las otras reglas (≥12 chars, ≥1 letra, ≥1
// dígito) o nunca llegan a este check. Variantes que no cumplen no aportan.
const COMMON = new Set([
  "password1234", "passwordpassword", "password123456",
  "qwerty123456", "qwertyuiop12", "qwertyuiop123",
  "1q2w3e4r5t6y", "1qaz2wsx3edc",
  "iloveyou1234", "letmein12345", "welcome12345",
  "tezcapanel12", "tezcapanel123", "tezcapanel2025", "tezcapanel2026",
  "admin12345678", "administrator1",
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
