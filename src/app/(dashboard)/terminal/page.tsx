"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { TerminalEmulator, type RemoteTarget, type TerminalApi } from "@/components/terminal/terminal-emulator"
import { Badge } from "@/components/ui/badge"
import { Terminal, Wifi, WifiOff, X } from "lucide-react"
import { AddServerDialog } from "@/components/terminal/add-server-dialog"
import { ServerListPanel, type SshServerEntry } from "@/components/terminal/server-list"
import { AddCommandDialog } from "@/components/terminal/add-command-dialog"
import { CommandListPanel, type SshCommandEntry } from "@/components/terminal/command-list"

interface Tab {
  key: string
  label: string
  target: "local" | "ssh"
  remote?: RemoteTarget
}

export default function TerminalPage() {
  const [token, setToken] = useState("")
  const [loading, setLoading] = useState(true)
  const [tabs, setTabs] = useState<Tab[]>([{ key: "local", label: "Local server", target: "local" }])
  const [activeKey, setActiveKey] = useState("local")
  const [servers, setServers] = useState<SshServerEntry[]>([])
  const [commands, setCommands] = useState<SshCommandEntry[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [addCmdOpen, setAddCmdOpen] = useState(false)
  const [sideTab, setSideTab] = useState<"servers" | "commands">("servers")
  const apisRef = useRef<Map<string, TerminalApi>>(new Map())

  useEffect(() => {
    fetch("/api/terminal/token")
      .then((r) => r.json())
      .then((data) => { setToken(data.token ?? ""); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const loadServers = useCallback(async () => {
    const r = await fetch("/api/terminal/servers")
    if (!r.ok) return
    const data = await r.json()
    setServers(data.servers || [])
  }, [])

  useEffect(() => { loadServers() }, [loadServers])

  const loadCommands = useCallback(async () => {
    const r = await fetch("/api/terminal/commands")
    if (!r.ok) return
    const data = await r.json()
    setCommands(data.commands || [])
  }, [])

  useEffect(() => { loadCommands() }, [loadCommands])

  const onRunCommand = (c: SshCommandEntry) => {
    const api = apisRef.current.get(activeKey)
    if (!api) return
    const text = c.command.endsWith("\n") ? c.command : c.command + "\n"
    api.sendInput(text)
  }

  const onDeleteCommand = async (id: string) => {
    if (!confirm("¿Eliminar este comando?")) return
    await fetch(`/api/terminal/commands/${id}`, { method: "DELETE" })
    loadCommands()
  }

  const onConnect = async (s: SshServerEntry) => {
    const r = await fetch(`/api/terminal/servers/${s.id}`)
    if (!r.ok) return
    const { server } = await r.json()
    const key = `ssh:${server.id}:${Date.now()}`
    const tab: Tab = {
      key,
      label: server.remarks || `${server.username}@${server.host}`,
      target: "ssh",
      remote: {
        host: server.host,
        port: server.port,
        username: server.username,
        authType: server.authType,
        password: server.password ?? undefined,
        privateKey: server.privateKey ?? undefined,
      },
    }
    setTabs((prev) => [...prev, tab])
    setActiveKey(key)
  }

  const onDeleteServer = async (id: string) => {
    if (!confirm("¿Eliminar este servidor?")) return
    await fetch(`/api/terminal/servers/${id}`, { method: "DELETE" })
    loadServers()
  }

  const closeTab = (key: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.key !== key)
      if (activeKey === key) setActiveKey(next[next.length - 1]?.key || "local")
      return next.length ? next : [{ key: "local", label: "Local server", target: "local" }]
    })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center">
            <Terminal className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Terminal</h1>
            <p className="text-xs text-muted-foreground">Acceso directo al servidor</p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={token
            ? "border-primary/50 text-primary text-[10px]"
            : "border-border text-muted-foreground text-[10px]"}
        >
          {token
            ? <><Wifi className="w-3 h-3 mr-1" />Conectado</>
            : <><WifiOff className="w-3 h-3 mr-1" />Desconectado</>}
        </Badge>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[1fr_280px] gap-4">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1 border-b border-border pb-2 mb-2 overflow-x-auto">
            {tabs.map((t) => (
              <div
                key={t.key}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs cursor-pointer ${
                  activeKey === t.key ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"
                }`}
                onClick={() => setActiveKey(t.key)}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${activeKey === t.key ? "bg-[#10b77f]" : "bg-muted-foreground/40"}`} />
                <span className="whitespace-nowrap">{t.label}</span>
                {t.key !== "local" && (
                  <button
                    className="ml-1 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); closeTab(t.key) }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex-1 min-h-0">
            {loading ? (
              <div className="w-full h-full rounded-lg bg-[#0d0d0d] border border-border flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Iniciando terminal...</p>
              </div>
            ) : (
              tabs.map((t) => (
                <div key={t.key} className={`w-full h-full ${activeKey === t.key ? "block" : "hidden"}`}>
                  <TerminalEmulator
                    token={token}
                    target={t.target}
                    remote={t.remote}
                    onReady={(api) => apisRef.current.set(t.key, api)}
                    onClosed={() => { if (t.key !== "local") setTimeout(() => closeTab(t.key), 600) }}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        <aside className="flex flex-col min-h-0">
          <div className="flex items-center gap-1 border-b border-border mb-3">
            <button
              className={`px-3 py-2 text-xs ${sideTab === "servers" ? "text-foreground border-b-2 border-[#10b77f]" : "text-muted-foreground"}`}
              onClick={() => setSideTab("servers")}
            >Server List</button>
            <button
              className={`px-3 py-2 text-xs ${sideTab === "commands" ? "text-foreground border-b-2 border-[#10b77f]" : "text-muted-foreground"}`}
              onClick={() => setSideTab("commands")}
            >Commands</button>
          </div>

          {sideTab === "servers" ? (
            <ServerListPanel
              servers={servers}
              onConnect={onConnect}
              onDelete={onDeleteServer}
              onAdd={() => setAddOpen(true)}
            />
          ) : (
            <CommandListPanel
              commands={commands}
              onRun={onRunCommand}
              onDelete={onDeleteCommand}
              onAdd={() => setAddCmdOpen(true)}
            />
          )}
        </aside>
      </div>

      <AddServerDialog open={addOpen} onClose={() => setAddOpen(false)} onSaved={loadServers} />
      <AddCommandDialog open={addCmdOpen} onClose={() => setAddCmdOpen(false)} onSaved={loadCommands} />
    </div>
  )
}
