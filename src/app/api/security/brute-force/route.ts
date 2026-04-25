import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { bruteForceAgent } from "@/lib/brute-force-agent"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const [st, known] = await Promise.all([bruteForceAgent.status(), bruteForceAgent.knownJails()])
  return NextResponse.json({
    agentAvailable: st.ok,
    installed: !!st.installed,
    running: !!st.running,
    jails: st.jails ?? [],
    global: st.global ?? {},
    knownJails: known.jails ?? [],
  })
}
