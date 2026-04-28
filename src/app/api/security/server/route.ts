import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sshAgent } from "@/lib/ssh-agent"

const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:7070"
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ""

async function serverCheck() {
  try {
    const res = await fetch(`${AGENT_URL}/server-security/check`, {
      headers: { Authorization: `Bearer ${AGENT_TOKEN}` },
      signal: AbortSignal.timeout(10000),
    })
    return await res.json()
  } catch {
    return { ok: false }
  }
}

async function getPanelSettings() {
  return prisma.panelSecuritySettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  })
}

export async function GET() {
  try {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [check, logs, panelLogins, panelSettings] = await Promise.all([
    serverCheck(),
    sshAgent.logs(200),
    prisma.auditLog.findMany({
      where: { action: "panel_login" },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    getPanelSettings(),
  ])

  const sshEntries = logs.entries ?? []

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7)

  const countInRange = (status: "success" | "failure", from: Date, to: Date) =>
    sshEntries.filter((e: { status: string; timestamp: string | null }) => {
      if (e.status !== status || !e.timestamp) return false
      const t = new Date(e.timestamp)
      return t >= from && t < to
    }).length

  const stats = {
    today: { success: logs.successToday ?? 0, failure: logs.failureToday ?? 0 },
    yesterday: {
      success: countInRange("success", yesterday, today),
      failure: countInRange("failure", yesterday, today),
    },
    week: {
      success: countInRange("success", weekAgo, new Date()),
      failure: countInRange("failure", weekAgo, new Date()),
    },
    totalSuccess: logs.success ?? 0,
    totalFailure: logs.failure ?? 0,
  }

  const checks = [
    {
      id: "ssh-port",
      label: "Puerto SSH por defecto",
      description: "Cambia el puerto SSH por defecto para mejorar la seguridad",
      ok: check.ok && check.sshPort !== 22,
      value: check.sshPort,
    },
    {
      id: "pwd-complexity",
      label: "Política de complejidad de contraseña",
      description: "Habilita verificación de complejidad de contraseñas",
      ok: !!check.pamComplexity,
    },
    {
      id: "pwd-length",
      label: "Longitud mínima de contraseña",
      description: "Establece longitud mínima requerida (≥ 8)",
      ok: (check.passMinLen ?? 0) >= 8,
      value: check.passMinLen,
    },
    {
      id: "ssh-login-alert",
      label: "Alerta de login SSH",
      description: "Envía notificación al detectar un login SSH",
      ok: panelSettings.alertOnSshLogin,
    },
    {
      id: "root-login",
      label: "Login de root",
      description: "Se recomienda permitir solo login por llave",
      ok: check.ok && ["prohibit-password", "no", "forced-commands-only"].includes(check.permitRoot),
      value: check.permitRoot,
    },
    {
      id: "ssh-bruteforce",
      label: "Protección SSH brute-force",
      description: "Previene ataques de fuerza bruta (fail2ban)",
      ok: !!check.fail2banActive,
    },
    {
      id: "panel-login-alert",
      label: "Alerta de login al panel",
      description: "Envía notificación al detectar login al panel",
      ok: panelSettings.alertOnPanelLogin,
    },
    {
      id: "panel-totp",
      label: "Google Authenticator",
      description: "Habilita TOTP para login al panel",
      ok: panelSettings.totpEnabled,
    },
    {
      id: "unauth-code",
      label: "Código de respuesta no autorizado",
      description: "Código HTTP para acceso no autenticado",
      ok: panelSettings.unauthStatusCode === 404,
      value: panelSettings.unauthStatusCode,
    },
    {
      id: "panel-ssl",
      label: "Panel con SSL",
      description: "Habilita HTTPS para transmisión cifrada",
      ok: panelSettings.sslEnabled,
    },
  ]

  const rating = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100)
  const lastSsh = sshEntries.find((e: { status: string }) => e.status === "success") ?? null

  const panelLoginUserIds = Array.from(new Set(panelLogins.map((p) => p.userId)))
  const users = panelLoginUserIds.length
    ? await prisma.user.findMany({ where: { id: { in: panelLoginUserIds } }, select: { id: true, email: true, name: true } })
    : []
  const userMap = new Map(users.map((u) => [u.id, u]))

  return NextResponse.json({
    agentAvailable: check.ok,
    agentCheck: {
      sshPort: check.sshPort ?? null,
      passMinLen: check.passMinLen ?? null,
      pamComplexity: !!check.pamComplexity,
      fail2banActive: !!check.fail2banActive,
      fail2banInstalled: !!check.fail2banInstalled,
      permitRoot: check.permitRoot ?? null,
    },
    panelSettings,
    stats,
    lastSsh,
    lastPanel: panelLogins[0] ? {
      ...panelLogins[0],
      meta: safeParse(panelLogins[0].metadata),
      user: userMap.get(panelLogins[0].userId) ?? null,
    } : null,
    checks,
    rating,
    sshRecent: sshEntries.filter((e: { status: string }) => e.status === "success").slice(0, 5),
    panelRecent: panelLogins.map((p) => ({
      ...p,
      meta: safeParse(p.metadata),
      user: userMap.get(p.userId) ?? null,
    })),
  })
  } catch (err) {
    console.error("[api/security/server GET]", err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Error interno",
      stack: process.env.NODE_ENV === "development" && err instanceof Error ? err.stack : undefined,
    }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  const allowed = ["alertOnSshLogin", "alertOnPanelLogin", "totpEnabled", "unauthStatusCode", "sslEnabled"] as const
  const data: Record<string, unknown> = {}
  for (const k of allowed) if (k in body) data[k] = body[k]

  const updated = await prisma.panelSecuritySettings.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  })

  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "update_panel_security", metadata: JSON.stringify(data) },
  })
  return NextResponse.json(updated)
}

function safeParse(s: string | null) {
  if (!s) return {}
  try { return JSON.parse(s) } catch { return {} }
}
