const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:7070"
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ""

export interface BaselineEntry {
  path: string
  sha256: string
  size: number
  mtime: string | null
}

export interface Finding {
  type: string
  severity: string
  title: string
  description?: string
  path?: string
  extra?: string
}

interface AgentResult {
  ok: boolean
  error?: string
  baseline?: BaselineEntry[]
  findings?: Finding[]
  durationMs?: number
  chkrootkitInstalled?: boolean
}

async function call(body: Record<string, unknown>): Promise<AgentResult> {
  try {
    const res = await fetch(`${AGENT_URL}/intrusion/action`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AGENT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000),
    })
    return await res.json()
  } catch {
    return { ok: false, error: "Agent no disponible" }
  }
}

export const intrusionAgent = {
  createBaseline: () => call({ action: "create-baseline" }),
  scan: (baseline: BaselineEntry[]) => call({ action: "scan", baseline }),
}
