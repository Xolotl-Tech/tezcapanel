const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:7070"
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ""

export interface JailInfo {
  name: string
  failed?: number
  totalFailed?: number
  banned?: number
  totalBanned?: number
  bannedIps?: string[]
  error?: string
}

export interface GlobalConfig {
  bantime?: string
  findtime?: string
  maxretry?: string
}

export interface BruteForceStatus {
  ok: boolean
  installed?: boolean
  running?: boolean
  jails?: JailInfo[]
  global?: GlobalConfig
  error?: string
}

async function call(body: Record<string, unknown>): Promise<BruteForceStatus & { [k: string]: unknown }> {
  try {
    const res = await fetch(`${AGENT_URL}/brute-force/action`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AGENT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    })
    return await res.json()
  } catch {
    return { ok: false, error: "Agent no disponible" }
  }
}

export const bruteForceAgent = {
  status: () => call({ action: "status" }),
  ban: (jail: string, ip: string) => call({ action: "ban", jail, ip }),
  unban: (jail: string, ip: string) => call({ action: "unban", jail, ip }),
  updateJail: (jail: string, patch: { enabled?: boolean; maxretry?: number; bantime?: string; findtime?: string }) =>
    call({ action: "update-jail", jail, ...patch }),
  updateGlobal: (patch: GlobalConfig) => call({ action: "update-global", ...patch }),
  knownJails: () => call({ action: "known-jails" }),
}
