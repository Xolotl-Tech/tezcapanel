const AGENT_URL   = process.env.AGENT_URL   ?? "http://127.0.0.1:7070"
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ""

interface ProvisionResult {
  ok: boolean
  error?: string
  public_key?: string
}

async function provision(data: Record<string, unknown>): Promise<ProvisionResult> {
  try {
    const res = await fetch(`${AGENT_URL}/mail/provision`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AGENT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(15000),
    })
    const json = await res.json()
    return json
  } catch {
    return { ok: false, error: "Agent no disponible" }
  }
}

export const mailAgent = {
  addDomain:      (domain: string)                                    => provision({ action: "add-domain",      domain }),
  removeDomain:   (domain: string)                                    => provision({ action: "remove-domain",   domain }),
  addAccount:     (email: string, password: string, quota_mb: number) => provision({ action: "add-account",    email, password, quota_mb }),
  removeAccount:  (email: string)                                     => provision({ action: "remove-account",  email }),
  updatePassword: (email: string, password: string)                   => provision({ action: "update-password", email, password }),
  addAlias:       (source: string, destination: string)               => provision({ action: "add-alias",       source, destination }),
  removeAlias:    (source: string)                                     => provision({ action: "remove-alias",    source }),
  genDkim:        (domain: string)                                    => provision({ action: "gen-dkim",        domain }),
}
