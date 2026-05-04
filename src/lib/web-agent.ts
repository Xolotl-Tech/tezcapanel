const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:7070"
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ""

interface AgentResult {
  ok: boolean
  error?: string
  confPath?: string
  output?: string
}

async function call(body: Record<string, unknown>, timeoutMs = 30000): Promise<AgentResult> {
  try {
    const res = await fetch(`${AGENT_URL}/web/provision`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AGENT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    return (await res.json()) as AgentResult
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "agent_unreachable" }
  }
}

export const webAgent = {
  createVhost: (params: {
    domain: string
    rootPath: string
    kind?: "wp" | "static"
    phpFpmSocket?: string
  }) =>
    call({
      action: "create-vhost",
      kind: "wp",
      ...params,
    }),

  deleteVhost: (domain: string) => call({ action: "delete-vhost", domain }),

  provisionSsl: (params: { domain: string; email: string; includeWww?: boolean }) =>
    // certbot puede tardar — descarga, valida HTTP-01, instala. Timeout 5min.
    call({ action: "provision-ssl", ...params }, 305000),

  renewSsl: () => call({ action: "renew-ssl" }, 305000),
}
