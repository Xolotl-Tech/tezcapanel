"use client"

import { useRef, useEffect } from "react"
import { useChatStore } from "@/store/chat.store"
import { ChatMessageItem } from "@/components/ai/chat-message"
import { ChatInput } from "@/components/ai/chat-input"
import { ChatSuggestions } from "@/components/ai/chat-suggestions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bot, Trash2 } from "lucide-react"
import type { ChatMessage, ProposedAction } from "@/types/ai"

function generateId() {
  return Math.random().toString(36).slice(2, 11)
}

export default function AIPage() {
  const { messages, isLoading, addMessage, updateMessage, setLoading, clearMessages } =
    useChatStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

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
    addMessage({
      id: assistantId,
      role: "assistant",
      content: "...",
      timestamp: new Date(),
    })

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

      const data = await res.json()

      updateMessage(assistantId, {
        content: data.text,
        actions: data.actions ?? undefined,
        timestamp: new Date(),
      })
    } catch {
      updateMessage(assistantId, {
        content: "Lo siento, ocurrió un error al conectar con la IA. Intenta de nuevo.",
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

      // Construir reporte de resultados
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

      // Pedir a Byte que interprete los resultados
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
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">Byte AI</h1>
              <Badge variant="outline" className="border-accent/50 text-accent text-[10px]">PRO</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Asistente inteligente de servidor</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-8"
            onClick={clearMessages}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Limpiar
          </Button>
        )}
      </div>

      <div className="flex-1 bg-background border border-border rounded-lg overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <ChatSuggestions onSelect={sendMessage} />
          ) : (
            <div className="p-4 space-y-4">
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

        <ChatInput onSend={sendMessage} isLoading={isLoading} />
      </div>
    </div>
  )
}