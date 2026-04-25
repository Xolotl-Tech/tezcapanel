"use client"

import { useState } from "react"
import { Modal } from "./modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

type Auth = "password" | "key"

export function AddServerDialog({ open, onClose, onSaved }: Props) {
  const [host, setHost] = useState("")
  const [port, setPort] = useState("22")
  const [username, setUsername] = useState("root")
  const [authType, setAuthType] = useState<Auth>("password")
  const [password, setPassword] = useState("")
  const [privateKey, setPrivateKey] = useState("")
  const [remarks, setRemarks] = useState("")
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const reset = () => {
    setHost(""); setPort("22"); setUsername("root"); setAuthType("password")
    setPassword(""); setPrivateKey(""); setRemarks(""); setTestMsg(null)
  }

  const payload = () => ({
    host, port: Number(port) || 22, username, authType,
    password: authType === "password" ? password : undefined,
    privateKey: authType === "key" ? privateKey : undefined,
    remarks,
  })

  const onTest = async () => {
    setTestMsg(null); setTesting(true)
    try {
      const r = await fetch("/api/terminal/servers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      })
      const data = await r.json()
      setTestMsg(data.ok
        ? { ok: true, text: "Conexión exitosa" }
        : { ok: false, text: data.error || "Falló la conexión" })
    } catch (e) {
      setTestMsg({ ok: false, text: e instanceof Error ? e.message : "Error" })
    } finally { setTesting(false) }
  }

  const onConfirm = async () => {
    setSaving(true)
    try {
      const r = await fetch("/api/terminal/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Error al guardar") }
      reset(); onSaved(); onClose()
    } catch (e) {
      setTestMsg({ ok: false, text: e instanceof Error ? e.message : "Error" })
    } finally { setSaving(false) }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) onClose() }}
      title="Add server"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={onConfirm}
            disabled={saving || !host || !username}
            className="bg-[#10b77f] text-white hover:bg-[#0fa371]"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            Confirm
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[110px_1fr_90px] items-center gap-3">
          <Label className="text-right text-sm">Server IP</Label>
          <Input placeholder="Please enter server IP" value={host} onChange={(e) => setHost(e.target.value)} />
          <Input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} />
        </div>

        <div className="grid grid-cols-[110px_1fr] items-center gap-3">
          <Label className="text-right text-sm">SSH account</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>

        <div className="grid grid-cols-[110px_1fr] items-center gap-3">
          <Label className="text-right text-sm">Verification</Label>
          <div className="inline-flex rounded-md border border-border overflow-hidden w-fit">
            <button
              type="button"
              onClick={() => setAuthType("password")}
              className={`px-4 py-1.5 text-xs ${authType === "password" ? "bg-[#10b77f] text-white" : "bg-transparent text-muted-foreground"}`}
            >Password</button>
            <button
              type="button"
              onClick={() => setAuthType("key")}
              className={`px-4 py-1.5 text-xs ${authType === "key" ? "bg-[#10b77f] text-white" : "bg-transparent text-muted-foreground"}`}
            >Private key</button>
          </div>
        </div>

        {authType === "password" ? (
          <div className="grid grid-cols-[110px_1fr] items-center gap-3">
            <Label className="text-right text-sm">Password</Label>
            <Input
              type="password"
              placeholder="Please enter SSH password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        ) : (
          <div className="grid grid-cols-[110px_1fr] items-start gap-3">
            <Label className="text-right text-sm pt-2">Private key</Label>
            <Textarea
              rows={5}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
        )}

        <div className="grid grid-cols-[110px_1fr] items-center gap-3">
          <Label className="text-right text-sm">Remarks</Label>
          <Input
            placeholder="Please enter remarks, can be blank"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-[110px_1fr] items-center gap-3">
          <div />
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={onTest} disabled={testing || !host || !username}>
              {testing && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Test connection
            </Button>
            {testMsg && (
              <span className={`text-xs ${testMsg.ok ? "text-[#10b77f]" : "text-destructive"}`}>
                {testMsg.text}
              </span>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
