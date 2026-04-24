import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { sshAgent } from "@/lib/ssh-agent"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const r = await sshAgent.viewRootKeys()
  return NextResponse.json({ keys: r.keys ?? "", agentAvailable: r.ok })
}
