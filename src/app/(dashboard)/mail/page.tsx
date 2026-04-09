"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { CreateDomainDialog } from "@/components/mail/create-domain-dialog"
import { CreateAccountDialog } from "@/components/mail/create-account-dialog"
import { CreateAliasDialog } from "@/components/mail/create-alias-dialog"
import { ChangeAccountPasswordDialog } from "@/components/mail/change-account-password-dialog"
import {
  Mail, Plus, RefreshCw, Trash2, Globe, AtSign,
  KeyRound, CheckCircle2, XCircle, Key, AlertTriangle, Copy, X,
} from "lucide-react"

async function safeJson(res: Response) {
  const text = await res.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { return {} }
}

interface MailDomain {
  id: string
  domain: string
  spf: string | null
  dkim: string | null
  dmarc: string | null
  active: boolean
  createdAt: string
}

interface MailAccount {
  id: string
  email: string
  quotaMB: number
  active: boolean
  createdAt: string
}

interface MailAlias {
  id: string
  source: string
  destination: string
  active: boolean
  createdAt: string
}

type Tab = "accounts" | "aliases" | "domains"

export default function MailPage() {
  const [tab, setTab] = useState<Tab>("accounts")

  const [domains, setDomains] = useState<MailDomain[]>([])
  const [accounts, setAccounts] = useState<MailAccount[]>([])
  const [aliases, setAliases] = useState<MailAlias[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [showCreateDomain, setShowCreateDomain] = useState(false)
  const [showCreateAccount, setShowCreateAccount] = useState(false)
  const [showCreateAlias, setShowCreateAlias] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<MailAccount | null>(null)

  // DKIM dialog
  const [dkimDomain, setDkimDomain] = useState<MailDomain | null>(null)
  const [dkimLoading, setDkimLoading] = useState(false)
  const [dkimResult, setDkimResult] = useState<string | null>(null)

  // Provision warning
  const [provisionWarn, setProvisionWarn] = useState("")

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [dRes, aRes, alRes] = await Promise.all([
        fetch("/api/mail/domains"),
        fetch("/api/mail/accounts"),
        fetch("/api/mail/aliases"),
      ])
      const [dData, aData, alData] = await Promise.all([dRes.json(), aRes.json(), alRes.json()])
      setDomains(dData.domains ?? [])
      setAccounts(aData.accounts ?? [])
      setAliases(alData.aliases ?? [])
    } catch {
      setError("Error al cargar los datos de correo")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  function warnIfNotProvisioned(json: { provisioned?: boolean; provisionError?: string }) {
    if (json.provisioned === false) {
      setProvisionWarn(
        json.provisionError === "Agent no disponible"
          ? "Guardado en DB. El agent no está disponible — Postfix/Dovecot no fue actualizado."
          : `Guardado en DB, pero el agent reportó: ${json.provisionError}`
      )
    }
  }

  async function handleCreateDomain(data: { domain: string }) {
    const res = await fetch("/api/mail/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    const json = await safeJson(res)
    if (!res.ok) throw new Error(json.error ?? "Error al crear dominio")
    warnIfNotProvisioned(json)
    await fetchAll()
  }

  async function handleDeleteDomain(id: string, domain: string) {
    if (!confirm(`¿Eliminar el dominio ${domain}?`)) return
    await fetch(`/api/mail/domains/${id}`, { method: "DELETE" })
    await fetchAll()
  }

  async function handleGenDkim(domain: MailDomain) {
    setDkimDomain(domain)
    setDkimResult(domain.dkim)
    if (domain.dkim) return // ya tiene clave guardada, solo mostrar
    setDkimLoading(true)
    try {
      const res = await fetch(`/api/mail/domains/${domain.id}/dkim`, { method: "POST" })
      const json = await safeJson(res)
      if (!res.ok) {
        setDkimResult(`Error: ${json.error ?? "No se pudo generar"}`)
      } else {
        setDkimResult(json.public_key ?? "")
        await fetchAll()
      }
    } finally {
      setDkimLoading(false)
    }
  }

  async function handleCreateAccount(data: { email: string; password: string; quotaMB: number }) {
    const res = await fetch("/api/mail/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    const json = await safeJson(res)
    if (!res.ok) throw new Error(json.error ?? "Error al crear cuenta")
    warnIfNotProvisioned(json)
    await fetchAll()
  }

  async function handleDeleteAccount(id: string, email: string) {
    if (!confirm(`¿Eliminar la cuenta ${email}?`)) return
    await fetch(`/api/mail/accounts/${id}`, { method: "DELETE" })
    await fetchAll()
  }

  async function handleChangePassword(id: string, password: string) {
    const res = await fetch(`/api/mail/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
    const json = await safeJson(res)
    if (!res.ok) throw new Error(json.error ?? "Error al cambiar contraseña")
    await fetchAll()
  }

  async function handleCreateAlias(data: { source: string; destination: string }) {
    const res = await fetch("/api/mail/aliases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    const json = await safeJson(res)
    if (!res.ok) throw new Error(json.error ?? "Error al crear alias")
    warnIfNotProvisioned(json)
    await fetchAll()
  }

  async function handleDeleteAlias(id: string, source: string) {
    if (!confirm(`¿Eliminar el alias ${source}?`)) return
    await fetch(`/api/mail/aliases/${id}`, { method: "DELETE" })
    await fetchAll()
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "accounts", label: "Cuentas", count: accounts.length },
    { key: "aliases",  label: "Aliases",  count: aliases.length },
    { key: "domains",  label: "Dominios", count: domains.length },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Correo electrónico</h1>
          <p className="text-sm text-muted-foreground mt-1">Postfix / Dovecot</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {tab === "accounts" && (
            <Button size="sm" className="bg-primary hover:bg-primary/90 h-8" onClick={() => setShowCreateAccount(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />Nueva cuenta
            </Button>
          )}
          {tab === "aliases" && (
            <Button size="sm" className="bg-primary hover:bg-primary/90 h-8" onClick={() => setShowCreateAlias(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />Nuevo alias
            </Button>
          )}
          {tab === "domains" && (
            <Button size="sm" className="bg-primary hover:bg-primary/90 h-8" onClick={() => setShowCreateDomain(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />Agregar dominio
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <p className="text-xs text-muted-foreground">Cuentas</p>
          <p className="text-2xl font-semibold mt-1">{accounts.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <p className="text-xs text-muted-foreground">Aliases</p>
          <p className="text-2xl font-semibold mt-1">{aliases.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <p className="text-xs text-muted-foreground">Dominios</p>
          <p className="text-2xl font-semibold mt-1">{domains.length}</p>
        </div>
      </div>

      {/* Error global */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Provision warning */}
      {provisionWarn && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-600">{provisionWarn}</p>
          </div>
          <button onClick={() => setProvisionWarn("")} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
              tab === t.key ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-4 h-12 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* ── Cuentas ────────────────────────────────────────── */}
          {tab === "accounts" && (
            accounts.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-12 flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-muted border border-border flex items-center justify-center">
                  <Mail className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">No hay cuentas de correo</p>
                  <p className="text-xs text-muted-foreground mt-1">Crea tu primera cuenta con el botón &quot;Nueva cuenta&quot;</p>
                </div>
                <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => setShowCreateAccount(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />Crear primera cuenta
                </Button>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Cuenta</th>
                      <th className="text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Cuota</th>
                      <th className="text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Estado</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {accounts.map((acc) => (
                      <tr key={acc.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                              <AtSign className="w-3 h-3 text-primary" />
                            </div>
                            <span className="text-sm font-mono font-medium">{acc.email}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="text-xs text-muted-foreground">{acc.quotaMB} MB</span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {acc.active ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600">
                              <CheckCircle2 className="w-3 h-3" />Activa
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <XCircle className="w-3 h-3" />Inactiva
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-accent" title="Cambiar contraseña" onClick={() => setSelectedAccount(acc)}>
                              <KeyRound className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" title="Eliminar" onClick={() => handleDeleteAccount(acc.id, acc.email)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ── Aliases ────────────────────────────────────────── */}
          {tab === "aliases" && (
            aliases.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-12 flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-muted border border-border flex items-center justify-center">
                  <AtSign className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">No hay aliases</p>
                  <p className="text-xs text-muted-foreground mt-1">Los aliases reenvían correos de una dirección a otra</p>
                </div>
                <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => setShowCreateAlias(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />Crear primer alias
                </Button>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Origen</th>
                      <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Destino</th>
                      <th className="text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Estado</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {aliases.map((alias) => (
                      <tr key={alias.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-5 py-3.5">
                          <span className="text-sm font-mono font-medium">{alias.source}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-sm font-mono text-muted-foreground">{alias.destination}</span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {alias.active ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600">
                              <CheckCircle2 className="w-3 h-3" />Activo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <XCircle className="w-3 h-3" />Inactivo
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" title="Eliminar" onClick={() => handleDeleteAlias(alias.id, alias.source)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ── Dominios ───────────────────────────────────────── */}
          {tab === "domains" && (
            domains.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-12 flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-muted border border-border flex items-center justify-center">
                  <Globe className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">No hay dominios configurados</p>
                  <p className="text-xs text-muted-foreground mt-1">Agrega un dominio para empezar a crear cuentas de correo</p>
                </div>
                <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => setShowCreateDomain(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />Agregar primer dominio
                </Button>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Dominio</th>
                      <th className="text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">SPF</th>
                      <th className="text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">DKIM</th>
                      <th className="text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">DMARC</th>
                      <th className="text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Estado</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {domains.map((d) => (
                      <tr key={d.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                              <Globe className="w-3 h-3 text-primary" />
                            </div>
                            <span className="text-sm font-mono font-medium">{d.domain}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {d.spf ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mx-auto" /> : <span className="text-xs text-muted-foreground">–</span>}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {d.dkim ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mx-auto" /> : <span className="text-xs text-muted-foreground">–</span>}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {d.dmarc ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mx-auto" /> : <span className="text-xs text-muted-foreground">–</span>}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {d.active ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600">
                              <CheckCircle2 className="w-3 h-3" />Activo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <XCircle className="w-3 h-3" />Inactivo
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-primary"
                              title="Generar / ver clave DKIM"
                              onClick={() => handleGenDkim(d)}
                            >
                              <Key className="w-3 h-3 mr-1" />DKIM
                            </Button>
                            <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" title="Eliminar" onClick={() => handleDeleteDomain(d.id, d.domain)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}

      {/* ── DKIM Dialog ─────────────────────────────────────────── */}
      {dkimDomain && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-sm font-semibold">DKIM — {dkimDomain.domain}</h2>
              <button onClick={() => { setDkimDomain(null); setDkimResult(null) }} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {dkimLoading ? (
                <p className="text-sm text-muted-foreground animate-pulse">Generando clave DKIM con opendkim-genkey…</p>
              ) : dkimResult ? (
                <>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Registro DNS a agregar</p>
                    <div className="relative">
                      <pre className="bg-muted rounded-lg p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all">{dkimResult}</pre>
                      <button
                        onClick={() => navigator.clipboard.writeText(dkimResult ?? "")}
                        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
                        title="Copiar"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2.5 space-y-1">
                    <p className="text-xs font-medium text-blue-600">Configuración DNS requerida</p>
                    <p className="text-xs text-muted-foreground">
                      Agrega este registro TXT con nombre <span className="font-mono text-foreground">mail._domainkey.{dkimDomain.domain}</span> en tu proveedor DNS.
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-destructive">No se pudo generar la clave. Verifica que <span className="font-mono">opendkim-genkey</span> está instalado.</p>
              )}
            </div>
            <div className="flex justify-end px-6 py-4 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => { setDkimDomain(null); setDkimResult(null) }}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Otros Dialogs ───────────────────────────────────────── */}
      {showCreateDomain && (
        <CreateDomainDialog onClose={() => setShowCreateDomain(false)} onCreate={handleCreateDomain} />
      )}
      {showCreateAccount && (
        <CreateAccountDialog onClose={() => setShowCreateAccount(false)} onCreate={handleCreateAccount} />
      )}
      {showCreateAlias && (
        <CreateAliasDialog onClose={() => setShowCreateAlias(false)} onCreate={handleCreateAlias} />
      )}
      {selectedAccount && (
        <ChangeAccountPasswordDialog
          account={selectedAccount}
          onClose={() => setSelectedAccount(null)}
          onSave={handleChangePassword}
        />
      )}
    </div>
  )
}
