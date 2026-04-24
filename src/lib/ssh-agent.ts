const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:7070"
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ""

export interface SshConfig {
  port: number
  passwordAuth: boolean
  pubkeyAuth: boolean
  permitRoot: "yes" | "no" | "prohibit-password" | "forced-commands-only"
}

export interface SshLogEntry {
  status: "success" | "failure"
  method: string
  user: string
  ip: string
  port: string
  timestamp: string | null
}

interface AgentResult {
  ok: boolean
  error?: string
  running?: boolean
  config?: SshConfig
  keys?: string
  entries?: SshLogEntry[]
  success?: number
  failure?: number
  successToday?: number
  failureToday?: number
}

async function call(body: Record<string, unknown>): Promise<AgentResult> {
  try {
    const res = await fetch(`${AGENT_URL}/ssh/provision`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AGENT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    return await res.json()
  } catch {
    return { ok: false, error: "Agent no disponible" }
  }
}

export const sshAgent = {
  status: () => call({ action: "status" }),
  enable: () => call({ action: "enable" }),
  disable: () => call({ action: "disable" }),
  updateConfig: (config: Partial<SshConfig>) => call({ action: "update-config", ...config }),
  resetRootPassword: (password: string) => call({ action: "reset-root-password", password }),
  viewRootKeys: () => call({ action: "view-root-keys" }),
  logs: (limit = 200) => call({ action: "logs", limit }),
}
