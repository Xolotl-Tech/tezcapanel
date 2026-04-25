import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const token = process.env.AGENT_TOKEN ?? ""
  return NextResponse.json({ token })
}
