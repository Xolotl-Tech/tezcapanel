const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:7070"
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ""

export interface Compiler {
  key: string
  label: string
  installed: boolean
  path: string | null
  accessible: boolean
}

interface AgentResult {
  ok: boolean
  error?: string
  compilers?: Compiler[]
}

async function call(body: Record<string, unknown>): Promise<AgentResult> {
  try {
    const res = await fetch(`${AGENT_URL}/compiler-access/action`, {
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

export const compilerAgent = {
  status: () => call({ action: "status" }),
  toggle: (key: string, enabled: boolean) => call({ action: "toggle", key, enabled }),
}
