const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:7070"
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ""

interface AgentResult {
  ok: boolean
  error?: string
}

async function call(body: Record<string, unknown>): Promise<AgentResult> {
  try {
    const res = await fetch(`${AGENT_URL}/server-security/action`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AGENT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    })
    return await res.json()
  } catch {
    return { ok: false, error: "Agent no disponible" }
  }
}

export const serverSecurityAgent = {
  setPasswordLength: (min: number) => call({ action: "set-password-length", min }),
  setPasswordComplexity: (level: number) => call({ action: "set-password-complexity", level }),
  installFail2ban: () => call({ action: "install-fail2ban" }),
  fail2banToggle: (enabled: boolean) => call({ action: "fail2ban-toggle", enabled }),
}
