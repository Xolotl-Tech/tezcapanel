import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { spawn } from "node:child_process"
import { check as rlCheck, clientIp } from "@/lib/rate-limit"
import type { NextRequest } from "next/server"

// Endpoint para disparar `tezcapanel update` desde la UI sin que el admin
// abra terminal. El comando reinstala deps y reinicia tezcapanel y
// tezcaagent. El reinicio del panel mata esta misma request, así que el
// trabajo NO puede ser un hijo de tezcapanel.service — sería matado con el
// servicio. Usamos `systemd-run --unit=tezcapanel-update` para crear una
// unidad transitoria independiente del cgroup del panel; sobrevive al
// restart y queda accesible vía journalctl/systemctl.
//
// El propio nombre del unit funciona como lock: `systemd-run` falla si ya
// existe un unit con ese nombre activo, así que no hay race entre dos
// admins clickeando "Actualizar" al mismo tiempo.

const UNIT_NAME = "tezcapanel-update"

function spawnUpdate(): Promise<{ ok: true } | { ok: false; reason: string }> {
  return new Promise((resolve) => {
    // --collect remueve el unit cuando termina (sin basura en list-units).
    // --no-block devuelve inmediatamente sin esperar a que termine.
    const child = spawn(
      "systemd-run",
      [
        "--unit=" + UNIT_NAME,
        "--collect",
        "--no-block",
        "/usr/local/bin/tezcapanel",
        "update",
      ],
      { stdio: "ignore", detached: true }
    )
    let resolved = false
    child.on("error", (err) => {
      if (!resolved) { resolved = true; resolve({ ok: false, reason: err.message }) }
    })
    child.on("spawn", () => {
      child.unref()
      if (!resolved) { resolved = true; resolve({ ok: true }) }
    })
    // Si systemd-run falla con exit > 0 (unit duplicado), capturamos el código.
    child.on("exit", (code) => {
      if (!resolved && code !== 0) {
        resolved = true
        resolve({ ok: false, reason: `systemd-run exited with code ${code}` })
      }
    })
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const ip = clientIp(req.headers)
  const rl = rlCheck(`system-update:${ip}`, { windowMs: 60_000, max: 3 })
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
      { status: 429 }
    )
  }

  const result = await spawnUpdate()
  if (!result.ok) {
    return NextResponse.json(
      { error: "spawn_failed", detail: result.reason },
      { status: 500 }
    )
  }

  return NextResponse.json(
    { ok: true, unit: UNIT_NAME, message: "Actualización iniciada" },
    { status: 202 }
  )
}
