"use client"

import { useEffect, useRef, useState } from "react"
import { useChatStore } from "@/store/chat.store"
import { ChatMessageItem } from "@/components/ai/chat-message"
import { ChatInput } from "@/components/ai/chat-input"
import { ChatSuggestions } from "@/components/ai/chat-suggestions"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Bot, Trash2, X, Minus } from "lucide-react"
import type { ChatMessage, ProposedAction } from "@/types/ai"

function generateId() {
  return Math.random().toString(36).slice(2, 11)
}

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "👋 ¡Hola! Soy **Byte**, tu asistente del panel.\n\n" +
    "Puedo ayudarte a configurar tu servidor, instalar WordPress, " +
    "diagnosticar problemas o explicarte cualquier parte del panel. " +
    "¿En qué te ayudo?",
  timestamp: new Date(),
}

export function FloatingByte() {
  const { messages, isLoading, addMessage, updateMessage, setLoading, clearMessages } =
    useChatStore()
  const [open, setOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Inyecta mensaje de bienvenida la primera vez que el usuario abre el chat
  // y aún no hay historial.
  useEffect(() => {
    if (open && messages.length === 0) {
      addMessage({ ...WELCOME, timestamp: new Date() })
    }
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
      // Excluir el mensaje de bienvenida del historial enviado al modelo
      // (es UI-only, no aporta contexto y desperdicia tokens).
      const history = [...messages.filter((m) => m.id !== "welcome"), userMessage].map((m) => ({
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
      {/* FAB cerrado */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 active:scale-95 transition flex items-center justify-center border border-primary/40"
          aria-label="Abrir Byte"
          title="Abrir Byte AI"
        >
          <Bot className="w-6 h-6" />
          {/* Punto pulsante cuando hay historial — invitación a continuar conversación */}
          {messages.filter((m) => m.id !== "welcome").length > 0 && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-accent rounded-full ring-2 ring-card animate-pulse" />
          )}
        </button>
      )}

      {/* Panel abierto */}
      {open && (
        <div
          className="fixed bottom-5 right-5 z-40 w-[min(420px,calc(100vw-2.5rem))] h-[min(640px,calc(100vh-2.5rem))] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
          role="dialog"
          aria-label="Byte AI"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/95">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
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
              {messages.filter((m) => m.id !== "welcome").length > 0 && (
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

          {/* Mensajes */}
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
                  />
                ))}
                {isLoading && messages[messages.length - 1]?.content === "..." && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <Bot className="w-3.5 h-3.5 text-primary" />
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

          {/* Input */}
          <ChatInput onSend={sendMessage} isLoading={isLoading} />
        </div>
      )}
    </>
  )
}
