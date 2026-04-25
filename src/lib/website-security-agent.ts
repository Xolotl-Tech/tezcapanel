const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:7070"
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ""

export interface ScanRisk {
  severity: "low" | "medium" | "high"
  title: string
  description?: string
  affectedPath?: string
  domain?: string
}

export interface ScanRisks {
  config: ScanRisk[]
  "file-leak": ScanRisk[]
  webshell: ScanRisk[]
  backup: ScanRisk[]
  "weak-password": ScanRisk[]
  logs: ScanRisk[]
}

export interface ScanResult {
  ok: boolean
  error?: string
  durationMs?: number
  score?: number
  risks?: ScanRisks
  counts?: { xss: number; sql: number; php: number; malicious: number }
  topIps?: { ip: string; visits: number }[]
}

export async function runWebsiteScan(
  websites: { domain: string; rootPath: string }[],
  logPaths: string[],
): Promise<ScanResult> {
  try {
    const res = await fetch(`${AGENT_URL}/website-security/scan`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AGENT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ websites, logPaths }),
      signal: AbortSignal.timeout(180000),
    })
    return await res.json()
  } catch {
    return { ok: false, error: "Agent no disponible" }
  }
}
