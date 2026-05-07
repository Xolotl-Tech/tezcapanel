"use client"

import { useEffect, useRef, useState } from "react"
import { useChatStore } from "@/store/chat.store"
import { ChatMessageItem } from "@/components/ai/chat-message"
import { ChatInput } from "@/components/ai/chat-input"
import { ChatSuggestions } from "@/components/ai/chat-suggestions"
import { ConversationList } from "@/components/ai/conversation-list"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { History, X, Minus, Plus } from "lucide-react"
import Image from "next/image"
import type { ChatMessage, ProposedAction, InstallLog } from "@/types/ai"
import {
  createConversation,
  getConversation,
  addMessage as apiAddMessage,
  patchMessage,
  extractMetadata,
} from "@/lib/byte-api"

function generateId() {
  return Math.random().toString(36).slice(2, 11)
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

function buildScanWelcome(scan: ScanResult): { content: string; stackProposal?: { recommended: "lamp" | "lemp" } } {
  const distro = `${scan.os.distro ?? "Linux"} ${scan.os.release ?? ""}`.trim()
  const ram = fmtGB(scan.hardware.memTotal)
  const disk = fmtGB(scan.hardware.diskFree)

  if (scan.summary.hasStack) {
    const installed = Object.entries(scan.components)
      .filter(([, v]) => v.installed)
      .map(([k, v]) => `${k}${v.version ? ` ${v.version}` : ""}`)
      .join(", ")
    return {
      content:
        `👋 Soy **Byte**. Escaneé tu servidor:\n\n` +
        `**${distro}** · ${scan.hardware.cores} cores · ${ram} RAM · ${disk} libres\n\n` +
        `Detecté: ${installed}\n\n` +
        `Tu stack está listo. ¿En qué te ayudo? Puedo crear sitios, instalar WordPress, configurar correo o DNS.`,
    }
  }

  return {
    content:
      `👋 Soy **Byte**. Acabo de escanear tu servidor:\n\n` +
      `**${distro}** · ${scan.hardware.cores} cores · ${ram} RAM · ${disk} libres\n\n` +
      `No detecté un stack web instalado. Para poder crear sitios necesitamos uno. ¿Cuál prefieres?`,
    stackProposal: { recommended: scan.summary.recommended ?? "lemp" },
  }
}

const FALLBACK_WELCOME =
  "👋 ¡Hola! Soy **Byte**, tu asistente del panel.\n\n" +
  "Puedo ayudarte a configurar tu servidor, instalar WordPress, " +
  "diagnosticar problemas o explicarte cualquier parte del panel. " +
  "¿En qué te ayudo?"

type View = "chat" | "history"

export function FloatingByte() {
  const {
    currentId, setCurrentId,
    messages, isLoading,
    setMessages, addMessage, updateMessage, setLoading,
  } = useChatStore()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>("chat")
  const [hydrating, setHydrating] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Bootstrap: al abrir el chat:
  //   1) Si hay currentId, hidratamos esa conversación desde BD.
  //   2) Si no, creamos una nueva e inyectamos el welcome con scan.
  // Si el currentId guardado ya no existe (la borraron), también creamos
  // una nueva.
  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function bootstrap() {
      setHydrating(true)
      try {
        if (currentId) {
          const conv = await getConversation(currentId)
          if (cancelled) return
          if (conv) {
            setMessages(conv.messages.map((m) => ({
              ...m,
              timestamp: typeof m.timestamp === "string" ? new Date(m.timestamp) : m.timestamp,
            })))
            return
          }
          // Conversación desapareció — crear nueva
        }
        await startNewConversation(cancelled)
      } finally {
        if (!cancelled) setHydrating(false)
      }
    }

    bootstrap()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open && view === "chat") bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, open, view])

  async function startNewConversation(cancelled?: boolean) {
    const created = await createConversation()
    if (cancelled || !created) return
    setCurrentId(created.id)
    setMessages([])

    // Welcome scan-based, persistido en BD igual que cualquier mensaje
    const welcomeId = generateId()
    addMessage({ id: welcomeId, role: "assistant", content: "🔍 Escaneando tu servidor…", timestamp: new Date() })

    try {
      const r = await fetch("/api/system/scan", { signal: AbortSignal.timeout(15000) })
      const welcome = r.ok ? buildScanWelcome(await r.json() as ScanResult) : { content: FALLBACK_WELCOME }
      if (cancelled) return
      updateMessage(welcomeId, {
        content: welcome.content,
        stackProposal: welcome.stackProposal,
        timestamp: new Date(),
      })
      const saved = await apiAddMessage(created.id, {
        role: "assistant",
        content: welcome.content,
        metadata: extractMetadata({ stackProposal: welcome.stackProposal }),
      })
      if (saved) updateMessage(welcomeId, { id: saved.id })
    } catch {
      if (cancelled) return
      updateMessage(welcomeId, { content: FALLBACK_WELCOME, timestamp: new Date() })
      await apiAddMessage(created.id, { role: "assistant", content: FALLBACK_WELCOME })
    }
  }

  async function handleSelectConversation(id: string) {
    setView("chat")
    setCurrentId(id)
    setMessages([])
    setHydrating(true)
    try {
      const conv = await getConversation(id)
      if (conv) {
        setMessages(conv.messages.map((m) => ({
          ...m,
          timestamp: typeof m.timestamp === "string" ? new Date(m.timestamp) : m.timestamp,
        })))
      }
    } finally {
      setHydrating(false)
    }
  }

  async function handleNewFromHistory() {
    setView("chat")
    await startNewConversation()
  }

  async function sendMessage(content: string) {
    if (!currentId) return
    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content,
      timestamp: new Date(),
    }
    addMessage(userMessage)
    setLoading(true)

    // Persistir el mensaje del usuario (fire-and-forget pero esperamos
    // el ID real para no quedar con dos IDs distintos en cliente vs BD).
    apiAddMessage(currentId, { role: "user", content }).then((saved) => {
      if (saved) updateMessage(userMessage.id, { id: saved.id })
    })

    const assistantId = generateId()
    addMessage({ id: assistantId, role: "assistant", content: "...", timestamp: new Date() })

    try {
      const history = [...messages, userMessage].map((m) => ({
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
        const errText = "💤 Oops, parece que Byte está dormido o recibiendo una actualización. Te avisaremos cuando esté en línea."
        updateMessage(assistantId, { content: errText, timestamp: new Date() })
        const saved = await apiAddMessage(currentId, { role: "assistant", content: errText })
        if (saved) updateMessage(assistantId, { id: saved.id })
        return
      }

      const updates = { content: data.text, actions: data.actions ?? undefined, timestamp: new Date() }
      updateMessage(assistantId, updates)
      const saved = await apiAddMessage(currentId, {
        role: "assistant",
        content: data.text,
        metadata: extractMetadata({ actions: data.actions }),
      })
      if (saved) updateMessage(assistantId, { id: saved.id })
    } catch {
      const errText = "💤 Oops, parece que Byte está dormido o recibiendo una actualización. Te avisaremos cuando esté en línea."
      updateMessage(assistantId, { content: errText, timestamp: new Date() })
      await apiAddMessage(currentId, { role: "assistant", content: errText })
    } finally {
      setLoading(false)
    }
  }

  async function streamInstall(messageId: string, stack: "lamp" | "lemp") {
    if (!currentId) return
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
        await patchMessage(currentId, { messageId, metadata: extractMetadata({ installLog: log }) ?? null })
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
          if (!raw || raw.startsWith(":")) continue

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

      if (pushTimer) { clearTimeout(pushTimer); pushTimer = null }
      updateMessage(messageId, { installLog: log })
      await patchMessage(currentId, { messageId, metadata: extractMetadata({ installLog: log }) ?? null })

      const followUp = log.status === "success"
        ? `✅ Listo. **${stack.toUpperCase()}** quedó instalado y los servicios están corriendo. Ahora puedes ir a [Web](/web) y crear tu primer sitio.`
        : `⚠️ La instalación falló. Revisa el log arriba — usualmente es por falta de espacio, paquetes en conflicto o conectividad. Puedes intentar de nuevo o pedirme ayuda con el error.`

      const followId = generateId()
      addMessage({ id: followId, role: "assistant", content: followUp, timestamp: new Date() })
      const saved = await apiAddMessage(currentId, { role: "assistant", content: followUp })
      if (saved) updateMessage(followId, { id: saved.id })
    } catch (err) {
      if (pushTimer) clearTimeout(pushTimer)
      log = { ...log, status: "failed", lines: [...log.lines, `Error: ${(err as Error).message}`] }
      updateMessage(messageId, { installLog: log })
      await patchMessage(currentId, { messageId, metadata: extractMetadata({ installLog: log }) ?? null })
    }
  }

  async function handleChooseStack(messageId: string, choice: "lamp" | "lemp" | "later") {
    if (!currentId) return
    const original = messages.find((m) => m.id === messageId)
    if (!original) return

    const newProposal = { ...original.stackProposal!, chosen: choice }
    updateMessage(messageId, { stackProposal: newProposal })
    await patchMessage(currentId, {
      messageId,
      metadata: extractMetadata({ stackProposal: newProposal, installLog: original.installLog }) ?? null,
    })

    if (choice === "later") {
      const text = "Va, lo dejamos para después. Cuando quieras instalarlo me dices y volvemos a este punto. Mientras, ¿en qué más te ayudo?"
      const id = generateId()
      addMessage({ id, role: "assistant", content: text, timestamp: new Date() })
      const saved = await apiAddMessage(currentId, { role: "assistant", content: text })
      if (saved) updateMessage(id, { id: saved.id })
      return
    }

    const installMsgId = generateId()
    const installContent = `Perfecto, instalando **${choice.toUpperCase()}**. Esto puede tardar unos minutos:`
    const log: InstallLog = { stack: choice, status: "running", lines: [], stepIndex: 0 }
    addMessage({ id: installMsgId, role: "assistant", content: installContent, timestamp: new Date(), installLog: log })
    const saved = await apiAddMessage(currentId, {
      role: "assistant",
      content: installContent,
      metadata: extractMetadata({ installLog: log }),
    })
    if (saved) {
      updateMessage(installMsgId, { id: saved.id })
      streamInstall(saved.id, choice)
    } else {
      streamInstall(installMsgId, choice)
    }
  }

  async function handleConfirmActions(messageId: string, actions: ProposedAction[]) {
    if (!currentId) return
    updateMessage(messageId, { actionsExecuted: true })
    const original = messages.find((m) => m.id === messageId)
    if (original) {
      await patchMessage(currentId, {
        messageId,
        metadata: extractMetadata({ ...original, actionsExecuted: true }) ?? null,
      })
    }
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
        const text = "❌ El agente no está disponible. Verifica que `tezcaagent` esté corriendo."
        updateMessage(executingId, { content: text, timestamp: new Date() })
        await apiAddMessage(currentId, { role: "assistant", content: text })
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

      const summaryText = allSuccess
        ? `✅ Todas las acciones ejecutadas correctamente:\n\n${resultSummary}`
        : `⚠️ Algunas acciones fallaron:\n\n${resultSummary}`
      updateMessage(executingId, { content: summaryText, timestamp: new Date() })
      const saved = await apiAddMessage(currentId, { role: "assistant", content: summaryText })
      if (saved) updateMessage(executingId, { id: saved.id })

      const followUpMsg = allSuccess
        ? `Las acciones se ejecutaron exitosamente. Resultados: ${resultSummary}. Dame un resumen de lo que se hizo y próximos pasos si aplican.`
        : `Algunas acciones fallaron. Resultados: ${resultSummary}. Explícame qué salió mal y cómo solucionarlo.`
      await sendMessage(followUpMsg)
    } catch {
      const text = "❌ Error al ejecutar las acciones. Intenta de nuevo."
      updateMessage(executingId, { content: text, timestamp: new Date() })
      await apiAddMessage(currentId, { role: "assistant", content: text })
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setOpen(false)
    setView("chat")
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
          {messages.length > 0 && (
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
              {view === "chat" && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => startNewConversation()}
                    title="Nueva conversación"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => setView("history")}
                    title="Historial"
                  >
                    <History className="w-3.5 h-3.5" />
                  </Button>
                </>
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
                onClick={handleClose}
                title="Cerrar"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {view === "history" && (
            <ConversationList
              currentId={currentId}
              onSelect={handleSelectConversation}
              onNew={handleNewFromHistory}
              onBack={() => setView("chat")}
            />
          )}

          {view === "chat" && (
            <>
              <div className="flex-1 overflow-y-auto">
                {hydrating && (
                  <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                    Cargando conversación…
                  </div>
                )}
                {!hydrating && messages.length === 0 && (
                  <ChatSuggestions onSelect={sendMessage} />
                )}
                {!hydrating && messages.length > 0 && (
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
            </>
          )}
        </div>
      )}
    </>
  )
}

