import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { serverSecurityAgent } from "@/lib/server-security-agent"
import { sshAgent } from "@/lib/ssh-agent"
import { friendlyError } from "@/lib/agent-errors"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { action } = body

  let r: { ok: boolean; error?: string } = { ok: false, error: "Acción no soportada" }

  switch (action) {
    case "set-ssh-port":
      r = await sshAgent.updateConfig({ port: parseInt(body.port, 10) })
      break
    case "set-password-length":
      r = await serverSecurityAgent.setPasswordLength(parseInt(body.min, 10))
      break
    case "set-password-complexity":
      r = await serverSecurityAgent.setPasswordComplexity(parseInt(body.level, 10))
      break
    case "install-fail2ban":
      r = await serverSecurityAgent.installFail2ban()
      break
    case "fail2ban-toggle":
      r = await serverSecurityAgent.fail2banToggle(!!body.enabled)
      break
    case "set-root-login":
      r = await sshAgent.updateConfig({
        permitRoot: body.permitRoot,
        passwordAuth: body.passwordAuth,
      })
      break
    default:
      return NextResponse.json({ error: "Acción desconocida" }, { status: 400 })
  }

  if (!r.ok) return NextResponse.json({ error: friendlyError(r.error) }, { status: 500 })

  await prisma.auditLog.create({
    data: { userId: session.user.id, action: `server_security_${action}`, metadata: JSON.stringify(body) },
  })

  return NextResponse.json({ ok: true })
}
