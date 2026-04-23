const http = require("http")
const { exec } = require("child_process")
const { promisify } = require("util")
const fs = require("fs")
const path = require("path")
const { WebSocketServer } = require("ws")
const pty = require("node-pty")
const os = require("os")
const si = require("systeminformation")

const execAsync = promisify(exec)

// --- Rutas de configuración de correo ---
const MAIL_VIRTUAL_DOMAINS = "/etc/postfix/virtual_domains"
const MAIL_VIRTUAL_MAILBOX = "/etc/postfix/virtual_mailbox"
const MAIL_VIRTUAL_ALIAS   = "/etc/postfix/virtual_alias"
const DOVECOT_PASSWD       = "/etc/dovecot/passwd"
const MAIL_BASE            = "/var/mail/vhosts"
const DKIM_BASE            = "/etc/opendkim/keys"

// --- DNS (BIND9) ---
const BIND_ZONES_DIR       = "/etc/bind/zones"
const BIND_NAMED_LOCAL     = "/etc/bind/named.conf.local"

function readLines(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean)
  } catch {
    return []
  }
}

function writeLines(filePath, lines) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, lines.length ? lines.join("\n") + "\n" : "", "utf8")
}

function validateEmail(email) {
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email)
}

function validateDomain(domain) {
  return /^[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(domain)
}

async function handleMailProvision(req, res) {
  let body = ""
  req.on("data", chunk => { body += chunk })
  req.on("end", async () => {
    try {
      const data = JSON.parse(body)
      const { action } = data

      if (!action) {
        res.writeHead(400)
        res.end(JSON.stringify({ error: "action requerido" }))
        return
      }

      switch (action) {

        // ── Dominios ───────────────────────────────────────────
        case "add-domain": {
          const { domain } = data
          if (!domain || !validateDomain(domain)) {
            res.writeHead(400); res.end(JSON.stringify({ error: "Dominio inválido" })); return
          }
          const lines = readLines(MAIL_VIRTUAL_DOMAINS)
          if (!lines.includes(domain)) {
            lines.push(domain)
            writeLines(MAIL_VIRTUAL_DOMAINS, lines)
          }
          fs.mkdirSync(`${MAIL_BASE}/${domain}`, { recursive: true })
          try {
            await execAsync(`postmap ${MAIL_VIRTUAL_DOMAINS}`)
            await execAsync("systemctl reload postfix")
          } catch {}
          res.end(JSON.stringify({ ok: true }))
          break
        }

        case "remove-domain": {
          const { domain } = data
          if (!domain || !validateDomain(domain)) {
            res.writeHead(400); res.end(JSON.stringify({ error: "Dominio inválido" })); return
          }
          const lines = readLines(MAIL_VIRTUAL_DOMAINS).filter(l => l.trim() !== domain)
          writeLines(MAIL_VIRTUAL_DOMAINS, lines)
          try {
            await execAsync(`postmap ${MAIL_VIRTUAL_DOMAINS}`)
            await execAsync("systemctl reload postfix")
          } catch {}
          res.end(JSON.stringify({ ok: true }))
          break
        }

        // ── Cuentas ────────────────────────────────────────────
        case "add-account": {
          const { email, password, quota_mb = 500 } = data
          if (!email || !validateEmail(email) || !password) {
            res.writeHead(400); res.end(JSON.stringify({ error: "email y password requeridos" })); return
          }
          if (password.includes(":")) {
            res.writeHead(400); res.end(JSON.stringify({ error: "La contraseña no puede contener ':'" })); return
          }
          const [user, domain] = email.split("@")
          const mailboxPath    = `${domain}/${user}/`
          const mailDir        = `${MAIL_BASE}/${mailboxPath}`

          // Postfix virtual_mailbox
          const mbLines = readLines(MAIL_VIRTUAL_MAILBOX)
          if (!mbLines.some(l => l.startsWith(`${email}\t`) || l.startsWith(`${email} `))) {
            mbLines.push(`${email}\t${mailboxPath}`)
            writeLines(MAIL_VIRTUAL_MAILBOX, mbLines)
          }

          // Dovecot passwd  — formato: user:pass:uid:gid::home::quota_rule
          const passwdEntry = `${email}:{PLAIN}${password}:5000:5000::${mailDir}::userdb_quota_rule=*:storage=${quota_mb}M`
          const passwdLines = readLines(DOVECOT_PASSWD)
          if (!passwdLines.some(l => l.startsWith(`${email}:`))) {
            passwdLines.push(passwdEntry)
            writeLines(DOVECOT_PASSWD, passwdLines)
          }

          // Crear directorio del buzón
          fs.mkdirSync(mailDir, { recursive: true })
          try {
            await execAsync(`chown -R 5000:5000 ${MAIL_BASE}`)
            await execAsync(`postmap ${MAIL_VIRTUAL_MAILBOX}`)
            await execAsync("systemctl reload postfix")
            await execAsync("systemctl reload dovecot")
          } catch {}
          res.end(JSON.stringify({ ok: true }))
          break
        }

        case "remove-account": {
          const { email } = data
          if (!email || !validateEmail(email)) {
            res.writeHead(400); res.end(JSON.stringify({ error: "email inválido" })); return
          }
          const mbLines = readLines(MAIL_VIRTUAL_MAILBOX).filter(l => !l.startsWith(`${email}\t`) && !l.startsWith(`${email} `))
          writeLines(MAIL_VIRTUAL_MAILBOX, mbLines)
          const passwdLines = readLines(DOVECOT_PASSWD).filter(l => !l.startsWith(`${email}:`))
          writeLines(DOVECOT_PASSWD, passwdLines)
          try {
            await execAsync(`postmap ${MAIL_VIRTUAL_MAILBOX}`)
            await execAsync("systemctl reload postfix")
            await execAsync("systemctl reload dovecot")
          } catch {}
          res.end(JSON.stringify({ ok: true }))
          break
        }

        case "update-password": {
          const { email, password } = data
          if (!email || !validateEmail(email) || !password) {
            res.writeHead(400); res.end(JSON.stringify({ error: "email y password requeridos" })); return
          }
          if (password.includes(":")) {
            res.writeHead(400); res.end(JSON.stringify({ error: "La contraseña no puede contener ':'" })); return
          }
          const passwdLines = readLines(DOVECOT_PASSWD).map(l => {
            if (!l.startsWith(`${email}:`)) return l
            const parts = l.split(":")
            parts[1] = `{PLAIN}${password}`
            return parts.join(":")
          })
          writeLines(DOVECOT_PASSWD, passwdLines)
          try { await execAsync("systemctl reload dovecot") } catch {}
          res.end(JSON.stringify({ ok: true }))
          break
        }

        // ── Aliases ────────────────────────────────────────────
        case "add-alias": {
          const { source, destination } = data
          if (!source || !validateEmail(source) || !destination || !validateEmail(destination)) {
            res.writeHead(400); res.end(JSON.stringify({ error: "source y destination requeridos" })); return
          }
          const lines = readLines(MAIL_VIRTUAL_ALIAS)
          if (!lines.some(l => l.startsWith(`${source}\t`) || l.startsWith(`${source} `))) {
            lines.push(`${source}\t${destination}`)
            writeLines(MAIL_VIRTUAL_ALIAS, lines)
          }
          try {
            await execAsync(`postmap ${MAIL_VIRTUAL_ALIAS}`)
            await execAsync("systemctl reload postfix")
          } catch {}
          res.end(JSON.stringify({ ok: true }))
          break
        }

        case "remove-alias": {
          const { source } = data
          if (!source || !validateEmail(source)) {
            res.writeHead(400); res.end(JSON.stringify({ error: "source inválido" })); return
          }
          const lines = readLines(MAIL_VIRTUAL_ALIAS).filter(l => !l.startsWith(`${source}\t`) && !l.startsWith(`${source} `))
          writeLines(MAIL_VIRTUAL_ALIAS, lines)
          try {
            await execAsync(`postmap ${MAIL_VIRTUAL_ALIAS}`)
            await execAsync("systemctl reload postfix")
          } catch {}
          res.end(JSON.stringify({ ok: true }))
          break
        }

        // ── DKIM ───────────────────────────────────────────────
        case "gen-dkim": {
          const { domain } = data
          if (!domain || !validateDomain(domain)) {
            res.writeHead(400); res.end(JSON.stringify({ error: "Dominio inválido" })); return
          }
          const keyDir = `${DKIM_BASE}/${domain}`
          fs.mkdirSync(keyDir, { recursive: true })
          try {
            await execAsync(`opendkim-genkey -D ${keyDir} -s mail -d ${domain}`)
            const publicKey = fs.readFileSync(`${keyDir}/mail.txt`, "utf8")
            res.end(JSON.stringify({ ok: true, public_key: publicKey }))
          } catch (e) {
            res.writeHead(500)
            res.end(JSON.stringify({ error: `opendkim-genkey falló: ${e.message}` }))
          }
          break
        }

        default:
          res.writeHead(400)
          res.end(JSON.stringify({ error: `Acción desconocida: ${action}` }))
      }
    } catch (err) {
      console.error("[mail/provision]", err)
      res.writeHead(500)
      res.end(JSON.stringify({ error: err.message }))
    }
  })
}

// ─── DNS (BIND9) provisioning ─────────────────────────────────────
function renderZoneFile(zone) {
  const { domain, primaryNs, adminEmail, serial, refresh, retry, expire, minimum, defaultTtl, records } = zone

  const header = [
    `; Zona generada por Tezcapanel — ${new Date().toISOString()}`,
    `$TTL ${defaultTtl}`,
    `@   IN  SOA  ${primaryNs} ${adminEmail} (`,
    `        ${serial}  ; serial`,
    `        ${refresh}  ; refresh`,
    `        ${retry}  ; retry`,
    `        ${expire}  ; expire`,
    `        ${minimum}  ; minimum`,
    `)`,
    ``,
  ].join("\n")

  const lines = (records || []).map((r) => {
    const name = r.name === "" ? "@" : r.name
    const ttl  = r.ttl ? `${r.ttl}` : ""
    if (r.type === "MX" || r.type === "SRV") {
      return `${name}\t${ttl}\tIN\t${r.type}\t${r.priority ?? 10}\t${r.value}`
    }
    if (r.type === "TXT") {
      const v = r.value.startsWith("\"") ? r.value : `"${r.value.replace(/"/g, "\\\"")}"`
      return `${name}\t${ttl}\tIN\tTXT\t${v}`
    }
    return `${name}\t${ttl}\tIN\t${r.type}\t${r.value}`
  }).join("\n")

  return header + lines + "\n"
}

function ensureZoneDeclaration(domain) {
  const file = `${BIND_ZONES_DIR}/db.${domain}`
  let content = ""
  try { content = fs.readFileSync(BIND_NAMED_LOCAL, "utf8") } catch {}
  const marker = `zone "${domain}"`
  if (content.includes(marker)) return
  const block = `\nzone "${domain}" {\n    type master;\n    file "${file}";\n};\n`
  fs.mkdirSync(path.dirname(BIND_NAMED_LOCAL), { recursive: true })
  fs.appendFileSync(BIND_NAMED_LOCAL, block, "utf8")
}

function removeZoneDeclaration(domain) {
  let content = ""
  try { content = fs.readFileSync(BIND_NAMED_LOCAL, "utf8") } catch { return }
  const re = new RegExp(`\\nzone "${domain}"[\\s\\S]*?\\};\\n`, "g")
  fs.writeFileSync(BIND_NAMED_LOCAL, content.replace(re, ""), "utf8")
}

async function handleDnsProvision(req, res) {
  let body = ""
  req.on("data", chunk => { body += chunk })
  req.on("end", async () => {
    try {
      const data = JSON.parse(body)
      const { action } = data
      if (!action) {
        res.writeHead(400); res.end(JSON.stringify({ error: "action requerido" })); return
      }

      switch (action) {
        case "write-zone": {
          const zone = data.zone
          if (!zone || !zone.domain || !validateDomain(zone.domain)) {
            res.writeHead(400); res.end(JSON.stringify({ error: "Zona inválida" })); return
          }
          fs.mkdirSync(BIND_ZONES_DIR, { recursive: true })
          const file = `${BIND_ZONES_DIR}/db.${zone.domain}`
          fs.writeFileSync(file, renderZoneFile(zone), "utf8")
          ensureZoneDeclaration(zone.domain)
          res.end(JSON.stringify({ ok: true }))
          break
        }

        case "remove-zone": {
          const { domain } = data
          if (!domain || !validateDomain(domain)) {
            res.writeHead(400); res.end(JSON.stringify({ error: "Dominio inválido" })); return
          }
          try { fs.unlinkSync(`${BIND_ZONES_DIR}/db.${domain}`) } catch {}
          removeZoneDeclaration(domain)
          res.end(JSON.stringify({ ok: true }))
          break
        }

        case "check-zone": {
          const { domain } = data
          if (!domain || !validateDomain(domain)) {
            res.writeHead(400); res.end(JSON.stringify({ error: "Dominio inválido" })); return
          }
          try {
            const { stdout } = await execAsync(`named-checkzone ${domain} ${BIND_ZONES_DIR}/db.${domain}`)
            res.end(JSON.stringify({ ok: true, output: stdout.trim() }))
          } catch (e) {
            res.writeHead(200) // devolvemos 200 con ok:false para que la UI lo muestre
            res.end(JSON.stringify({ ok: false, error: (e.stderr || e.message || "").trim() }))
          }
          break
        }

        case "reload": {
          try {
            await execAsync("rndc reload")
            res.end(JSON.stringify({ ok: true }))
          } catch (e) {
            // fallback: intentar systemctl
            try {
              await execAsync("systemctl reload bind9")
              res.end(JSON.stringify({ ok: true }))
            } catch {
              res.writeHead(500)
              res.end(JSON.stringify({ ok: false, error: e.message }))
            }
          }
          break
        }

        default:
          res.writeHead(400)
          res.end(JSON.stringify({ error: `Acción desconocida: ${action}` }))
      }
    } catch (err) {
      console.error("[dns/provision]", err)
      res.writeHead(500)
      res.end(JSON.stringify({ error: err.message }))
    }
  })
}

const PORT = 7070
const HOST = "127.0.0.1"
const TOKEN = process.env.AGENT_TOKEN

if (!TOKEN) {
  console.error("❌ AGENT_TOKEN no definido — exporta la variable de entorno")
  process.exit(1)
}

// --- Lista blanca de comandos permitidos ---
const ALLOWED_COMMANDS = [
  /^apt(-get)? (install|remove|update|upgrade) -y [\w\s\-\.]+$/,
  /^apt(-get)? install -y [\w\s\-\.]+$/,
  /^yum (install|remove|update) -y [\w\s\-\.]+$/,
  /^dnf (install|remove|update) -y [\w\s\-\.]+$/,
  /^systemctl (start|stop|restart|reload|enable|disable|status) [\w\-\.]+$/,
  /^nginx -t$/,
  /^nginx -s reload$/,
  /^mysql -e "CREATE DATABASE [\w]+ CHARACTER SET utf8mb4"$/,
  /^mysql -e "CREATE USER '[\w]+'@'localhost' IDENTIFIED BY '[^']+'"$/,
  /^mysql -e "GRANT ALL ON [\w]+\.\* TO '[\w]+'@'localhost'"$/,
  /^mysql -e "FLUSH PRIVILEGES"$/,
  /^mysqldump [\w\s\-\.]+ > [\w\/\-\.]+$/,
  /^certbot --nginx -d [\w\.\-]+ --non-interactive --agree-tos -m [\w@\.\-]+$/,
  /^certbot renew --dry-run$/,
  /^certbot renew$/,
  /^mkdir -p \/etc\/(nginx|apache2|mysql|postfix)\//,
  /^mkdir -p \/var\/www\/[\w\-\.]+$/,
  /^chown -R www-data:www-data \/var\/www\/[\w\-\.]+$/,
  /^chmod -R 755 \/var\/www\/[\w\-\.]+$/,
  /^cat \/var\/log\/(nginx|apache2|mysql|syslog|auth\.log)(\/[\w\-\.]+)?$/,
  /^tail -n \d+ \/var\/log\/(nginx|apache2|mysql|syslog|auth\.log)(\/[\w\-\.]+)?$/,
  /^df -h$/,
  /^free -h$/,
  /^top -bn1$/,
  /^ps aux$/,
  /^netstat -tlnp$/,
  /^ss -tlnp$/,
  /^ufw (enable|disable|status|allow|deny) ?[\w\/]*$/,
  /^wget -O [\w\/\-\.]+ https:\/\/[\w\.\-\/\?=&]+$/,
  /^cat \/etc\/nginx\/sites-available\/[\w\.\-]+$/,
  /^ln -s \/etc\/nginx\/sites-available\/[\w\.\-]+ \/etc\/nginx\/sites-enabled\/[\w\.\-]+$/,
  /^rm \/etc\/nginx\/sites-enabled\/[\w\.\-]+$/,
  /^ls \/etc\/nginx\/sites-(available|enabled)$/,
  /^mkdir -p \/var\/www\/[\w\.\-]+(\/public_html)?$/,
  /^chown -R \$USER:\$USER \/var\/www\/[\w\.\-]+$/,
  /^tee \/etc\/nginx\/sites-available\/[\w\.\-]+$/,
  /^mysqldump [\w\s\-\.]+ > [\w\/\-\.]+$/,
  /^mkdir -p \/var\/backups\/tezcapanel$/,
]

function isCommandAllowed(command) {
  return ALLOWED_COMMANDS.some((pattern) => pattern.test(command.trim()))
}

function executeCommand(command, timeout = 30000) {
  return new Promise((resolve, reject) => {
    if (!isCommandAllowed(command)) {
      reject(new Error(`Comando no permitido: ${command}`))
      return
    }
    exec(command, { timeout, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && error.killed) {
        reject(new Error("Comando excedió el tiempo límite"))
        return
      }
      resolve({
        success: !error,
        stdout: stdout?.trim() ?? "",
        stderr: stderr?.trim() ?? "",
        exitCode: error?.code ?? 0,
      })
    })
  })
}

function isAuthorized(req) {
  const auth = req.headers["authorization"] ?? ""
  return auth === `Bearer ${TOKEN}`
}

function setHeaders(res) {
  res.setHeader("Content-Type", "application/json")
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000")
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type")
}

async function handleMetrics(res) {
  const [cpuData, cpuLoad, mem, disk, osInfo] = await Promise.all([
    si.cpu(),
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.osInfo(),
  ])

  const rootDisk = disk.find((d) => d.mount === "/") ?? disk[0] ?? {}

  const metrics = {
    cpu: {
      usage: parseFloat((cpuLoad.currentLoad ?? 0).toFixed(1)),
      cores: cpuData.cores ?? 1,
      model: `${cpuData.manufacturer} ${cpuData.brand}`.trim() || "Unknown",
    },
    memory: {
      total: mem.total ?? 0,
      used: mem.used ?? 0,
      free: mem.free ?? 0,
    },
    disk: {
      total: rootDisk.size ?? 0,
      used: rootDisk.used ?? 0,
      free: (rootDisk.size ?? 0) - (rootDisk.used ?? 0),
    },
    uptime: Math.floor(si.time().uptime ?? 0),
    hostname: osInfo.hostname ?? "localhost",
    os: `${osInfo.distro ?? osInfo.platform} ${osInfo.release ?? ""}`.trim(),
  }

  res.end(JSON.stringify(metrics))
}

async function handleServices(res) {
  const processes = await si.processes()
  const running = new Set(processes.list.map((p) => p.name.toLowerCase()))

  const targets = [
    { name: "nginx",   check: "nginx" },
    { name: "mysql",   check: "mysqld" },
    { name: "postfix", check: "postfix" },
    { name: "dovecot", check: "dovecot" },
    { name: "named",   check: "named" },
  ]

  const services = targets.map(({ name, check }) => ({
    name,
    status: running.has(check) ? "running" : "stopped",
  }))

  res.end(JSON.stringify(services))
}

async function handleExecute(req, res) {
  let body = ""
  req.on("data", (chunk) => { body += chunk })
  req.on("end", async () => {
    try {
      const { commands } = JSON.parse(body)

      if (!Array.isArray(commands) || commands.length === 0) {
        res.writeHead(400)
        res.end(JSON.stringify({ error: "commands array requerido" }))
        return
      }

      if (commands.length > 10) {
        res.writeHead(400)
        res.end(JSON.stringify({ error: "máximo 10 comandos por ejecución" }))
        return
      }

      const results = []

      for (const command of commands) {
        if (typeof command !== "string") {
          results.push({ command, success: false, error: "comando inválido" })
          continue
        }
        try {
          const result = await executeCommand(command)
          results.push({ command, ...result })
          if (!result.success) {
            results.push({
              command: "(detenido)",
              success: false,
              error: "Ejecución detenida por error en comando anterior",
            })
            break
          }
        } catch (err) {
          results.push({ command, success: false, error: err.message, stdout: "", stderr: "" })
          break
        }
      }

      res.end(JSON.stringify({ results }))
    } catch {
      res.writeHead(400)
      res.end(JSON.stringify({ error: "JSON inválido" }))
    }
  })
}

async function handleRestartService(name, res) {
  const allowed = ["nginx", "mysql", "mariadb", "postfix", "named", "apache2"]
  if (!allowed.includes(name)) {
    res.writeHead(400)
    res.end(JSON.stringify({ error: "service not allowed" }))
    return
  }
  try {
    const result = await executeCommand(`systemctl restart ${name}`)
    res.end(JSON.stringify(result))
  } catch (err) {
    res.writeHead(500)
    res.end(JSON.stringify({ error: err.message }))
  }
}

// --- Router HTTP ---
const server = http.createServer(async (req, res) => {
  setHeaders(res)

  if (req.method === "OPTIONS") {
    res.writeHead(204)
    res.end()
    return
  }

  if (!isAuthorized(req)) {
    res.writeHead(401)
    res.end(JSON.stringify({ error: "unauthorized" }))
    return
  }

  const url = req.url ?? "/"
  const method = req.method ?? "GET"

  try {
    if (method === "GET" && url === "/health") {
      res.end(JSON.stringify({ status: "ok", version: "0.3.0" }))
    } else if (method === "GET" && url === "/metrics") {
      await handleMetrics(res)
    } else if (method === "GET" && url === "/services") {
      await handleServices(res)
    } else if (method === "POST" && url === "/execute") {
      await handleExecute(req, res)
    } else if (method === "POST" && url.startsWith("/services/") && url.endsWith("/restart")) {
      const name = url.split("/")[2]
      await handleRestartService(name, res)
    } else if (method === "POST" && url === "/mail/provision") {
      await handleMailProvision(req, res)
    } else if (method === "POST" && url === "/dns/provision") {
      await handleDnsProvision(req, res)
    } else {
      res.writeHead(404)
      res.end(JSON.stringify({ error: "not found" }))
    }
  } catch (err) {
    console.error("Agent error:", err)
    res.writeHead(500)
    res.end(JSON.stringify({ error: "internal error" }))
  }
})

server.listen(PORT, HOST, () => {
  console.log(`✔ tezcaagent v0.3.0 escuchando en http://${HOST}:${PORT}`)
})

// --- WebSocket Terminal ---
const wss = new WebSocketServer({ 
  port: 7071, 
  host: "127.0.0.1",
  verifyClient: (info) => {
    const origin = info.origin || info.req.headers.origin
    return !origin || 
           origin === "http://localhost:3000" ||
           origin.startsWith("http://192.168.") ||
           origin.startsWith("http://127.0.0.1")
  }
})

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost")
  const token = url.searchParams.get("token")
  if (token !== TOKEN) {
    ws.close(1008, "Unauthorized")
    return
  }

 const shell = process.env.SHELL || "/bin/zsh"
let ptyProcess
try {
  ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || "/tmp",
    env: { ...process.env, TERM: "xterm-256color", LANG: "en_US.UTF-8" },
  })
} catch (err) {
  console.error("PTY error:", err.message)
  ws.send("\r\nError al iniciar terminal: " + err.message + "\r\n")
  ws.close()
  return
}

  ptyProcess.onData((data) => {
    if (ws.readyState === ws.OPEN) ws.send(data)
  })

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString())
      if (msg.type === "input") ptyProcess.write(msg.data)
      if (msg.type === "resize") ptyProcess.resize(msg.cols, msg.rows)
    } catch {
      ptyProcess.write(data.toString())
    }
  })

  ws.on("close", () => ptyProcess.kill())
  ptyProcess.onExit(() => { if (ws.readyState === ws.OPEN) ws.close() })

  console.log("✔ Terminal conectada")
})


console.log(`✔ Terminal WebSocket en ws://127.0.0.1:7071`)