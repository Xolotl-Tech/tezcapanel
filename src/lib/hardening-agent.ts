const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:7070"
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ""

export interface HardeningItem {
  category: string
  id: string
  label: string
  description: string
  type: string
  key?: string
  path?: string
  expected: string
  severity: string
  current: string | null
  ok: boolean
}

interface AgentResult {
  ok: boolean
  error?: string
  items?: HardeningItem[]
  fixed?: string[]
}

async function call(body: Record<string, unknown>): Promise<AgentResult> {
  try {
    const res = await fetch(`${AGENT_URL}/hardening/action`, {
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

export const hardeningAgent = {
  check: () => call({ action: "check" }),
  applyAll: () => call({ action: "apply-all" }),
  applyItem: (id: string) => call({ action: "apply-item", id }),
}
