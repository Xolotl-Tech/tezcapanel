const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:7070"
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ""

export interface ComponentInfo {
  installed: boolean
  version: string | null
  raw: string
  active?: boolean
}

export interface SystemScan {
  os: {
    distro: string | null
    release: string | null
    codename: string | null
    family: "rhel" | "debian" | "unknown"
    arch: string | null
  }
  hardware: {
    cores: number
    memTotal: number
    diskTotal: number
    diskFree: number
  }
  pkgManager: "dnf" | "apt" | "yum" | null
  components: {
    nginx: ComponentInfo
    apache: ComponentInfo
    mariadb: ComponentInfo
    mysql: ComponentInfo
    postgres: ComponentInfo
    php: ComponentInfo
    node: ComponentInfo
    redis: ComponentInfo
    certbot: ComponentInfo
  }
  summary: {
    webServer: "nginx" | "apache" | null
    database: "mariadb" | "mysql" | "postgres" | null
    hasStack: boolean
    recommended: "lamp" | "lemp" | null
  }
}

export async function scanSystem(): Promise<{ ok: true; scan: SystemScan } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${AGENT_URL}/system/scan`, {
      headers: { Authorization: `Bearer ${AGENT_TOKEN}` },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return { ok: false, error: `agent responded ${res.status}` }
    const scan = (await res.json()) as SystemScan
    return { ok: true, scan }
  } catch {
    return { ok: false, error: "agent_unavailable" }
  }
}
