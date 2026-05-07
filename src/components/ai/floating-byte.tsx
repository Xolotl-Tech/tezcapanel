"use client"

import { useEffect, useRef, useState } from "react"
import { useChatStore } from "@/store/chat.store"
import { ChatMessageItem } from "@/components/ai/chat-message"
import { ChatInput } from "@/components/ai/chat-input"
import { ChatSuggestions } from "@/components/ai/chat-suggestions"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trash2, X, Minus } from "lucide-react"
import Image from "next/image"
import type { ChatMessage, ProposedAction, InstallLog } from "@/types/ai"

function generateId() {
  return Math.random().toString(36).slice(2, 11)
}

const FALLBACK_WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "👋 ¡Hola! Soy **Byte**, tu asistente del panel.\n\n" +
    "Puedo ayudarte a configurar tu servidor, instalar WordPress, " +
    "diagnosticar problemas o explicarte cualquier parte del panel. " +
    "¿En qué te ayudo?",
  timestamp: new Date(),
}

interface ScanResult {
  os: { distro: string | null; release: string | null; family: string }
  hardware: { cores: number; memTotal: number; diskFree: number }
  components: Record<string, { installed: boolean; version: string | null }>
  summary: {
    webServer: string | null
    database: string | null
    hasStack: boolean
    recommended: "lamp" | "lemp" | null
  }
}

function fmtGB(bytes: number): string {
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + " GB"
}

function buildScanWelcome(scan: ScanResult): ChatMessage {
  const distro = `${scan.os.distro ?? "Linux"} ${scan.os.release ?? ""}`.trim()
  const ram = fmtGB(scan.hardware.memTotal)
  const disk = fmtGB(scan.hardware.diskFree)

  if (scan.summary.hasStack) {
    const installed = Object.entries(scan.components)
      .filter(([, v]) => v.installed)
      .map(([k, v]) => `${k}${v.version ? ` ${v.version}` : ""}`)
      .join(", ")
    return {
      id: "welcome",
      role: "assistant",
      content:
        `👋 Soy **Byte**. Escaneé tu servidor:\n\n` +
        `**${distro}** · ${scan.hardware.cores} cores · ${ram} RAM · ${disk} libres\n\n` +
        `Detecté: ${installed}\n\n` +
        `Tu stack está listo. ¿En qué te ayudo? Puedo crear sitios, instalar WordPress, configurar correo o DNS.`,
      timestamp: new Date(),
    }
  }

  return {
    id: "welcome",
    role: "assistant",
    content:
      `👋 Soy **Byte**. Acabo de escanear tu servidor:\n\n` +
      `**${distro}** · ${scan.hardware.cores} cores · ${ram} RAM · ${disk} libres\n\n` +
      `No detecté un stack web instalado. Para poder crear sitios necesitamos uno. ¿Cuál prefieres?`,
    timestamp: new Date(),
    stackProposal: { recommended: scan.summary.recommended ?? "lemp" },
  }
}

export function FloatingByte() {
  const { messages, isLoading, addMessage, updateMessage, setLoading, clearMessages } =
    useChatStore()
  const [open, setOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Bootstrap: al abrir el chat por primera vez (sin historial) escaneamos
  // el servidor y armamos un saludo basado en lo que detectamos. Si el scan
  // falla (agente caído, sin permisos), caemos al saludo estático.
  useEffect(() => {
    if (!open || messages.length > 0) return
    let cancelled = false

    addMessage({
      id: "welcome-scanning",
      role: "assistant",
      content: "🔍 Escaneando tu servidor…",
      timestamp: new Date(),
    })

    fetch("/api/system/scan", { signal: AbortSignal.timeout(15000) })
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) {
          updateMessage("welcome-scanning", FALLBACK_WELCOME)
          return
        }
        const scan = (await res.json()) as ScanResult
        const welcome = buildScanWelcome(scan)
        updateMessage("welcome-scanning", welcome)
      })
      .catch(() => {
        if (cancelled) return
        updateMessage("welcome-scanning", FALLBACK_WELCOME)
      })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, open])

  async function sendMessage(content: string) {
    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content,
      timestamp: new Date(),
    }
    addMessage(userMessage)
    setLoading(true)

    const assistantId = generateId()
    addMessage({ id: assistantId, role: "assistant", content: "...", timestamp: new Date() })

    try {
      const history = [...messages.filter((m) => m.id !== "welcome" && m.id !== "welcome-scanning"), userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: AbortSignal.timeout(30000),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok || typeof data.text !== "string") {
        updateMessage(assistantId, {
          content: "💤 Oops, parece que Byte está dormido o recibiendo una actualización. Te avisaremos cuando esté en línea.",
          timestamp: new Date(),
        })
        return
      }

      updateMessage(assistantId, {
        content: data.text,
        actions: data.actions ?? undefined,
        timestamp: new Date(),
      })
    } catch {
      updateMessage(assistantId, {
        content: "💤 Oops, parece que Byte está dormido o recibiendo una actualización. Te avisaremos cuando esté en línea.",
        timestamp: new Date(),
      })
    } finally {
      setLoading(false)
    }
  }

  // Streaming SSE del endpoint de instalación. El endpoint manda eventos
  // tipados (start/step/stdout/stderr/error/done) separados por `\n\n`.
  // Acumulamos chunks porque un evento puede llegar partido entre reads.
  async function streamInstall(messageId: string, stack: "lamp" | "lemp") {
    let log: InstallLog = { stack, status: "running", lines: [], stepIndex: 0 }
    updateMessage(messageId, { installLog: log })

    let pushTimer: ReturnType<typeof setTimeout> | null = null
    const flushSoon = () => {
      if (pushTimer) return
      pushTimer = setTimeout(() => {
        pushTimer = null
        updateMessage(messageId, { installLog: { ...log, lines: [...log.lines] } })
      }, 150)
    }

    try {
      const res = await fetch("/api/system/install-stack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stack }),
      })

      if (!res.ok || !res.body) {
        log = { ...log, status: "failed", lines: [...log.lines, `Error iniciando instalación (HTTP ${res.status})`] }
        updateMessage(messageId, { installLog: log })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let sep
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          if (!raw || raw.startsWith(":")) continue // heartbeat o vacío

          let event = "message"
          let dataStr = ""
          for (const line of raw.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim()
            else if (line.startsWith("data:")) dataStr += line.slice(5).trim()
          }
          let data: Record<string, unknown> = {}
          try { data = dataStr ? JSON.parse(dataStr) : {} } catch {}

          if (event === "start") {
            log = { ...log, totalSteps: data.totalSteps as number }
          } else if (event === "step") {
            log = {
              ...log,
              stepIndex: data.index as number,
              currentStep: data.label as string,
              lines: [...log.lines, `▶ ${data.label as string}`],
            }
          } else if (event === "stdout" || event === "stderr") {
            log = { ...log, lines: [...log.lines, data.line as string] }
          } else if (event === "error") {
            log = { ...log, lines: [...log.lines, `✖ Error en paso ${(data.index as number) + 1}: ${data.label as string} (exit ${data.code as number})`] }
          } else if (event === "done") {
            log = { ...log, status: data.ok ? "success" : "failed", currentStep: undefined }
          }
          flushSoon()
        }
      }

      // Flush final
      if (pushTimer) { clearTimeout(pushTimer); pushTimer = null }
      updateMessage(messageId, { installLog: log })

      if (log.status === "success") {
        addMessage({
          id: generateId(),
          role: "assistant",
          content: `✅ Listo. **${stack.toUpperCase()}** quedó instalado y los servicios están corriendo. Ahora puedes ir a [Web](/web) y crear tu primer sitio.`,
          timestamp: new Date(),
        })
      } else {
        addMessage({
          id: generateId(),
          role: "assistant",
          content: `⚠️ La instalación falló. Revisa el log arriba — usualmente es por falta de espacio, paquetes en conflicto o conectividad. Puedes intentar de nuevo o pedirme ayuda con el error.`,
          timestamp: new Date(),
        })
      }
    } catch (err) {
      if (pushTimer) clearTimeout(pushTimer)
      log = { ...log, status: "failed", lines: [...log.lines, `Error: ${(err as Error).message}`] }
      updateMessage(messageId, { installLog: log })
    }
  }

  function handleChooseStack(messageId: string, choice: "lamp" | "lemp" | "later") {
    const original = messages.find((m) => m.id === messageId)
    if (!original) return

    updateMessage(messageId, {
      stackProposal: { ...original.stackProposal!, chosen: choice },
    })

    if (choice === "later") {
      addMessage({
        id: generateId(),
        role: "assistant",
        content: "Va, lo dejamos para después. Cuando quieras instalarlo me dices y volvemos a este punto. Mientras, ¿en qué más te ayudo?",
        timestamp: new Date(),
      })
      return
    }

    const installMsgId = generateId()
    addMessage({
      id: installMsgId,
      role: "assistant",
      content: `Perfecto, instalando **${choice.toUpperCase()}**. Esto puede tardar unos minutos:`,
      timestamp: new Date(),
      installLog: { stack: choice, status: "running", lines: [], stepIndex: 0 },
    })
    streamInstall(installMsgId, choice)
  }

  async function handleConfirmActions(messageId: string, actions: ProposedAction[]) {
    updateMessage(messageId, { actionsExecuted: true })
    setLoading(true)

    const executingId = generateId()
    addMessage({
      id: executingId,
      role: "assistant",
      content: "⏳ Ejecutando acciones en el servidor...",
      timestamp: new Date(),
    })

    try {
      const res = await fetch("/api/agent/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commands: actions.map((a) => a.command),
          actionLabels: actions.map((a) => a.label),
        }),
        signal: AbortSignal.timeout(90000),
      })
      const data = await res.json()

      if (data.error === "agent_unavailable") {
        updateMessage(executingId, {
          content: "❌ El agente no está disponible. Verifica que `tezcaagent` esté corriendo.",
          timestamp: new Date(),
        })
        setLoading(false)
        return
      }

      const results = data.results ?? []
      const allSuccess = results.every((r: { success: boolean }) => r.success)
      const resultSummary = results
        .map((r: { command: string; success: boolean; stdout: string; stderr: string; error?: string }) =>
          `${r.success ? "✔" : "✖"} \`${r.command}\`${r.stdout ? `\n   ${r.stdout.slice(0, 200)}` : ""}${r.error ? `\n   Error: ${r.error}` : ""}`
        )
        .join("\n")

      updateMessage(executingId, {
        content: allSuccess
          ? `✅ Todas las acciones ejecutadas correctamente:\n\n${resultSummary}`
          : `⚠️ Algunas acciones fallaron:\n\n${resultSummary}`,
        timestamp: new Date(),
      })

      const followUpMsg = allSuccess
        ? `Las acciones se ejecutaron exitosamente. Resultados: ${resultSummary}. Dame un resumen de lo que se hizo y próximos pasos si aplican.`
        : `Algunas acciones fallaron. Resultados: ${resultSummary}. Explícame qué salió mal y cómo solucionarlo.`
      await sendMessage(followUpMsg)
    } catch {
      updateMessage(executingId, {
        content: "❌ Error al ejecutar las acciones. Intenta de nuevo.",
        timestamp: new Date(),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-black shadow-lg hover:scale-105 active:scale-95 transition flex items-center justify-center border border-border"
          aria-label="Abrir Byte"
          title="Abrir Byte AI"
        >
          <Image src="/byte-ai.webp" alt="Byte" width={32} height={32} className="w-8 h-8 object-contain" />
          {messages.filter((m) => m.id !== "welcome" && m.id !== "welcome-scanning").length > 0 && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-accent rounded-full ring-2 ring-card animate-pulse" />
          )}
        </button>
      )}

      {open && (
        <div
          className="fixed bottom-5 right-5 z-40 w-[min(420px,calc(100vw-2.5rem))] h-[min(640px,calc(100vh-2.5rem))] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
          role="dialog"
          aria-label="Byte AI"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/95">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-black border border-border flex items-center justify-center">
                <Image src="/byte-ai.webp" alt="Byte" width={24} height={24} className="w-6 h-6 object-contain" />
              </div>
              <div className="leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold">Byte AI</span>
                  <Badge variant="outline" className="border-accent/50 text-accent text-[9px] px-1 py-0 h-3.5">PRO</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">Asistente del panel</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.filter((m) => m.id !== "welcome" && m.id !== "welcome-scanning").length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => clearMessages()}
                  title="Limpiar conversación"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setOpen(false)}
                title="Minimizar"
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => { clearMessages(); setOpen(false) }}
                title="Cerrar y borrar"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <ChatSuggestions onSelect={sendMessage} />
            ) : (
              <div className="p-3 space-y-3">
                {messages.map((message) => (
                  <ChatMessageItem
                    key={message.id}
                    message={message}
                    onConfirmActions={handleConfirmActions}
                    onChooseStack={handleChooseStack}
                  />
                ))}
                {isLoading && messages[messages.length - 1]?.content === "..." && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-md bg-black border border-border flex items-center justify-center shrink-0">
                      <Image src="/byte-ai.webp" alt="Byte" width={20} height={20} className="w-5 h-5 object-contain" />
                    </div>
                    <div className="bg-card border border-border rounded-lg px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <ChatInput onSend={sendMessage} isLoading={isLoading} />
        </div>
      )}
    </>
  )
}
