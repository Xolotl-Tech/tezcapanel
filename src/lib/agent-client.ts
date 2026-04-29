const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:7070"
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ""

export interface ServerMetrics {
  cpu: {
    usage: number
    cores: number
    model: string
  }
  memory: {
    total: number
    used: number
    free: number
  }
  disk: {
    total: number
    used: number
    free: number
  }
  uptime: number
  hostname: string
  os: string
}

export interface ServiceStatus {
  name: string
  status: "running" | "stopped" | "unknown"
  pid?: number
}

export async function agentFetch<T>(
  path: string,
  options?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const { timeoutMs = 30000, signal, ...rest } = options ?? {}
  const res = await fetch(`${AGENT_URL}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${AGENT_TOKEN}`,
      "Content-Type": "application/json",
      ...rest.headers,
    },
    signal: signal ?? AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) {
    throw new Error(`Agent error ${res.status}: ${await res.text()}`)
  }

  return res.json() as Promise<T>
}

export const agentAPI = {
  getMetrics: () => agentFetch<ServerMetrics>("/metrics"),
  getServices: () => agentFetch<ServiceStatus[]>("/services"),
  restartService: (name: string) =>
    agentFetch<{ ok: boolean }>(`/services/${name}/restart`, { method: "POST" }),
}
