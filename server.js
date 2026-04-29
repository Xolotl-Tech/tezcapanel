/**
 * Custom server: corre Next.js y tunelea /ws/terminal al agente loopback.
 *
 * Esto permite que:
 *  - El navegador SÓLO hable con un puerto (el del panel).
 *  - El agente WebSocket vuelva a 127.0.0.1 (no expone puerto extra).
 *  - El operador no tenga que configurar AGENT_WS_HOST/AGENT_WS_ALLOWED_ORIGINS.
 *
 * Usado por scripts dev/start. El proxy preserva el handshake completo
 * (incluyendo Sec-WebSocket-Protocol con el token efímero).
 */
const http = require("http")
const net = require("net")
const { parse } = require("url")
const next = require("next")

const dev = process.env.NODE_ENV !== "production"
const hostname = process.env.HOSTNAME || "0.0.0.0"
const port = parseInt(process.env.PORT || "3000", 10)

const AGENT_WS_HOST = process.env.AGENT_WS_HOST || "127.0.0.1"
const AGENT_WS_PORT = parseInt(process.env.AGENT_WS_PORT || "7071", 10)
const TERMINAL_PATH = "/ws/terminal"

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

function proxyTerminalUpgrade(req, clientSocket, head) {
  const url = parse(req.url || "/", true)
  // Reescribimos la URL al agente: el agente ignora el path y lee target/proto.
  const upstreamPath = "/" + (url.search || "")
  const upstream = net.connect(AGENT_WS_PORT, AGENT_WS_HOST, () => {
    const lines = [`GET ${upstreamPath} HTTP/1.1`]
    for (const [k, v] of Object.entries(req.headers)) {
      if (k.toLowerCase() === "host") {
        lines.push(`Host: ${AGENT_WS_HOST}:${AGENT_WS_PORT}`)
        continue
      }
      if (Array.isArray(v)) v.forEach((val) => lines.push(`${k}: ${val}`))
      else if (v !== undefined) lines.push(`${k}: ${v}`)
    }
    lines.push("", "")
    upstream.write(lines.join("\r\n"))
    if (head && head.length) upstream.write(head)
    upstream.pipe(clientSocket)
    clientSocket.pipe(upstream)
  })

  upstream.on("error", (err) => {
    console.error("[ws proxy] upstream error:", err.message)
    try { clientSocket.destroy() } catch {}
  })
  clientSocket.on("error", (err) => {
    console.error("[ws proxy] client error:", err.message)
    try { upstream.destroy() } catch {}
  })
}

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    handle(req, res, parse(req.url || "/", true))
  })

  server.on("upgrade", (req, socket, head) => {
    const url = parse(req.url || "/", true)
    if (url.pathname && url.pathname.startsWith(TERMINAL_PATH)) {
      proxyTerminalUpgrade(req, socket, head)
    }
    // Otros upgrades (HMR de Next en dev) los maneja el listener interno
    // que Next adjunta durante app.prepare(). No tocar.
  })

  server.listen(port, hostname, () => {
    const proto = "http"
    console.log(`▲ Tezcapanel listo en ${proto}://${hostname}:${port}`)
    console.log(`  WS terminal → ${TERMINAL_PATH} → ${AGENT_WS_HOST}:${AGENT_WS_PORT}`)
  })
})
