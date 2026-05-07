"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react"

interface DnsCheck {
  status: "ok" | "mismatch" | "unresolved"
  resolved: string[]
  serverIps: string[]
}

interface Props {
  domain: string
  /** ms de debounce antes de consultar DNS. Default 600. */
  debounceMs?: number
}

// Avisa en vivo si el dominio resuelve a este servidor. Pensado para
// formularios de creación de sitios — desincentiva crear vhosts para
// dominios que el usuario nunca podrá abrir desde su navegador.
export function DomainDnsHint({ domain, debounceMs = 600 }: Props) {
  const [check, setCheck] = useState<DnsCheck | null>(null)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setCheck(null)
    if (!domain || !/^[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(domain)) return

    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await fetch(`/api/web/dns-check?domain=${encodeURIComponent(domain)}`)
        if (r.ok) setCheck(await r.json())
      } catch {
        // Silencioso: el hint es informativo, no bloquea creación
      } finally {
        setLoading(false)
      }
    }, debounceMs)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [domain, debounceMs])

  if (!domain) return null

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        Verificando DNS…
      </div>
    )
  }

  if (!check) return null

  if (check.status === "ok") {
    return (
      <div className="flex items-start gap-1.5 text-xs text-primary leading-snug">
        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>Apunta a este servidor — listo para crear.</span>
      </div>
    )
  }

  if (check.status === "mismatch") {
    const serverIp = check.serverIps[check.serverIps.length - 1] ?? "?"
    return (
      <div className="flex items-start gap-1.5 text-xs text-accent leading-snug">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          Resuelve a <strong className="font-mono">{check.resolved.join(", ")}</strong>,
          pero este servidor es <strong className="font-mono">{serverIp}</strong>.
          Actualiza el A record o el sitio no será accesible.
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-1.5 text-xs text-destructive leading-snug">
      <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span>
        No resuelve. Si es un dominio real, agrega un A record apuntando a este servidor.
        Si es para pruebas locales, agrégalo a <code className="font-mono">/etc/hosts</code> de tu máquina.
      </span>
    </div>
  )
}
