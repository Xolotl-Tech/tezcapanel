import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import pkg from "../../../../../../package.json"

const exec = promisify(execFile)

const UNIT_NAME = "tezcapanel-update"

interface UpdateStatus {
  state: "idle" | "running" | "success" | "failed"
  installedVersion: string
  // Últimas líneas del journal del unit (si existe).
  log: string[]
  // exitCode null si todavía no terminó.
  exitCode: number | null
}

async function runQuiet(cmd: string, args: string[]): Promise<{ stdout: string; code: number }> {
  try {
    const { stdout } = await exec(cmd, args, { timeout: 5000 })
    return { stdout: stdout.toString(), code: 0 }
  } catch (e) {
    const err = e as { stdout?: string | Buffer; code?: number }
    return {
      stdout: err.stdout ? err.stdout.toString() : "",
      code: typeof err.code === "number" ? err.code : 1,
    }
  }
}

async function getUnitState(): Promise<{ active: boolean; result: string | null; exitCode: number | null }> {
  // `systemctl show` devuelve key=value lines; lo parseamos.
  const { stdout } = await runQuiet("systemctl", [
    "show",
    UNIT_NAME,
    "--property=ActiveState,Result,ExecMainStatus,LoadState",
    "--no-pager",
  ])
  const props: Record<string, string> = {}
  for (const line of stdout.split("\n")) {
    const i = line.indexOf("=")
    if (i > 0) props[line.slice(0, i)] = line.slice(i + 1).trim()
  }
  // Si LoadState=not-found, el unit nunca existió o ya fue --collect-eado.
  if (props.LoadState === "not-found") {
    return { active: false, result: null, exitCode: null }
  }
  const active = props.ActiveState === "active" || props.ActiveState === "activating"
  const exitRaw = parseInt(props.ExecMainStatus ?? "", 10)
  const exitCode = Number.isFinite(exitRaw) ? exitRaw : null
  return { active, result: props.Result || null, exitCode }
}

async function getRecentLog(): Promise<string[]> {
  const { stdout } = await runQuiet("journalctl", [
    "-u",
    UNIT_NAME,
    "-n",
    "50",
    "--no-pager",
    "--output=cat",
  ])
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(-50)
}

export async function GET(): Promise<NextResponse<UpdateStatus | { error: string }>> {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const installedVersion = pkg.version
  const [unit, log] = await Promise.all([getUnitState(), getRecentLog()])

  let state: UpdateStatus["state"]
  if (unit.active) {
    state = "running"
  } else if (unit.result === "success") {
    state = "success"
  } else if (unit.result && unit.result !== "success") {
    state = "failed"
  } else {
    // Sin unit activo y sin resultado: o nunca corrió, o ya fue limpiado por
    // --collect tras éxito (el caso más común post-update). Si hay log,
    // asumimos success (porque --collect sólo limpia tras success).
    state = log.length > 0 ? "success" : "idle"
  }

  return NextResponse.json({
    state,
    installedVersion,
    log,
    exitCode: unit.exitCode,
  })
}
