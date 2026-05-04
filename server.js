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
const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")
const { parse } = require("url")
const next = require("next")

// Versión instalada del panel: SHA del commit. Se inyecta en process.env
// para que las API routes la lean sin tocar disco. Falla silenciosamente
// si no hay git (instalaciones desde tarball o symlink raro).
function detectInstalledSha() {
  try {
    const sha = execSync("git rev-parse HEAD", {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "ignore"],
    }).toString().trim()
    if (/^[0-9a-f]{40}$/.test(sha)) return sha
  } catch {}
  // Fallback: VERSION file que install.sh puede escribir tras git pull.
  try {
    const v = fs.readFileSync(path.join(__dirname, "VERSION"), "utf8").trim()
    if (/^[0-9a-f]{40}$/.test(v)) return v
  } catch {}
  return ""
}
process.env.PANEL_COMMIT = detectInstalledSha()

const dev = process.env.NODE_ENV !== "production"
const hostname = process.env.HOSTNAME || "0.0.0.0"
const port = parseInt(process.env.PORT || "3000", 10)

const AGENT_WS_HOST = process.env.AGENT_WS_HOST || "127.0.0.1"
const AGENT_WS_PORT = parseInt(process.env.AGENT_WS_PORT || "7071", 10)
const TERMINAL_PATH = "/ws/terminal"

// --- WS proxy: defense-in-depth ---
// La autenticación final la hace el agente con el HMAC del token efímero,
// pero antes de tunelear queremos:
//   - presence-check de la cookie de sesión NextAuth (corta tráfico
//     anónimo, evita gastar sockets al agente).
//   - timeout en sockets ociosos (no leakear FDs si el cliente desaparece).
//   - rate limit por IP en attempts de upgrade (sin esto, alguien con
//     acceso a la red del panel puede agotar FDs vía connection floods).

const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
]
const SOCKET_IDLE_MS = 60_000
const UPGRADE_RATE_WINDOW_MS = 60_000
const UPGRADE_RATE_MAX = 30 // 30 intentos / minuto / IP
const upgradeHits = new Map() // ip -> number[] (timestamps)

function parseCookies(header) {
  const out = Object.create(null)
  if (!header) return out
  for (const part of header.split(";")) {
    const i = part.indexOf("=")
    if (i < 0) continue
    const k = part.slice(0, i).trim()
    const v = part.slice(i + 1).trim()
    if (k) out[k] = v
  }
  return out
}

function hasSessionCookie(cookieHeader) {
  const cookies = parseCookies(cookieHeader)
  return SESSION_COOKIES.some((name) => {
    if (cookies[name]) return true
    // Cookies chunked en NextAuth: nombre.0, nombre.1, ...
    return Object.keys(cookies).some((k) => k.startsWith(`${name}.`))
  })
}

function clientIpFrom(req) {
  const xff = (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim()
  if (xff) return xff
  return req.socket?.remoteAddress || "unknown"
}

function checkUpgradeRate(ip) {
  const now = Date.now()
  const cutoff = now - UPGRADE_RATE_WINDOW_MS
  let hits = upgradeHits.get(ip) || []
  hits = hits.filter((t) => t >= cutoff)
  hits.push(now)
  upgradeHits.set(ip, hits)
  return hits.length <= UPGRADE_RATE_MAX
}

function rejectUpgrade(socket, status, reason) {
  try {
    socket.write(
      `HTTP/1.1 ${status} ${reason}\r\n` +
      `Connection: close\r\n` +
      `Content-Length: 0\r\n\r\n`
    )
  } catch {}
  try { socket.destroy() } catch {}
}

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

  // Idle timeout en ambas puntas: si nadie habla por SOCKET_IDLE_MS, cierra.
  // Esto evita FDs leak cuando el navegador del usuario desaparece sin enviar
  // close frame (cierre forzado del laptop, NAT timeout, etc.).
  clientSocket.setTimeout(SOCKET_IDLE_MS, () => clientSocket.destroy())
  upstream.setTimeout(SOCKET_IDLE_MS, () => upstream.destroy())

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
    if (!(url.pathname && url.pathname.startsWith(TERMINAL_PATH))) {
      // Otros upgrades (HMR de Next en dev) los maneja el listener interno
      // que Next adjunta durante app.prepare(). No tocar.
      return
    }

    // 1) Rate limit por IP — corta connection floods.
    const ip = clientIpFrom(req)
    if (!checkUpgradeRate(ip)) {
      return rejectUpgrade(socket, 429, "Too Many Requests")
    }

    // 2) Presence check de cookie de sesión — defense-in-depth sobre el
    //    HMAC del agente. La validación criptográfica del JWT la hizo el
    //    panel cuando emitió el token efímero; aquí sólo bloqueamos
    //    tráfico anónimo evidente para no gastar sockets en el agente.
    if (!hasSessionCookie(req.headers["cookie"])) {
      return rejectUpgrade(socket, 401, "Unauthorized")
    }

    proxyTerminalUpgrade(req, socket, head)
  })

  server.listen(port, hostname, () => {
    const proto = "http"
    console.log(`▲ Tezcapanel listo en ${proto}://${hostname}:${port}`)
    console.log(`  WS terminal → ${TERMINAL_PATH} → ${AGENT_WS_HOST}:${AGENT_WS_PORT}`)
  })
})
