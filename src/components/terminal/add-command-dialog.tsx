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

export function AddCommandDialog({ open, onClose, onSaved }: Props) {
  const [name, setName] = useState("")
  const [command, setCommand] = useState("")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")

  const reset = () => { setName(""); setCommand(""); setErr("") }

  const onConfirm = async () => {
    setErr(""); setSaving(true)
    try {
      const r = await fetch("/api/terminal/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, command }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || "Error al guardar")
      }
      reset(); onSaved(); onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error")
    } finally { setSaving(false) }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) onClose() }}
      title="Add command"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={onConfirm}
            disabled={saving || !name || !command}
            className="bg-[#10b77f] text-white hover:bg-[#0fa371]"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            Confirm
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[110px_1fr] items-center gap-3">
          <Label className="text-right text-sm">Name</Label>
          <Input
            placeholder="Please enter command name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-[110px_1fr] items-start gap-3">
          <Label className="text-right text-sm pt-2">Content</Label>
          <Textarea
            rows={6}
            placeholder="Please enter command content"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className="font-mono text-xs"
          />
        </div>

        {err && <p className="text-xs text-destructive text-right">{err}</p>}
      </div>
    </Modal>
  )
}
