"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface RemoteTarget {
  host: string
  port: number
  username: string
  authType: "password" | "key"
  password?: string
  privateKey?: string
}

export interface TerminalApi {
  sendInput: (text: string) => void
}

interface TerminalEmulatorProps {
  /** Si está vacío, el emulador pedirá su propio token efímero. */
  token?: string
  target: "local" | "ssh"
  /** Required when target === "ssh". Fetched server-side and passed in. */
  remote?: RemoteTarget
  onReady?: (api: TerminalApi) => void
  onClosed?: () => void
}

async function fetchTerminalToken(): Promise<string> {
  const r = await fetch("/api/terminal/token", { cache: "no-store" })
  if (!r.ok) throw new Error(`token ${r.status}`)
  const data = await r.json()
  if (!data?.token) throw new Error("token vacío")
  return data.token as string
}

// Keepalive a nivel de aplicación: cada 30s mandamos un ping JSON. El
// agente lo ignora silenciosamente (no matchea input/resize) pero el
// tráfico resetea el setTimeout del proxy en server.js. Sin esto una
// terminal abierta y ociosa cae al SOCKET_IDLE_MS aunque el usuario
// siga la página activa.
const KEEPALIVE_MS = 30_000

export function TerminalEmulator({ token: tokenProp, target, remote, onReady, onClosed }: TerminalEmulatorProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting")
  const [errorMsg, setErrorMsg] = useState("")
  const [reconnectKey, setReconnectKey] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)
  const xtermRef = useRef<import("@xterm/xterm").Terminal | null>(null)
  const fitRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null)

  useEffect(() => {
    if (!terminalRef.current) return
    if (target === "ssh" && !remote) return

    let disposed = false
    let connected = false
    let keepaliveTimer: ReturnType<typeof setInterval> | null = null

    async function init() {
      setStatus("connecting")
      setErrorMsg("")

      let token = tokenProp
      if (!token) {
        try { token = await fetchTerminalToken() } catch (err) {
          if (!disposed) {
            setStatus("error")
            setErrorMsg(err instanceof Error ? err.message : "No se pudo obtener token")
          }
          return
        }
      }

      const { Terminal } = await import("@xterm/xterm")
      const { FitAddon } = await import("@xterm/addon-fit")

      if (disposed) return

      // Reusar la instancia de xterm si ya existe (caso reconexión): solo
      // cambiamos la WebSocket por debajo, manteniendo el scrollback y la
      // configuración. Si es la primera conexión, instanciamos.
      let terminal = xtermRef.current
      let fitAddon = fitRef.current
      if (!terminal) {
        terminal = new Terminal({
          cursorBlink: true,
          fontSize: 13,
          fontFamily: "JetBrains Mono, Fira Code, Cascadia Code, monospace",
          theme: {
            background: "#0d0d0d",
            foreground: "#e5e5e5",
            cursor: "#10B981",
            cursorAccent: "#0d0d0d",
            selectionBackground: "#10B98133",
            black: "#1a1a1a",
            red: "#ef4444",
            green: "#10B981",
            yellow: "#f59e0b",
            blue: "#3b82f6",
            magenta: "#8b5cf6",
            cyan: "#06b6d4",
            white: "#e5e5e5",
            brightBlack: "#404040",
            brightRed: "#f87171",
            brightGreen: "#34d399",
            brightYellow: "#fbbf24",
            brightBlue: "#60a5fa",
            brightMagenta: "#a78bfa",
            brightCyan: "#22d3ee",
            brightWhite: "#ffffff",
          },
        })

        fitAddon = new FitAddon()
        terminal.loadAddon(fitAddon)
        terminal.open(terminalRef.current!)
        fitAddon.fit()

        xtermRef.current = terminal
        fitRef.current = fitAddon
      } else {
        // Línea de separación visual entre la sesión anterior y la nueva
        terminal.write("\r\n\x1b[33m── Reconectando…\x1b[0m\r\n")
      }

      const proto = window.location.protocol === "https:" ? "wss" : "ws"
      const ws = new WebSocket(
        `${proto}://${window.location.host}/ws/terminal?target=${target}`,
        [`tezca-term.${token}`],
      )
      wsRef.current = ws

      ws.onopen = () => {
        if (disposed) { ws.close(); return }
        connected = true
        setStatus("connected")

        // Keepalive: el agente ignora msg.type=="ping" y el proxy resetea
        // su idle timer al ver tráfico.
        keepaliveTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }))
          }
        }, KEEPALIVE_MS)

        onReady?.({
          sendInput: (text: string) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "input", data: text }))
            }
          },
        })
        if (target === "ssh" && remote) {
          ws.send(JSON.stringify({
            type: "init",
            host: remote.host,
            port: remote.port,
            username: remote.username,
            authType: remote.authType,
            password: remote.password,
            privateKey: remote.privateKey,
            cols: terminal!.cols,
            rows: terminal!.rows,
          }))
        }
        ws.send(JSON.stringify({ type: "resize", cols: terminal!.cols, rows: terminal!.rows }))
      }

      ws.onmessage = (e) => terminal!.write(e.data)

      ws.onerror = () => {
        if (!connected) {
          setStatus("error")
          setErrorMsg("No se pudo conectar al agente. Verifica que tezcaagent esté corriendo en el servidor.")
        }
      }

      ws.onclose = (e) => {
        if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null }
        if (disposed) return
        if (e.code === 1008) {
          setStatus("error")
          const reason = (e.reason || "").startsWith("Unauthorized:")
            ? e.reason.split(":")[1]
            : ""
          setErrorMsg(
            reason === "expired"
              ? "Token de terminal expirado."
              : reason === "replay"
              ? "Token ya usado."
              : "No autorizado para abrir terminal."
          )
          return
        }
        if (connected) {
          setStatus("disconnected")
          terminal!.write("\r\n\x1b[31m── Conexión cerrada por inactividad o cierre del servidor\x1b[0m\r\n")
          onClosed?.()
        }
      }

      terminal.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data }))
        }
      })

      // Debounce: ResizeObserver puede dispararse 60+ veces durante transiciones
      // de layout. fitAddon.fit() en cada llamada satura el event loop de xterm
      // ("task queue exceeded allotted deadline") y gasta CPU sin beneficio
      // visible — el último fit es el único que importa.
      let resizeTimer: ReturnType<typeof setTimeout> | null = null
      const resizeObserver = new ResizeObserver(() => {
        if (resizeTimer) clearTimeout(resizeTimer)
        resizeTimer = setTimeout(() => {
          try { fitAddon!.fit() } catch {}
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "resize", cols: terminal!.cols, rows: terminal!.rows }))
          }
        }, 100)
      })

      if (terminalRef.current) resizeObserver.observe(terminalRef.current)

      return () => {
        if (resizeTimer) clearTimeout(resizeTimer)
        if (keepaliveTimer) clearInterval(keepaliveTimer)
        resizeObserver.disconnect()
        ws.close()
      }
    }

    let cleanupFn: (() => void) | undefined
    init().then((fn) => { cleanupFn = fn })

    return () => {
      disposed = true
      cleanupFn?.()
      wsRef.current?.close()
    }
  }, [tokenProp, target, remote, reconnectKey])

  // Cleanup global de xterm al desmontar (no en cada reconexión)
  useEffect(() => {
    return () => {
      xtermRef.current?.dispose()
      xtermRef.current = null
      fitRef.current = null
    }
  }, [])

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden bg-[#0d0d0d] border border-border">
      {status === "connecting" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d0d] z-10">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            Conectando con el servidor...
          </div>
        </div>
      )}

      {(status === "error" || status === "disconnected") && (
        <div className="absolute top-2 right-2 z-10">
          <Button
            size="sm"
            variant="default"
            className="h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90"
            onClick={() => setReconnectKey((k) => k + 1)}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reconectar
          </Button>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d0d]/90 z-[5]">
          <div className="text-center space-y-2 max-w-md px-4">
            <p className="text-sm text-destructive">{errorMsg}</p>
          </div>
        </div>
      )}

      <div ref={terminalRef} className="w-full h-full p-2" />
    </div>
  )
}
