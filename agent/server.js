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