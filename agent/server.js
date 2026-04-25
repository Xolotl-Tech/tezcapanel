const http = require("http")
const { exec } = require("child_process")
const { promisify } = require("util")
const fs = require("fs")
const path = require("path")
const { WebSocketServer } = require("ws")
const { Client: SshClient } = require("ssh2")
// node-pty prebuilt spawn-helper a veces pierde el bit de ejecución al instalarse
// y rompe pty.spawn con "posix_spawnp failed". Lo aseguramos antes de require.
try {
  const helper = path.join(
    __dirname, "..", "node_modules", "node-pty", "prebuilds",
    `${process.platform}-${process.arch}`, "spawn-helper",
  )
  if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755)
} catch {}
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

// --- Firewall (UFW) ---
function sanitizePort(p) {
  return /^(\d{1,5})(:\d{1,5})?$/.test(String(p)) ? String(p) : null
}
function sanitizeProto(p) {
  return ["tcp", "udp"].includes(String(p)) ? String(p) : null
}
function sanitizeSource(s) {
  if (!s || s === "all" || s === "any") return null
  return /^[0-9a-fA-F:.\/]+$/.test(String(s)) ? String(s) : null
}

function ufwRuleArgs(rule) {
  // rule: {strategy, direction, protocol, port, sourceIp, destPort}
  const strategy = rule.strategy === "deny" ? "deny" : "allow"
  const direction = rule.direction === "outbound" ? "out" : "in"
  const protos = rule.protocol === "both" ? ["tcp", "udp"] : [sanitizeProto(rule.protocol) || "tcp"]
  const port = sanitizePort(rule.port)
  const src = sanitizeSource(rule.sourceIp)
  return protos.map((proto) => {
    const parts = ["ufw"]
    parts.push(strategy)
    parts.push(direction)
    if (src) parts.push("from", src)
    if (port) parts.push("to", "any", "port", port.replace(":", ":"))
    parts.push("proto", proto)
    return parts.join(" ")
  })
}

function handleFirewallProvision(req, res) {
  let body = ""
  req.on("data", (c) => { body += c })
  req.on("end", async () => {
    try {
      const data = JSON.parse(body || "{}")
      const { action } = data
      if (!action) { res.writeHead(400); res.end(JSON.stringify({ error: "action requerido" })); return }

      switch (action) {
        case "status": {
          try {
            const { stdout } = await execAsync("ufw status verbose")
            const enabled = /Status:\s*active/i.test(stdout)
            res.end(JSON.stringify({ ok: true, enabled, raw: stdout }))
          } catch (e) {
            res.end(JSON.stringify({ ok: false, enabled: false, error: e.message }))
          }
          break
        }
        case "enable": {
          try { await execAsync("ufw --force enable"); res.end(JSON.stringify({ ok: true })) }
          catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message })) }
          break
        }
        case "disable": {
          try { await execAsync("ufw disable"); res.end(JSON.stringify({ ok: true })) }
          catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message })) }
          break
        }
        case "block-icmp": {
          const enabled = !!data.enabled
          try {
            const cfg = "/etc/ufw/before.rules"
            let content = fs.readFileSync(cfg, "utf8")
            const marker = "# ok icmp codes for INPUT"
            if (enabled) {
              content = content.replace(/-A ufw-before-input -p icmp --icmp-type echo-request -j ACCEPT/g,
                "-A ufw-before-input -p icmp --icmp-type echo-request -j DROP")
            } else {
              content = content.replace(/-A ufw-before-input -p icmp --icmp-type echo-request -j DROP/g,
                "-A ufw-before-input -p icmp --icmp-type echo-request -j ACCEPT")
            }
            fs.writeFileSync(cfg, content)
            await execAsync("ufw reload")
            res.end(JSON.stringify({ ok: true }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message }))
          }
          break
        }
        case "add-rule": {
          const cmds = ufwRuleArgs(data.rule || {})
          if (!cmds.length) { res.writeHead(400); res.end(JSON.stringify({ error: "regla inválida" })); return }
          try {
            for (const c of cmds) await execAsync(c)
            res.end(JSON.stringify({ ok: true }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message }))
          }
          break
        }
        case "delete-rule": {
          const cmds = ufwRuleArgs(data.rule || {}).map((c) => c.replace(/^ufw /, "ufw delete "))
          try {
            for (const c of cmds) { try { await execAsync(c) } catch {} }
            res.end(JSON.stringify({ ok: true }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message }))
          }
          break
        }
        case "listening-ports": {
          try {
            const { stdout } = await execAsync("ss -tulnH 2>/dev/null || ss -tuln")
            const ports = new Set()
            stdout.split("\n").forEach((line) => {
              const m = line.match(/:(\d+)\s/)
              if (m) ports.add(parseInt(m[1], 10))
            })
            res.end(JSON.stringify({ ok: true, ports: Array.from(ports) }))
          } catch (e) {
            res.end(JSON.stringify({ ok: false, ports: [], error: e.message }))
          }
          break
        }
        default:
          res.writeHead(400); res.end(JSON.stringify({ error: `Acción desconocida: ${action}` }))
      }
    } catch (err) {
      console.error("[firewall/provision]", err)
      res.writeHead(500); res.end(JSON.stringify({ error: err.message }))
    }
  })
}

// --- SSH ---
const SSHD_CONFIG = "/etc/ssh/sshd_config"
const AUTH_LOG_CANDIDATES = ["/var/log/auth.log", "/var/log/secure"]

function readSshdConfig() {
  try { return fs.readFileSync(SSHD_CONFIG, "utf8") } catch { return "" }
}

function getSshdValue(content, key) {
  const re = new RegExp(`^\\s*${key}\\s+(\\S+)`, "im")
  const m = content.match(re)
  return m ? m[1] : null
}

function setSshdValue(content, key, value) {
  const line = `${key} ${value}`
  const re = new RegExp(`^\\s*#?\\s*${key}\\s+.*$`, "im")
  if (re.test(content)) return content.replace(re, line)
  return content.trimEnd() + "\n" + line + "\n"
}

function findAuthLog() {
  for (const p of AUTH_LOG_CANDIDATES) {
    try { fs.accessSync(p, fs.constants.R_OK); return p } catch {}
  }
  return null
}

async function readAuthLog(limit = 200) {
  const file = findAuthLog()
  if (!file) return { entries: [], success: 0, failure: 0, successToday: 0, failureToday: 0 }
  try {
    const { stdout } = await execAsync(`tail -n 5000 ${file}`)
    const lines = stdout.split("\n").filter((l) => l.includes("sshd"))
    const entries = []
    let success = 0, failure = 0, successToday = 0, failureToday = 0
    const today = new Date().toISOString().slice(0, 10)

    for (const line of lines) {
      const acceptMatch = line.match(/Accepted (\S+) for (\S+) from (\S+) port (\d+)/)
      const failMatch = line.match(/Failed (\S+) for (invalid user )?(\S+) from (\S+) port (\d+)/)
      if (acceptMatch) {
        success++
        const ts = parseSyslogDate(line)
        if (ts && ts.slice(0, 10) === today) successToday++
        entries.push({ status: "success", method: acceptMatch[1], user: acceptMatch[2], ip: acceptMatch[3], port: acceptMatch[4], timestamp: ts })
      } else if (failMatch) {
        failure++
        const ts = parseSyslogDate(line)
        if (ts && ts.slice(0, 10) === today) failureToday++
        entries.push({ status: "failure", method: failMatch[1], user: failMatch[3], ip: failMatch[4], port: failMatch[5], timestamp: ts })
      }
    }
    return { entries: entries.slice(-limit).reverse(), success, failure, successToday, failureToday }
  } catch {
    return { entries: [], success: 0, failure: 0, successToday: 0, failureToday: 0 }
  }
}

function parseSyslogDate(line) {
  const m = line.match(/^(\w{3})\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})/)
  if (!m) return null
  const year = new Date().getFullYear()
  const d = new Date(`${m[1]} ${m[2]} ${year} ${m[3]}`)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function friendlyAgentError(msg) {
  if (!msg) return "Error desconocido"
  if (msg.includes("command not found") && msg.includes("systemctl")) {
    return "Este sistema no usa systemctl (probablemente entorno de desarrollo en macOS/Windows)"
  }
  if (msg.includes("EACCES") || msg.includes("permission denied")) {
    return "El agente no tiene permisos — necesita ejecutarse como root"
  }
  if (msg.includes("ENOENT")) {
    return "Archivo no encontrado en el sistema"
  }
  return msg
}

function handleSshProvision(req, res) {
  let body = ""
  req.on("data", (c) => { body += c })
  req.on("end", async () => {
    try {
      const data = JSON.parse(body || "{}")
      const { action } = data
      if (!action) { res.writeHead(400); res.end(JSON.stringify({ error: "action requerido" })); return }

      switch (action) {
        case "status": {
          let running = false
          try { await execAsync("systemctl is-active --quiet ssh || systemctl is-active --quiet sshd"); running = true }
          catch { running = false }
          const content = readSshdConfig()
          const config = {
            port: parseInt(getSshdValue(content, "Port") || "22", 10),
            passwordAuth: (getSshdValue(content, "PasswordAuthentication") || "yes").toLowerCase() === "yes",
            pubkeyAuth: (getSshdValue(content, "PubkeyAuthentication") || "yes").toLowerCase() === "yes",
            permitRoot: (getSshdValue(content, "PermitRootLogin") || "prohibit-password").toLowerCase(),
          }
          res.end(JSON.stringify({ ok: true, running, config }))
          break
        }
        case "enable": {
          try {
            await execAsync("systemctl enable --now ssh 2>/dev/null || systemctl enable --now sshd")
            res.end(JSON.stringify({ ok: true }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message })) }
          break
        }
        case "disable": {
          try {
            await execAsync("systemctl disable --now ssh 2>/dev/null || systemctl disable --now sshd")
            res.end(JSON.stringify({ ok: true }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message })) }
          break
        }
        case "update-config": {
          try {
            let content = readSshdConfig()
            if (!content) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: "sshd_config no accesible" })); return }
            const { port, passwordAuth, pubkeyAuth, permitRoot } = data
            if (port !== undefined) {
              const p = parseInt(port, 10)
              if (!(p >= 1 && p <= 65535)) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: "puerto inválido" })); return }
              content = setSshdValue(content, "Port", String(p))
            }
            if (typeof passwordAuth === "boolean") content = setSshdValue(content, "PasswordAuthentication", passwordAuth ? "yes" : "no")
            if (typeof pubkeyAuth === "boolean") content = setSshdValue(content, "PubkeyAuthentication", pubkeyAuth ? "yes" : "no")
            if (permitRoot) {
              const allowed = ["yes", "no", "prohibit-password", "forced-commands-only"]
              if (!allowed.includes(permitRoot)) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: "permitRoot inválido" })); return }
              content = setSshdValue(content, "PermitRootLogin", permitRoot)
            }
            fs.writeFileSync(SSHD_CONFIG, content)
            await execAsync("sshd -t")
            await execAsync("systemctl reload ssh 2>/dev/null || systemctl reload sshd")
            res.end(JSON.stringify({ ok: true }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message })) }
          break
        }
        case "reset-root-password": {
          const { password } = data
          if (!password || typeof password !== "string" || password.length < 8) {
            res.writeHead(400); res.end(JSON.stringify({ ok: false, error: "password mínimo 8 caracteres" })); return
          }
          try {
            const safe = password.replace(/'/g, "'\\''")
            await execAsync(`echo 'root:${safe}' | chpasswd`)
            res.end(JSON.stringify({ ok: true }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message })) }
          break
        }
        case "view-root-keys": {
          try {
            const keys = fs.existsSync("/root/.ssh/authorized_keys")
              ? fs.readFileSync("/root/.ssh/authorized_keys", "utf8")
              : ""
            res.end(JSON.stringify({ ok: true, keys }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message })) }
          break
        }
        case "logs": {
          const limit = Math.min(parseInt(data.limit || "200", 10), 1000)
          res.end(JSON.stringify({ ok: true, ...(await readAuthLog(limit)) }))
          break
        }
        default:
          res.writeHead(400); res.end(JSON.stringify({ error: `Acción desconocida: ${action}` }))
      }
    } catch (err) {
      console.error("[ssh/provision]", err)
      res.writeHead(500); res.end(JSON.stringify({ error: err.message }))
    }
  })
}

// --- WordPress Toolkit (wp-cli) ---
let WP_CLI = null

async function detectWpCli() {
  // 1) ya en PATH
  try { const { stdout } = await execAsync("command -v wp"); if (stdout.trim()) return stdout.trim() } catch {}
  // 2) ubicaciones comunes
  for (const p of ["/usr/local/bin/wp", "/usr/bin/wp", "/opt/wp-cli/wp"]) {
    try { fs.accessSync(p, fs.constants.X_OK); return p } catch {}
  }
  return null
}

async function ensureWpCli() {
  if (WP_CLI) {
    try { await execAsync(`${WP_CLI} --version --allow-root`); return WP_CLI } catch { WP_CLI = null }
  }
  const detected = await detectWpCli()
  if (detected) {
    WP_CLI = detected
    return WP_CLI
  }
  // intentar instalar (necesita poder escribir en alguno de estos paths)
  const targets = ["/usr/local/bin/wp", `${process.env.HOME || "/tmp"}/.local/bin/wp`]
  const tmpFile = "/tmp/wp-cli.phar"
  try {
    await execAsync(`curl -sL -o ${tmpFile} https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar`, { timeout: 60000 })
    fs.chmodSync(tmpFile, 0o755)
  } catch (e) {
    throw new Error(`No se pudo descargar wp-cli: ${e.message}`)
  }
  for (const t of targets) {
    try {
      const dir = path.dirname(t)
      fs.mkdirSync(dir, { recursive: true })
      fs.copyFileSync(tmpFile, t)
      fs.chmodSync(t, 0o755)
      WP_CLI = t
      return WP_CLI
    } catch {}
  }
  throw new Error("No se pudo instalar wp-cli en /usr/local/bin/wp ni en ~/.local/bin/wp. El agente debe correr como root o tener un wp-cli pre-instalado en PATH.")
}

async function wpRun(rootPath, args, timeout = 120000) {
  if (!WP_CLI) await ensureWpCli()
  const cmd = `${WP_CLI} --path=${rootPath} --allow-root ${args}`
  const { stdout, stderr } = await execAsync(cmd, { timeout })
  return { stdout: stdout.trim(), stderr: stderr.trim() }
}

function shellEscape(s) {
  return String(s).replace(/'/g, "'\\''")
}

function handleWp(req, res) {
  let body = ""
  req.on("data", (c) => { body += c })
  req.on("end", async () => {
    try {
      const data = JSON.parse(body || "{}")
      const { action } = data

      switch (action) {
        case "install": {
          const {
            domain, rootPath, dbName, dbUser, dbPassword, dbHost = "localhost",
            adminUser, adminPassword, adminEmail, siteTitle = domain,
            language = "es_MX", template = "blog",
          } = data

          if (!domain || !rootPath || !dbName || !dbUser || !dbPassword || !adminUser || !adminPassword || !adminEmail) {
            res.writeHead(400); res.end(JSON.stringify({ error: "faltan campos requeridos" })); return
          }

          try {
            await ensureWpCli()
            fs.mkdirSync(rootPath, { recursive: true })

            // crear DB y usuario
            const dbpEsc = shellEscape(dbPassword)
            await execAsync(`mysql -e "CREATE DATABASE IF NOT EXISTS \\\`${dbName}\\\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"`)
            await execAsync(`mysql -e "CREATE USER IF NOT EXISTS '${dbUser}'@'${dbHost}' IDENTIFIED BY '${dbpEsc}'"`)
            await execAsync(`mysql -e "GRANT ALL PRIVILEGES ON \\\`${dbName}\\\`.* TO '${dbUser}'@'${dbHost}'"`)
            await execAsync(`mysql -e "FLUSH PRIVILEGES"`)

            // descargar core
            await wpRun(rootPath, `core download --locale=${language} --force`, 180000)

            // wp-config
            await wpRun(rootPath, `config create --dbname='${dbName}' --dbuser='${dbUser}' --dbpass='${dbpEsc}' --dbhost='${dbHost}' --skip-check --force`)

            // install
            const titleEsc = shellEscape(siteTitle)
            const apEsc = shellEscape(adminPassword)
            await wpRun(rootPath, `core install --url='https://${domain}' --title='${titleEsc}' --admin_user='${adminUser}' --admin_password='${apEsc}' --admin_email='${adminEmail}' --skip-email`, 180000)

            // permisos
            try {
              await execAsync(`chown -R www-data:www-data ${rootPath}`)
            } catch {}

            // template extras
            if (template === "ecommerce") {
              await wpRun(rootPath, `plugin install woocommerce --activate`, 180000)
              await wpRun(rootPath, `theme install storefront --activate`, 120000)
            } else if (template === "landing") {
              await wpRun(rootPath, `theme install astra --activate`, 120000)
            }

            // datos finales
            const ver = await wpRun(rootPath, "core version").catch(() => ({ stdout: "" }))
            res.end(JSON.stringify({ ok: true, version: ver.stdout }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ ok: false, error: friendlyAgentError(e.stderr || e.message) }))
          }
          break
        }

        case "info": {
          const { rootPath } = data
          if (!rootPath) { res.writeHead(400); res.end(JSON.stringify({ error: "rootPath requerido" })); return }
          try {
            await ensureWpCli()
            const [ver, plugins, themes] = await Promise.all([
              wpRun(rootPath, "core version").catch(() => ({ stdout: "" })),
              wpRun(rootPath, "plugin list --status=active --format=count").catch(() => ({ stdout: "0" })),
              wpRun(rootPath, "theme list --format=count").catch(() => ({ stdout: "0" })),
            ])
            let diskMB = 0
            try {
              const { stdout } = await execAsync(`du -sm ${rootPath} | cut -f1`)
              diskMB = parseInt(stdout.trim(), 10) || 0
            } catch {}
            res.end(JSON.stringify({
              ok: true,
              version: ver.stdout,
              pluginsCount: parseInt(plugins.stdout, 10) || 0,
              themesCount: parseInt(themes.stdout, 10) || 0,
              diskUsageMB: diskMB,
            }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ ok: false, error: friendlyAgentError(e.message) }))
          }
          break
        }

        case "update-core": {
          const { rootPath } = data
          if (!rootPath) { res.writeHead(400); res.end(JSON.stringify({ error: "rootPath requerido" })); return }
          try {
            await ensureWpCli()
            await wpRun(rootPath, "core update", 180000)
            await wpRun(rootPath, "core update-db", 60000).catch(() => {})
            const ver = await wpRun(rootPath, "core version").catch(() => ({ stdout: "" }))
            res.end(JSON.stringify({ ok: true, version: ver.stdout }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ ok: false, error: friendlyAgentError(e.stderr || e.message) }))
          }
          break
        }

        case "change-password": {
          const { rootPath, user, password } = data
          if (!rootPath || !user || !password) { res.writeHead(400); res.end(JSON.stringify({ error: "campos requeridos" })); return }
          try {
            await ensureWpCli()
            const pwEsc = shellEscape(password)
            await wpRun(rootPath, `user update '${user}' --user_pass='${pwEsc}'`)
            res.end(JSON.stringify({ ok: true }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ ok: false, error: friendlyAgentError(e.stderr || e.message) }))
          }
          break
        }

        case "auto-login": {
          const { rootPath, user } = data
          if (!rootPath || !user) { res.writeHead(400); res.end(JSON.stringify({ error: "campos requeridos" })); return }
          try {
            await ensureWpCli()
            // genera URL temporal de auto-login válida 5 min usando wp eval
            const phpEval = `
              $u = get_user_by('login', '${shellEscape(user)}');
              if (!$u) { echo 'ERR_NO_USER'; return; }
              $key = wp_generate_password(20, false);
              update_user_meta($u->ID, '_tezca_login_key', $key);
              update_user_meta($u->ID, '_tezca_login_exp', time() + 300);
              echo $key;
            `.replace(/\n/g, " ")
            const { stdout } = await wpRun(rootPath, `eval "${phpEval}"`)
            if (stdout === "ERR_NO_USER") { res.writeHead(404); res.end(JSON.stringify({ ok: false, error: "Usuario no existe" })); return }
            res.end(JSON.stringify({ ok: true, key: stdout, user }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ ok: false, error: friendlyAgentError(e.stderr || e.message) }))
          }
          break
        }

        case "uninstall": {
          const { rootPath, dbName, dbUser } = data
          if (!rootPath) { res.writeHead(400); res.end(JSON.stringify({ error: "rootPath requerido" })); return }
          try {
            // borrar DB y usuario si se pasan
            if (dbName) {
              try { await execAsync(`mysql -e "DROP DATABASE IF EXISTS \\\`${dbName}\\\`"`) } catch {}
            }
            if (dbUser) {
              try { await execAsync(`mysql -e "DROP USER IF EXISTS '${dbUser}'@'localhost'"`) } catch {}
            }
            // borrar archivos
            if (rootPath.startsWith("/var/www/") || rootPath.startsWith("/www/")) {
              await execAsync(`rm -rf ${rootPath}`)
            }
            res.end(JSON.stringify({ ok: true }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ ok: false, error: friendlyAgentError(e.message) }))
          }
          break
        }

        default:
          res.writeHead(400); res.end(JSON.stringify({ error: `Acción desconocida: ${action}` }))
      }
    } catch (err) {
      console.error("[wp]", err)
      res.writeHead(500); res.end(JSON.stringify({ error: err.message }))
    }
  })
}

// --- System Hardening ---
const HARDENING_SYSCTL_FILE = "/etc/sysctl.d/99-tezcapanel-hardening.conf"

const HARDENING_ITEMS = [
  // category, id, label, description, type, sysctl key, expected, severity
  { category: "network", id: "tcp-syncookies", label: "TCP SYN Cookies", description: "Protege contra ataques SYN flood", type: "sysctl", key: "net.ipv4.tcp_syncookies", expected: "1", severity: "medium" },
  { category: "network", id: "icmp-redirects-accept", label: "Rechazar ICMP redirects", description: "Evita rutas de red maliciosas", type: "sysctl", key: "net.ipv4.conf.all.accept_redirects", expected: "0", severity: "medium" },
  { category: "network", id: "icmp-redirects-send", label: "No enviar ICMP redirects", description: "El host no debería enviar redirects", type: "sysctl", key: "net.ipv4.conf.all.send_redirects", expected: "0", severity: "low" },
  { category: "network", id: "source-routing", label: "Rechazar source routing", description: "Bloquea paquetes con rutas explícitas", type: "sysctl", key: "net.ipv4.conf.all.accept_source_route", expected: "0", severity: "medium" },
  { category: "network", id: "rpfilter", label: "Reverse Path Filtering", description: "Bloquea paquetes con dirección de origen falsa", type: "sysctl", key: "net.ipv4.conf.all.rp_filter", expected: "1", severity: "medium" },
  { category: "network", id: "log-martians", label: "Loguear paquetes marcianos", description: "Registra paquetes con dir. inválidas", type: "sysctl", key: "net.ipv4.conf.all.log_martians", expected: "1", severity: "low" },
  { category: "network", id: "icmp-broadcast", label: "Ignorar broadcasts ICMP", description: "Previene ataques smurf", type: "sysctl", key: "net.ipv4.icmp_echo_ignore_broadcasts", expected: "1", severity: "low" },
  { category: "network", id: "ip-forward", label: "Deshabilitar IP forwarding", description: "El host no es router", type: "sysctl", key: "net.ipv4.ip_forward", expected: "0", severity: "low" },
  { category: "kernel", id: "aslr", label: "ASLR (Address Space Layout Randomization)", description: "Aleatoriza direcciones de memoria", type: "sysctl", key: "kernel.randomize_va_space", expected: "2", severity: "high" },
  { category: "kernel", id: "ptrace", label: "Restringir ptrace", description: "Solo procesos propios pueden ser depurados", type: "sysctl", key: "kernel.yama.ptrace_scope", expected: "1", severity: "medium" },
  { category: "kernel", id: "dmesg", label: "Restringir dmesg", description: "Solo root lee el log del kernel", type: "sysctl", key: "kernel.dmesg_restrict", expected: "1", severity: "low" },
  { category: "kernel", id: "kptr", label: "Ocultar punteros del kernel", description: "Mitiga information disclosure", type: "sysctl", key: "kernel.kptr_restrict", expected: "2", severity: "medium" },
  { category: "kernel", id: "core-dump", label: "Deshabilitar core dumps SUID", description: "Evita dumps con info sensible", type: "sysctl", key: "fs.suid_dumpable", expected: "0", severity: "medium" },
  { category: "filesystem", id: "tmp-tmpfs", label: "/tmp como tmpfs", description: "Aísla /tmp en memoria volátil", type: "mount-check", path: "/tmp", expected: "tmpfs", severity: "low" },
  { category: "filesystem", id: "cron-allow", label: "Restringir cron a usuarios autorizados", description: "Existe /etc/cron.allow", type: "file-exists", path: "/etc/cron.allow", expected: "true", severity: "low" },
  { category: "filesystem", id: "at-allow", label: "Restringir at a usuarios autorizados", description: "Existe /etc/at.allow", type: "file-exists", path: "/etc/at.allow", expected: "true", severity: "low" },
]

async function readSysctl(key) {
  try {
    const { stdout } = await execAsync(`sysctl -n ${key}`)
    return stdout.trim()
  } catch { return null }
}

async function writeSysctlFile(items) {
  const lines = ["# Generado por tezcapanel - System Hardening"]
  for (const it of items) lines.push(`${it.key} = ${it.expected}`)
  fs.writeFileSync(HARDENING_SYSCTL_FILE, lines.join("\n") + "\n")
  await execAsync(`sysctl -p ${HARDENING_SYSCTL_FILE}`)
}

async function isMountedAs(mountpoint, fstype) {
  try {
    const { stdout } = await execAsync(`findmnt -n -o FSTYPE ${mountpoint}`)
    return stdout.trim() === fstype
  } catch { return false }
}

async function checkHardeningItem(it) {
  let current = null, ok = false
  if (it.type === "sysctl") {
    current = await readSysctl(it.key)
    ok = current !== null && current === it.expected
  } else if (it.type === "mount-check") {
    ok = await isMountedAs(it.path, it.expected)
    current = ok ? it.expected : "no"
  } else if (it.type === "file-exists") {
    ok = fs.existsSync(it.path)
    current = ok ? "presente" : "ausente"
  }
  return { ...it, current, ok }
}

function handleHardening(req, res) {
  let body = ""
  req.on("data", (c) => { body += c })
  req.on("end", async () => {
    try {
      const data = JSON.parse(body || "{}")
      const { action } = data

      switch (action) {
        case "check": {
          const items = await Promise.all(HARDENING_ITEMS.map(checkHardeningItem))
          res.end(JSON.stringify({ ok: true, items }))
          break
        }
        case "apply-all": {
          const sysctlItems = HARDENING_ITEMS.filter((i) => i.type === "sysctl")
          try {
            await writeSysctlFile(sysctlItems)
            const fixed = []
            for (const it of HARDENING_ITEMS) {
              if (it.type === "file-exists" && it.expected === "true" && !fs.existsSync(it.path)) {
                try { fs.writeFileSync(it.path, "root\n", { mode: 0o600 }); fixed.push(it.id) } catch {}
              }
            }
            res.end(JSON.stringify({ ok: true, fixed }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ ok: false, error: friendlyAgentError(e.message) }))
          }
          break
        }
        case "apply-item": {
          const item = HARDENING_ITEMS.find((i) => i.id === data.id)
          if (!item) { res.writeHead(400); res.end(JSON.stringify({ error: "id inválido" })); return }
          try {
            if (item.type === "sysctl") {
              // append/update single line in our hardening conf
              let content = ""
              try { content = fs.readFileSync(HARDENING_SYSCTL_FILE, "utf8") } catch {}
              const re = new RegExp(`^${item.key.replace(/\./g, "\\.")}\\s*=.*$`, "m")
              const line = `${item.key} = ${item.expected}`
              content = re.test(content) ? content.replace(re, line) : content.trimEnd() + "\n" + line + "\n"
              if (!content.startsWith("#")) content = "# Generado por tezcapanel\n" + content
              fs.writeFileSync(HARDENING_SYSCTL_FILE, content)
              await execAsync(`sysctl -w ${item.key}=${item.expected}`)
            } else if (item.type === "file-exists" && item.expected === "true") {
              if (!fs.existsSync(item.path)) fs.writeFileSync(item.path, "root\n", { mode: 0o600 })
            } else if (item.type === "mount-check") {
              res.writeHead(400)
              res.end(JSON.stringify({ ok: false, error: "Cambios de montaje requieren intervención manual (editar /etc/fstab)" }))
              return
            }
            res.end(JSON.stringify({ ok: true }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ ok: false, error: friendlyAgentError(e.message) }))
          }
          break
        }
        default:
          res.writeHead(400); res.end(JSON.stringify({ error: `Acción desconocida: ${action}` }))
      }
    } catch (err) {
      console.error("[hardening]", err)
      res.writeHead(500); res.end(JSON.stringify({ error: err.message }))
    }
  })
}

// --- Anti Intrusion ---
const crypto = require("crypto")
const CRITICAL_FILES = [
  "/etc/passwd", "/etc/shadow", "/etc/group", "/etc/sudoers",
  "/etc/ssh/sshd_config", "/etc/hosts", "/etc/crontab",
  "/etc/pam.d/common-password", "/etc/pam.d/sshd",
  "/etc/nginx/nginx.conf", "/etc/apache2/apache2.conf",
  "/root/.bashrc", "/root/.profile", "/root/.ssh/authorized_keys",
]
const SUSPICIOUS_DIRS = ["/tmp", "/var/tmp", "/dev/shm"]
const EXPECTED_PORTS = [22, 25, 53, 80, 110, 143, 443, 465, 587, 993, 995, 3000, 3306, 7070, 7071]

function sha256File(p) {
  try {
    const buf = fs.readFileSync(p)
    return crypto.createHash("sha256").update(buf).digest("hex")
  } catch { return null }
}

async function listSuspiciousProcesses() {
  const out = []
  try {
    const { stdout } = await execAsync("ps -eo pid,user,comm,args --no-headers")
    for (const line of stdout.split("\n")) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 4) continue
      const [pid, user, comm, ...rest] = parts
      const argsStr = rest.join(" ")
      for (const d of SUSPICIOUS_DIRS) {
        if (argsStr.includes(d + "/") || argsStr.startsWith(d)) {
          out.push({ pid, user, comm, path: argsStr.slice(0, 200) })
          break
        }
      }
    }
  } catch {}
  return out
}

async function listListeningPorts() {
  const out = []
  try {
    const { stdout } = await execAsync("ss -tulnH 2>/dev/null || ss -tuln")
    for (const line of stdout.split("\n")) {
      const m = line.match(/:(\d+)\s/)
      if (m) {
        const port = parseInt(m[1], 10)
        if (!out.some((x) => x.port === port)) {
          const procMatch = line.match(/users:\(\("([^"]+)"/)
          out.push({ port, process: procMatch ? procMatch[1] : null })
        }
      }
    }
  } catch {}
  return out
}

async function findRecentlyModified(dir, days = 1, limit = 20) {
  const out = []
  try {
    const { stdout } = await execAsync(`find ${dir} -type f -mtime -${days} 2>/dev/null | head -${limit}`)
    for (const line of stdout.split("\n")) {
      if (line.trim()) out.push(line.trim())
    }
  } catch {}
  return out
}

async function runChkrootkit() {
  try {
    await execAsync("which chkrootkit")
  } catch { return { installed: false, findings: [] } }
  try {
    const { stdout } = await execAsync("chkrootkit -q", { timeout: 120000 })
    const findings = stdout.split("\n").map((l) => l.trim()).filter((l) => l && !/not found|nothing found|not infected/i.test(l))
    return { installed: true, findings }
  } catch (e) {
    return { installed: true, findings: [], error: e.message }
  }
}

function handleIntrusion(req, res) {
  let body = ""
  req.on("data", (c) => { body += c })
  req.on("end", async () => {
    try {
      const data = JSON.parse(body || "{}")
      const { action } = data

      switch (action) {
        case "create-baseline": {
          const baseline = []
          for (const p of CRITICAL_FILES) {
            const hash = sha256File(p)
            if (!hash) continue
            let size = 0, mtime = null
            try { const st = fs.statSync(p); size = st.size; mtime = st.mtime.toISOString() } catch {}
            baseline.push({ path: p, sha256: hash, size, mtime })
          }
          res.end(JSON.stringify({ ok: true, baseline }))
          break
        }
        case "scan": {
          const start = Date.now()
          const findings = []
          const baseline = Array.isArray(data.baseline) ? data.baseline : []
          const baselineMap = new Map(baseline.map((b) => [b.path, b]))

          // File integrity
          for (const p of CRITICAL_FILES) {
            const hash = sha256File(p)
            if (!hash) continue
            const prev = baselineMap.get(p)
            if (prev && prev.sha256 !== hash) {
              findings.push({
                type: "file-change",
                severity: "high",
                title: "Archivo crítico modificado",
                description: `El archivo ${p} cambió desde el baseline`,
                path: p,
                extra: JSON.stringify({ oldHash: prev.sha256, newHash: hash }),
              })
            }
          }

          // Suspicious processes
          const procs = await listSuspiciousProcesses()
          for (const p of procs) {
            findings.push({
              type: "suspicious-process",
              severity: "high",
              title: "Proceso ejecutándose desde directorio temporal",
              description: `PID ${p.pid} (${p.user}) ${p.comm}: ${p.path}`,
              path: p.path,
              extra: JSON.stringify(p),
            })
          }

          // Unusual listening ports
          const ports = await listListeningPorts()
          for (const p of ports) {
            if (!EXPECTED_PORTS.includes(p.port) && p.port < 10000) {
              findings.push({
                type: "unusual-port",
                severity: "medium",
                title: `Puerto no esperado escuchando: ${p.port}`,
                description: `Proceso: ${p.process ?? "desconocido"}`,
                extra: JSON.stringify(p),
              })
            }
          }

          // Recent changes in /etc
          const recent = await findRecentlyModified("/etc", 1, 15)
          if (recent.length > 5) {
            findings.push({
              type: "recent-change",
              severity: "low",
              title: `${recent.length} archivos modificados en /etc (últimas 24h)`,
              description: recent.slice(0, 5).join(", ") + (recent.length > 5 ? "..." : ""),
              extra: JSON.stringify(recent),
            })
          }

          // chkrootkit
          const chk = await runChkrootkit()
          for (const f of chk.findings) {
            findings.push({
              type: "rootkit",
              severity: "high",
              title: "Posible rootkit detectado",
              description: f,
            })
          }

          res.end(JSON.stringify({
            ok: true,
            durationMs: Date.now() - start,
            findings,
            chkrootkitInstalled: chk.installed,
          }))
          break
        }
        default:
          res.writeHead(400); res.end(JSON.stringify({ error: `Acción desconocida: ${action}` }))
      }
    } catch (err) {
      console.error("[intrusion]", err)
      res.writeHead(500); res.end(JSON.stringify({ error: err.message }))
    }
  })
}

// --- Compiler access ---
const COMPILERS = [
  { key: "gcc", label: "GCC (C)", paths: ["/usr/bin/gcc"] },
  { key: "g++", label: "G++ (C++)", paths: ["/usr/bin/g++"] },
  { key: "cc", label: "CC", paths: ["/usr/bin/cc"] },
  { key: "make", label: "Make", paths: ["/usr/bin/make"] },
  { key: "as", label: "Assembler (as)", paths: ["/usr/bin/as"] },
  { key: "ld", label: "Linker (ld)", paths: ["/usr/bin/ld"] },
  { key: "python2", label: "Python 2", paths: ["/usr/bin/python2", "/usr/bin/python2.7"] },
  { key: "python3", label: "Python 3", paths: ["/usr/bin/python3"] },
  { key: "perl", label: "Perl", paths: ["/usr/bin/perl"] },
  { key: "ruby", label: "Ruby", paths: ["/usr/bin/ruby"] },
  { key: "nasm", label: "NASM", paths: ["/usr/bin/nasm"] },
  { key: "wget", label: "wget", paths: ["/usr/bin/wget"] },
  { key: "curl", label: "curl", paths: ["/usr/bin/curl"] },
]

function resolveCompilerPath(paths) {
  for (const p of paths) { try { fs.accessSync(p, fs.constants.F_OK); return p } catch {} }
  return null
}

function compilerAccessible(filePath) {
  try {
    const st = fs.statSync(filePath)
    // accessible by "others" if mode & 0o005 (read or exec for others)
    return (st.mode & 0o005) !== 0
  } catch { return false }
}

function handleCompilerAccess(req, res) {
  let body = ""
  req.on("data", (c) => { body += c })
  req.on("end", async () => {
    try {
      const data = JSON.parse(body || "{}")
      const { action } = data
      switch (action) {
        case "status": {
          const list = COMPILERS.map((c) => {
            const p = resolveCompilerPath(c.paths)
            return {
              key: c.key,
              label: c.label,
              installed: !!p,
              path: p,
              accessible: p ? compilerAccessible(p) : false,
            }
          })
          res.end(JSON.stringify({ ok: true, compilers: list }))
          break
        }
        case "toggle": {
          const { key, enabled } = data
          const compiler = COMPILERS.find((c) => c.key === key)
          if (!compiler) { res.writeHead(400); res.end(JSON.stringify({ error: "compilador desconocido" })); return }
          const p = resolveCompilerPath(compiler.paths)
          if (!p) { res.writeHead(404); res.end(JSON.stringify({ ok: false, error: "no instalado" })); return }
          try {
            // enabled: rwxr-xr-x (0755), disabled: rwx------ (0700) — root-only
            const mode = enabled ? 0o755 : 0o700
            fs.chmodSync(p, mode)
            res.end(JSON.stringify({ ok: true }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ ok: false, error: friendlyAgentError(e.message) }))
          }
          break
        }
        default:
          res.writeHead(400); res.end(JSON.stringify({ error: `Acción desconocida: ${action}` }))
      }
    } catch (err) {
      console.error("[compiler-access]", err)
      res.writeHead(500); res.end(JSON.stringify({ error: err.message }))
    }
  })
}

// --- Brute force (fail2ban) ---
const JAIL_LOCAL = "/etc/fail2ban/jail.local"
const KNOWN_JAILS = ["sshd", "apache-auth", "nginx-http-auth", "postfix", "dovecot", "vsftpd", "mysqld-auth"]

async function fail2banStatus() {
  let installed = false, running = false, jails = []
  try { await execAsync("which fail2ban-client"); installed = true } catch {}
  if (!installed) return { installed, running, jails }
  try { await execAsync("systemctl is-active --quiet fail2ban"); running = true } catch {}
  if (running) {
    try {
      const { stdout } = await execAsync("fail2ban-client status")
      const m = stdout.match(/Jail list:\s*(.+)/)
      if (m) jails = m[1].split(",").map((s) => s.trim()).filter(Boolean)
    } catch {}
  }
  return { installed, running, jails }
}

async function jailInfo(name) {
  try {
    const { stdout } = await execAsync(`fail2ban-client status ${name}`)
    const failed = parseInt((stdout.match(/Currently failed:\s*(\d+)/) || [])[1] || "0", 10)
    const totalFailed = parseInt((stdout.match(/Total failed:\s*(\d+)/) || [])[1] || "0", 10)
    const banned = parseInt((stdout.match(/Currently banned:\s*(\d+)/) || [])[1] || "0", 10)
    const totalBanned = parseInt((stdout.match(/Total banned:\s*(\d+)/) || [])[1] || "0", 10)
    const ipsMatch = stdout.match(/Banned IP list:\s*(.*)/)
    const bannedIps = ipsMatch ? ipsMatch[1].trim().split(/\s+/).filter(Boolean) : []
    return { name, failed, totalFailed, banned, totalBanned, bannedIps }
  } catch (e) {
    return { name, error: e.message }
  }
}

function readJailLocal() {
  try { return fs.readFileSync(JAIL_LOCAL, "utf8") } catch { return "" }
}

function writeJailLocal(content) {
  fs.writeFileSync(JAIL_LOCAL, content)
}

function getIniSection(content, section) {
  const re = new RegExp(`\\[${section}\\]([\\s\\S]*?)(?=\\n\\[|$)`, "i")
  return (content.match(re) || [null, ""])[1] || ""
}

function setIniKey(content, section, key, value) {
  const re = new RegExp(`\\[${section}\\]([\\s\\S]*?)(?=\\n\\[|$)`, "i")
  const sectionMatch = content.match(re)
  const line = `${key} = ${value}`
  if (!sectionMatch) {
    return content.trimEnd() + `\n\n[${section}]\n${line}\n`
  }
  const body = sectionMatch[1]
  const keyRe = new RegExp(`^\\s*${key}\\s*=.*$`, "m")
  const newBody = keyRe.test(body) ? body.replace(keyRe, line) : body.trimEnd() + "\n" + line + "\n"
  return content.replace(re, `[${section}]${newBody}`)
}

function handleBruteForce(req, res) {
  let body = ""
  req.on("data", (c) => { body += c })
  req.on("end", async () => {
    try {
      const data = JSON.parse(body || "{}")
      const { action } = data

      switch (action) {
        case "status": {
          const st = await fail2banStatus()
          const jails = await Promise.all(st.jails.map(jailInfo))
          let global = {}
          const content = readJailLocal()
          if (content) {
            const def = getIniSection(content, "DEFAULT")
            global = {
              bantime: (def.match(/^\s*bantime\s*=\s*(\S+)/m) || [])[1] || "10m",
              findtime: (def.match(/^\s*findtime\s*=\s*(\S+)/m) || [])[1] || "10m",
              maxretry: (def.match(/^\s*maxretry\s*=\s*(\d+)/m) || [])[1] || "5",
            }
          }
          res.end(JSON.stringify({ ok: true, ...st, jails, global }))
          break
        }
        case "ban": {
          const { jail, ip } = data
          if (!jail || !ip) { res.writeHead(400); res.end(JSON.stringify({ error: "jail e ip requeridos" })); return }
          try {
            await execAsync(`fail2ban-client set ${jail} banip ${ip}`)
            res.end(JSON.stringify({ ok: true }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: friendlyAgentError(e.message) })) }
          break
        }
        case "unban": {
          const { jail, ip } = data
          if (!jail || !ip) { res.writeHead(400); res.end(JSON.stringify({ error: "jail e ip requeridos" })); return }
          try {
            await execAsync(`fail2ban-client set ${jail} unbanip ${ip}`)
            res.end(JSON.stringify({ ok: true }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: friendlyAgentError(e.message) })) }
          break
        }
        case "update-jail": {
          const { jail, enabled, maxretry, bantime, findtime } = data
          if (!jail) { res.writeHead(400); res.end(JSON.stringify({ error: "jail requerido" })); return }
          try {
            let content = readJailLocal() || "[DEFAULT]\nignoreip = 127.0.0.1/8 ::1\n\n"
            if (typeof enabled === "boolean") content = setIniKey(content, jail, "enabled", enabled ? "true" : "false")
            if (maxretry !== undefined) content = setIniKey(content, jail, "maxretry", String(parseInt(maxretry, 10) || 5))
            if (bantime !== undefined) content = setIniKey(content, jail, "bantime", String(bantime))
            if (findtime !== undefined) content = setIniKey(content, jail, "findtime", String(findtime))
            writeJailLocal(content)
            await execAsync("fail2ban-client reload")
            res.end(JSON.stringify({ ok: true }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: friendlyAgentError(e.message) })) }
          break
        }
        case "update-global": {
          const { maxretry, bantime, findtime } = data
          try {
            let content = readJailLocal() || "[DEFAULT]\nignoreip = 127.0.0.1/8 ::1\n\n"
            if (maxretry !== undefined) content = setIniKey(content, "DEFAULT", "maxretry", String(parseInt(maxretry, 10) || 5))
            if (bantime !== undefined) content = setIniKey(content, "DEFAULT", "bantime", String(bantime))
            if (findtime !== undefined) content = setIniKey(content, "DEFAULT", "findtime", String(findtime))
            writeJailLocal(content)
            await execAsync("fail2ban-client reload")
            res.end(JSON.stringify({ ok: true }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: friendlyAgentError(e.message) })) }
          break
        }
        case "known-jails":
          res.end(JSON.stringify({ ok: true, jails: KNOWN_JAILS }))
          break
        default:
          res.writeHead(400); res.end(JSON.stringify({ error: `Acción desconocida: ${action}` }))
      }
    } catch (err) {
      console.error("[brute-force]", err)
      res.writeHead(500); res.end(JSON.stringify({ error: err.message }))
    }
  })
}

// --- Website security scanner ---
const SENSITIVE_PROBES = [
  ".env", ".env.local", ".env.production",
  ".git/HEAD", ".git/config",
  ".DS_Store",
  "wp-config.php.bak", "wp-config.php.old", "wp-config.old",
  "config.php.bak", "config.bak",
  "backup.sql", "db.sql", "dump.sql",
  "phpinfo.php", "info.php",
  "composer.lock", "yarn.lock", "package-lock.json",
  ".htaccess.bak",
  "readme.html", "license.txt",
]
const WEBSHELL_PATTERNS = [
  /eval\s*\(\s*\$_(POST|GET|REQUEST|COOKIE)/,
  /base64_decode\s*\(\s*\$_(POST|GET|REQUEST|COOKIE)/,
  /assert\s*\(\s*\$_(POST|GET|REQUEST)/,
  /(system|shell_exec|passthru|popen)\s*\(\s*\$_(POST|GET|REQUEST|COOKIE)/,
  /preg_replace\s*\(\s*["'][^"']*\/e["']/,
  /create_function\s*\(/,
]
const BACKUP_EXTS = [".bak", ".old", ".swp", ".tmp", ".orig", "~"]

const ATTACK_PATTERNS = {
  xss: /(<script|javascript:|onerror=|onload=|%3Cscript)/i,
  sql: /(union\s+select|'\s*or\s+1=1|information_schema|--|;drop\s+table|xp_cmdshell)/i,
  php: /(\.php\?.*=(http|ftp):\/\/|eval\(|base64_decode|allow_url_include)/i,
  malicious: /(\.\.\/\.\.\/|etc\/passwd|\/proc\/self|boot\.ini|wp-login\.php)/i,
}

async function fetchHeaders(url, timeout = 5000) {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith("https") ? require("https") : require("http")
      const req = lib.request(url, { method: "HEAD", timeout }, (res) => {
        resolve({ status: res.statusCode, headers: res.headers })
      })
      req.on("error", () => resolve({ status: 0, headers: {} }))
      req.on("timeout", () => { req.destroy(); resolve({ status: 0, headers: {} }) })
      req.end()
    } catch { resolve({ status: 0, headers: {} }) }
  })
}

async function probeUrl(url, timeout = 5000) {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith("https") ? require("https") : require("http")
      const req = lib.request(url, { method: "GET", timeout }, (res) => {
        let body = ""
        res.on("data", (c) => { if (body.length < 500) body += c.toString() })
        res.on("end", () => resolve({ status: res.statusCode, body }))
      })
      req.on("error", () => resolve({ status: 0, body: "" }))
      req.on("timeout", () => { req.destroy(); resolve({ status: 0, body: "" }) })
      req.end()
    } catch { resolve({ status: 0, body: "" }) }
  })
}

function walkFiles(dir, maxDepth = 6, filter = () => true) {
  const out = []
  function walk(d, depth) {
    if (depth > maxDepth) return
    let entries
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue
      const p = path.join(d, ent.name)
      if (ent.isDirectory()) {
        if (["node_modules", "vendor", "cache", "uploads"].includes(ent.name)) continue
        walk(p, depth + 1)
      } else if (ent.isFile() && filter(p)) {
        out.push(p)
        if (out.length > 5000) return
      }
    }
  }
  walk(dir, 0)
  return out
}

async function scanWebsite(site) {
  const risks = { config: [], "file-leak": [], webshell: [], backup: [], "weak-password": [], logs: [] }
  const { domain, rootPath } = site

  // --- Configuración: cabeceras de seguridad ---
  if (domain) {
    const url = `http://${domain}`
    const { status, headers } = await fetchHeaders(url)
    if (status > 0) {
      const expected = {
        "x-frame-options": "X-Frame-Options (clickjacking)",
        "x-content-type-options": "X-Content-Type-Options (MIME sniffing)",
        "strict-transport-security": "Strict-Transport-Security (HSTS)",
        "content-security-policy": "Content-Security-Policy (XSS)",
        "referrer-policy": "Referrer-Policy",
      }
      for (const [h, label] of Object.entries(expected)) {
        if (!headers[h]) {
          risks.config.push({
            severity: "medium",
            title: `Falta cabecera ${label}`,
            description: `El sitio ${domain} no envía la cabecera ${h}`,
            affectedPath: url,
          })
        }
      }
      if (headers.server) {
        risks.config.push({
          severity: "low",
          title: "Cabecera Server expone tecnología",
          description: `El sitio expone: ${headers.server}`,
          affectedPath: url,
        })
      }
    }
  }

  // --- File leak: probar paths sensibles ---
  if (domain) {
    for (const probe of SENSITIVE_PROBES) {
      const url = `http://${domain}/${probe}`
      const { status, body } = await probeUrl(url, 3000)
      if (status === 200 && body.length > 0) {
        risks["file-leak"].push({
          severity: "high",
          title: `Archivo sensible expuesto: ${probe}`,
          description: `Accesible públicamente vía ${url}`,
          affectedPath: url,
        })
      }
    }
  }

  // --- Webshell scan y backup files ---
  if (rootPath && fs.existsSync(rootPath)) {
    const phpFiles = walkFiles(rootPath, 6, (p) => p.endsWith(".php"))
    for (const f of phpFiles.slice(0, 500)) {
      try {
        const stat = fs.statSync(f)
        if (stat.size > 1024 * 1024) continue
        const content = fs.readFileSync(f, "utf8")
        for (const pat of WEBSHELL_PATTERNS) {
          if (pat.test(content)) {
            risks.webshell.push({
              severity: "high",
              title: "Posible webshell detectada",
              description: `Patrón sospechoso (${pat.source.slice(0, 40)}...)`,
              affectedPath: f,
            })
            break
          }
        }
      } catch {}
    }

    const backupFiles = walkFiles(rootPath, 6, (p) => BACKUP_EXTS.some((e) => p.endsWith(e)))
    for (const f of backupFiles.slice(0, 50)) {
      risks.backup.push({
        severity: "medium",
        title: "Archivo de backup expuesto",
        description: `Archivo con extensión de respaldo en directorio web`,
        affectedPath: f,
      })
    }
  }

  return { domain, risks }
}

async function analyzeLogs(logPaths) {
  const counts = { xss: 0, sql: 0, php: 0, malicious: 0 }
  const ipVisits = new Map()
  const logRisks = []
  for (const p of logPaths) {
    if (!fs.existsSync(p)) continue
    let content = ""
    try { content = fs.readFileSync(p, "utf8").slice(-500000) } catch { continue }
    const lines = content.split("\n").slice(-2000)
    for (const line of lines) {
      const ipMatch = line.match(/^(\d+\.\d+\.\d+\.\d+)/)
      if (ipMatch) ipVisits.set(ipMatch[1], (ipVisits.get(ipMatch[1]) || 0) + 1)
      const pathMatch = line.match(/"(GET|POST|PUT|DELETE|HEAD)\s+([^\s"]+)/)
      if (!pathMatch) continue
      const url = decodeURIComponent(pathMatch[2])
      for (const [kind, re] of Object.entries(ATTACK_PATTERNS)) {
        if (re.test(url)) { counts[kind]++; break }
      }
    }
  }
  const topIps = [...ipVisits.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([ip, visits]) => ({ ip, visits }))
  if (counts.xss + counts.sql + counts.php + counts.malicious > 0) {
    logRisks.push({
      severity: "high",
      title: "Patrones de ataque detectados en logs",
      description: `XSS:${counts.xss} SQLi:${counts.sql} PHP:${counts.php} Malicioso:${counts.malicious}`,
    })
  }
  return { counts, topIps, logRisks }
}

function handleWebsiteScan(req, res) {
  let body = ""
  req.on("data", (c) => { body += c })
  req.on("end", async () => {
    const start = Date.now()
    try {
      const data = JSON.parse(body || "{}")
      const websites = Array.isArray(data.websites) ? data.websites : []
      const logPaths = Array.isArray(data.logPaths) ? data.logPaths : []

      const allRisks = { config: [], "file-leak": [], webshell: [], backup: [], "weak-password": [], logs: [] }
      for (const site of websites) {
        const { risks } = await scanWebsite(site)
        for (const k of Object.keys(allRisks)) {
          allRisks[k].push(...risks[k].map((r) => ({ ...r, domain: site.domain })))
        }
      }
      const { counts, topIps, logRisks } = await analyzeLogs(logPaths)
      allRisks.logs.push(...logRisks)

      const total = Object.values(allRisks).reduce((s, arr) => s + arr.length, 0)
      const score = Math.max(0, 100 - Math.min(100, total * 3 + counts.sql * 4 + counts.xss * 3 + counts.malicious * 2 + counts.php * 3))

      res.end(JSON.stringify({
        ok: true,
        durationMs: Date.now() - start,
        score,
        risks: allRisks,
        counts,
        topIps,
      }))
    } catch (err) {
      console.error("[website/scan]", err)
      res.writeHead(500); res.end(JSON.stringify({ ok: false, error: err.message }))
    }
  })
}

// --- Server security actions ---
function handleServerSecurityAction(req, res) {
  let body = ""
  req.on("data", (c) => { body += c })
  req.on("end", async () => {
    try {
      const data = JSON.parse(body || "{}")
      const { action } = data
      if (!action) { res.writeHead(400); res.end(JSON.stringify({ error: "action requerido" })); return }

      switch (action) {
        case "set-password-length": {
          const min = parseInt(data.min, 10)
          if (!(min >= 1 && min <= 64)) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: "longitud inválida" })); return }
          try {
            let content = fs.readFileSync("/etc/login.defs", "utf8")
            content = /^\s*PASS_MIN_LEN/m.test(content)
              ? content.replace(/^\s*PASS_MIN_LEN\s+\d+/m, `PASS_MIN_LEN ${min}`)
              : content.trimEnd() + `\nPASS_MIN_LEN ${min}\n`
            fs.writeFileSync("/etc/login.defs", content)
            // sync con pwquality también
            try {
              let pq = fs.existsSync("/etc/security/pwquality.conf")
                ? fs.readFileSync("/etc/security/pwquality.conf", "utf8") : ""
              pq = /^\s*minlen/m.test(pq)
                ? pq.replace(/^\s*minlen\s*=\s*\d+/m, `minlen = ${min}`)
                : pq.trimEnd() + `\nminlen = ${min}\n`
              fs.writeFileSync("/etc/security/pwquality.conf", pq)
            } catch {}
            res.end(JSON.stringify({ ok: true }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: friendlyAgentError(e.message) })) }
          break
        }
        case "set-password-complexity": {
          // level: 0-4 = number of classes required (digit/upper/lower/other)
          const level = Math.max(0, Math.min(4, parseInt(data.level, 10) || 0))
          try {
            let pq = fs.existsSync("/etc/security/pwquality.conf")
              ? fs.readFileSync("/etc/security/pwquality.conf", "utf8") : ""
            const fields = { dcredit: -1, ucredit: -1, lcredit: -1, ocredit: -1, minclass: level }
            if (level === 0) {
              Object.keys(fields).forEach((k) => { fields[k] = 0 })
            } else {
              // activar "level" clases
              const keys = ["dcredit", "ucredit", "lcredit", "ocredit"]
              keys.forEach((k, i) => { fields[k] = i < level ? -1 : 0 })
            }
            for (const [k, v] of Object.entries(fields)) {
              const re = new RegExp(`^\\s*#?\\s*${k}\\s*=\\s*-?\\d+`, "m")
              const line = `${k} = ${v}`
              pq = re.test(pq) ? pq.replace(re, line) : pq.trimEnd() + "\n" + line + "\n"
            }
            fs.writeFileSync("/etc/security/pwquality.conf", pq)
            res.end(JSON.stringify({ ok: true }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: friendlyAgentError(e.message) })) }
          break
        }
        case "install-fail2ban": {
          try {
            // detectar gestor de paquetes
            let cmd = "apt-get install -y fail2ban"
            try { await execAsync("which apt-get") } catch {
              try { await execAsync("which dnf"); cmd = "dnf install -y fail2ban" }
              catch { cmd = "yum install -y fail2ban" }
            }
            await execAsync(cmd, { timeout: 120000 })
            await execAsync("systemctl enable --now fail2ban")
            res.end(JSON.stringify({ ok: true }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: friendlyAgentError(e.message) })) }
          break
        }
        case "fail2ban-toggle": {
          const enabled = !!data.enabled
          try {
            if (enabled) {
              await execAsync("systemctl enable --now fail2ban")
            } else {
              await execAsync("systemctl disable --now fail2ban")
            }
            res.end(JSON.stringify({ ok: true }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: friendlyAgentError(e.message) })) }
          break
        }
        default:
          res.writeHead(400); res.end(JSON.stringify({ error: `Acción desconocida: ${action}` }))
      }
    } catch (err) {
      console.error("[server-security/action]", err)
      res.writeHead(500); res.end(JSON.stringify({ error: err.message }))
    }
  })
}

// --- Server security checks ---
function handleServerSecurityCheck(req, res) {
  req.on("end", async () => {})
  ;(async () => {
    try {
      const content = readSshdConfig()
      const sshPort = parseInt(getSshdValue(content, "Port") || "22", 10)
      const permitRoot = (getSshdValue(content, "PermitRootLogin") || "prohibit-password").toLowerCase()

      // Password length from /etc/login.defs
      let passMinLen = 0
      try {
        const defs = fs.readFileSync("/etc/login.defs", "utf8")
        const m = defs.match(/^\s*PASS_MIN_LEN\s+(\d+)/m)
        if (m) passMinLen = parseInt(m[1], 10)
      } catch {}

      // Password complexity: look for pam_pwquality.so in common-password or password-auth
      let pamComplexity = false
      let pamMinLen = 0
      const pamFiles = ["/etc/pam.d/common-password", "/etc/pam.d/password-auth", "/etc/pam.d/system-auth"]
      for (const f of pamFiles) {
        try {
          const c = fs.readFileSync(f, "utf8")
          if (/pam_pwquality\.so|pam_cracklib\.so/.test(c)) {
            pamComplexity = true
            const mm = c.match(/minlen=(\d+)/)
            if (mm) pamMinLen = Math.max(pamMinLen, parseInt(mm[1], 10))
          }
        } catch {}
      }
      try {
        const pq = fs.readFileSync("/etc/security/pwquality.conf", "utf8")
        const mm = pq.match(/^\s*minlen\s*=\s*(\d+)/m)
        if (mm) pamMinLen = Math.max(pamMinLen, parseInt(mm[1], 10))
        if (/^\s*(dcredit|ucredit|lcredit|ocredit)\s*=\s*-?\d+/m.test(pq)) pamComplexity = true
      } catch {}

      // Fail2ban
      let fail2banActive = false
      try {
        await execAsync("systemctl is-active --quiet fail2ban")
        fail2banActive = true
      } catch {}
      let fail2banInstalled = false
      try {
        await execAsync("which fail2ban-client")
        fail2banInstalled = true
      } catch {}

      res.end(JSON.stringify({
        ok: true,
        sshPort,
        permitRoot,
        passMinLen: Math.max(passMinLen, pamMinLen),
        pamComplexity,
        fail2banActive,
        fail2banInstalled,
      }))
    } catch (err) {
      res.writeHead(500)
      res.end(JSON.stringify({ ok: false, error: err.message }))
    }
  })()
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
    } else if (method === "POST" && url === "/firewall/provision") {
      await handleFirewallProvision(req, res)
    } else if (method === "POST" && url === "/ssh/provision") {
      await handleSshProvision(req, res)
    } else if (method === "GET" && url === "/server-security/check") {
      handleServerSecurityCheck(req, res)
    } else if (method === "POST" && url === "/server-security/action") {
      handleServerSecurityAction(req, res)
    } else if (method === "POST" && url === "/website-security/scan") {
      handleWebsiteScan(req, res)
    } else if (method === "POST" && url === "/brute-force/action") {
      handleBruteForce(req, res)
    } else if (method === "POST" && url === "/compiler-access/action") {
      handleCompilerAccess(req, res)
    } else if (method === "POST" && url === "/intrusion/action") {
      handleIntrusion(req, res)
    } else if (method === "POST" && url === "/hardening/action") {
      handleHardening(req, res)
    } else if (method === "POST" && url === "/wp/action") {
      handleWp(req, res)
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
  host: "0.0.0.0",
})

function startLocalPty(ws) {
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
    if (ws.readyState === ws.OPEN) ws.send("\r\nError al iniciar terminal: " + err.message + "\r\n")
    ws.close()
    return
  }

  ptyProcess.onData((data) => { if (ws.readyState === ws.OPEN) ws.send(data) })

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString())
      if (msg.type === "input") ptyProcess.write(msg.data)
      else if (msg.type === "resize") ptyProcess.resize(msg.cols, msg.rows)
    } catch {
      ptyProcess.write(data.toString())
    }
  })

  ws.on("close", () => { try { ptyProcess.kill() } catch {} })
  ptyProcess.onExit(() => { if (ws.readyState === ws.OPEN) ws.close() })

  console.log("✔ Terminal local conectada")
}

function startSshSession(ws, opts) {
  const conn = new SshClient()
  let stream

  const sendErr = (msg) => {
    if (ws.readyState === ws.OPEN) ws.send(`\r\n\x1b[31m${msg}\x1b[0m\r\n`)
  }

  conn.on("ready", () => {
    conn.shell({ term: "xterm-256color", cols: opts.cols || 80, rows: opts.rows || 24 }, (err, s) => {
      if (err) {
        sendErr(`SSH shell error: ${err.message}`)
        try { conn.end() } catch {}
        ws.close()
        return
      }
      stream = s
      stream.on("data", (d) => { if (ws.readyState === ws.OPEN) ws.send(d.toString("utf-8")) })
      stream.stderr.on("data", (d) => { if (ws.readyState === ws.OPEN) ws.send(d.toString("utf-8")) })
      stream.on("close", () => { try { conn.end() } catch {}; ws.close() })
    })
  })

  conn.on("error", (err) => {
    sendErr(`SSH error: ${err.message}`)
    ws.close()
  })

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString())
      if (msg.type === "input" && stream) stream.write(msg.data)
      else if (msg.type === "resize" && stream) stream.setWindow(msg.rows, msg.cols, 0, 0)
    } catch {
      if (stream) stream.write(data.toString())
    }
  })

  ws.on("close", () => { try { conn.end() } catch {} })

  try {
    conn.connect({
      host: String(opts.host).trim(),
      port: Number(opts.port) || 22,
      username: String(opts.username).trim(),
      ...(opts.authType === "key"
        ? { privateKey: String(opts.privateKey || "") }
        : { password: String(opts.password || "") }),
      readyTimeout: 12000,
      keepaliveInterval: 30000,
    })
  } catch (err) {
    sendErr(`SSH connect error: ${err.message}`)
    ws.close()
  }

  console.log(`✔ Terminal SSH conectada → ${opts.username}@${opts.host}:${opts.port}`)
}

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost")
  const token = url.searchParams.get("token")
  if (token !== TOKEN) {
    ws.close(1008, "Unauthorized")
    return
  }

  const target = (url.searchParams.get("target") || "local").toLowerCase()

  if (target === "local") {
    startLocalPty(ws)
    return
  }

  if (target === "ssh") {
    // Espera primer mensaje JSON con credenciales: { type: "init", host, port, username, authType, password|privateKey, cols, rows }
    const onFirst = (data) => {
      ws.off("message", onFirst)
      let init
      try { init = JSON.parse(data.toString()) } catch {
        if (ws.readyState === ws.OPEN) ws.send("\r\n\x1b[31mInit inválido\x1b[0m\r\n")
        ws.close()
        return
      }
      if (init.type !== "init" || !init.host || !init.username) {
        if (ws.readyState === ws.OPEN) ws.send("\r\n\x1b[31mInit incompleto\x1b[0m\r\n")
        ws.close()
        return
      }
      startSshSession(ws, init)
    }
    ws.on("message", onFirst)
    return
  }

  ws.close(1003, "unsupported target")
})


console.log(`✔ Terminal WebSocket en ws://127.0.0.1:7071`)