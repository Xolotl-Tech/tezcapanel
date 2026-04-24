const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:7070"
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ""

export interface FirewallRulePayload {
  strategy: "allow" | "deny"
  direction: "inbound" | "outbound"
  protocol: "tcp" | "udp" | "both"
  port?: string | null
  sourceIp?: string | null
}

interface AgentResult {
  ok: boolean
  error?: string
  enabled?: boolean
  raw?: string
  ports?: number[]
}

async function call(body: Record<string, unknown>): Promise<AgentResult> {
  try {
    const res = await fetch(`${AGENT_URL}/firewall/provision`, {
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

export const firewallAgent = {
  status: () => call({ action: "status" }),
  enable: () => call({ action: "enable" }),
  disable: () => call({ action: "disable" }),
  blockIcmp: (enabled: boolean) => call({ action: "block-icmp", enabled }),
  addRule: (rule: FirewallRulePayload) => call({ action: "add-rule", rule }),
  deleteRule: (rule: FirewallRulePayload) => call({ action: "delete-rule", rule }),
  listeningPorts: () => call({ action: "listening-ports" }),
}
