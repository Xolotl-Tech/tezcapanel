// @ts-nocheck
import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { Client } from "ssh2"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { host, port, username, authType, password, privateKey } = await req.json()

  if (!host || !username) {
    return NextResponse.json({ ok: false, error: "host y username requeridos" }, { status: 400 })
  }

  const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
    const conn = new Client()
    const timer = setTimeout(() => {
      conn.end()
      resolve({ ok: false, error: "Timeout (10s)" })
    }, 10000)

    conn.on("ready", () => {
      clearTimeout(timer)
      conn.end()
      resolve({ ok: true })
    })

    conn.on("error", (err) => {
      clearTimeout(timer)
      resolve({ ok: false, error: err.message })
    })

    try {
      conn.connect({
        host: String(host).trim(),
        port: Number(port) || 22,
        username: String(username).trim(),
        ...(authType === "key"
          ? { privateKey: String(privateKey || "") }
          : { password: String(password || "") }),
        readyTimeout: 9000,
      })
    } catch (err) {
      clearTimeout(timer)
      resolve({ ok: false, error: err instanceof Error ? err.message : "connect error" })
    }
  })

  return NextResponse.json(result)
}
