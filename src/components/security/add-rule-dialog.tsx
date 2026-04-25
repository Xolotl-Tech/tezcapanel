"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { X } from "lucide-react"

async function safeJson(res: Response) {
  const text = await res.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { return {} }
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
  kind: "port" | "ip" | "forward" | "area"
}

export function AddRuleDialog({ open, onClose, onCreated, kind }: Props) {
  const { toast } = useToast()
  const [protocol, setProtocol] = useState<"tcp" | "udp" | "both">("tcp")
  const [port, setPort] = useState("")
  const [sourceIp, setSourceIp] = useState("")
  const [destPort, setDestPort] = useState("")
  const [country, setCountry] = useState("")
  const [direction, setDirection] = useState<"inbound" | "outbound">("inbound")
  const [strategy, setStrategy] = useState<"allow" | "deny">("allow")
  const [remark, setRemark] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  if (!open) return null

  async function submit() {
    setError("")
    setLoading(true)
    try {
      const res = await fetch("/api/security/firewall/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          protocol,
          port: port.trim() || null,
          sourceIp: sourceIp.trim() || null,
          destPort: destPort.trim() || null,
          country: country.trim() || null,
          direction,
          strategy,
          remark: remark.trim() || null,
        }),
      })
      const data = await safeJson(res)
      if (!res.ok) { setError(data.error || "Error al crear"); return }
      if (data.warning) toast({ title: "Regla creada con advertencia", description: data.warning })
      onCreated()
      setPort(""); setSourceIp(""); setDestPort(""); setCountry(""); setRemark("")
    } finally {
      setLoading(false)
    }
  }

  const titles = {
    port: "Nueva regla de puerto",
    ip: "Nueva regla de IP",
    forward: "Nuevo port forward",
    area: "Nueva regla por país",
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">{titles[kind]}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {(kind === "port" || kind === "forward") && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Protocolo</Label>
                <div className="flex gap-2">
                  {(["tcp", "udp", "both"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProtocol(p)}
                      className={`px-3 py-1.5 text-xs rounded-md border ${
                        protocol === p ? "bg-accent/10 border-accent text-accent" : "border-border"
                      }`}
                    >
                      {p.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Puerto o rango</Label>
                <Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="80 o 39000:40000" className="font-mono text-sm" />
              </div>
            </>
          )}

          {kind === "forward" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Puerto destino</Label>
              <Input value={destPort} onChange={(e) => setDestPort(e.target.value)} placeholder="8080" className="font-mono text-sm" />
            </div>
          )}

          {(kind === "port" || kind === "ip") && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                IP origen <span className="text-muted-foreground">(opcional, vacío = todas)</span>
              </Label>
              <Input value={sourceIp} onChange={(e) => setSourceIp(e.target.value)} placeholder="192.168.1.0/24" className="font-mono text-sm" />
            </div>
          )}

          {kind === "area" && (
            <div className="space-y-1.5">
              <Label className="text-xs">País (código ISO)</Label>
              <Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} placeholder="MX, US, CN..." className="font-mono text-sm" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Dirección</Label>
              <div className="flex gap-2">
                {(["inbound", "outbound"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDirection(d)}
                    className={`flex-1 px-3 py-1.5 text-xs rounded-md border ${
                      direction === d ? "bg-accent/10 border-accent text-accent" : "border-border"
                    }`}
                  >
                    {d === "inbound" ? "Entrante" : "Saliente"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Estrategia</Label>
              <div className="flex gap-2">
                {(["allow", "deny"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStrategy(s)}
                    className={`flex-1 px-3 py-1.5 text-xs rounded-md border ${
                      strategy === s ? "bg-accent/10 border-accent text-accent" : "border-border"
                    }`}
                  >
                    {s === "allow" ? "Permitir" : "Denegar"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Nota <span className="text-muted-foreground">(opcional)</span></Label>
            <Input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="SSH, HTTP..." className="text-sm" />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={loading} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {loading ? "Creando..." : "Crear regla"}
          </Button>
        </div>
      </div>
    </div>
  )
}
