const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:7070"
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ""

interface AgentResult {
  ok: boolean
  error?: string
  version?: string
  pluginsCount?: number
  themesCount?: number
  diskUsageMB?: number
  key?: string
  user?: string
}

async function call(body: Record<string, unknown>, timeoutMs = 240000): Promise<AgentResult> {
  try {
    const res = await fetch(`${AGENT_URL}/wp/action`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AGENT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    return await res.json()
  } catch {
    return { ok: false, error: "Agent no disponible" }
  }
}

export interface WpInstallPayload {
  domain: string
  rootPath: string
  dbName: string
  dbUser: string
  dbPassword: string
  adminUser: string
  adminPassword: string
  adminEmail: string
  siteTitle?: string
  language?: string
  template?: "blog" | "ecommerce" | "landing"
}

export const wpAgent = {
  install: (p: WpInstallPayload) => call({ action: "install", ...p }, 360000),
  info: (rootPath: string) => call({ action: "info", rootPath }),
  updateCore: (rootPath: string) => call({ action: "update-core", rootPath }),
  changePassword: (rootPath: string, user: string, password: string) =>
    call({ action: "change-password", rootPath, user, password }),
  autoLogin: (rootPath: string, user: string) =>
    call({ action: "auto-login", rootPath, user }),
  uninstall: (rootPath: string, dbName?: string, dbUser?: string) =>
    call({ action: "uninstall", rootPath, dbName, dbUser }),
}
