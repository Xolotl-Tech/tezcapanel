"use client"

import { cn } from "@/lib/utils"
import type { ChatMessage, ProposedAction } from "@/types/ai"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bot, User, CheckCircle2, Terminal } from "lucide-react"

interface ChatMessageProps {
  message: ChatMessage
  onConfirmActions?: (messageId: string, actions: ProposedAction[]) => void
}

const riskConfig = {
  low:    { label: "Bajo riesgo",  className: "border-primary/50 text-primary" },
  medium: { label: "Riesgo medio", className: "border-accent/50 text-accent" },
  high:   { label: "Alto riesgo",  className: "border-destructive/50 text-destructive" },
}

function renderMarkdown(raw: string): string {
  const escaped = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
  return escaped
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.*?)`/g, '<code class="bg-muted px-1 rounded text-xs">$1</code>')
    .replace(/\n/g, "<br/>")
}

export function ChatMessageItem({ message, onConfirmActions }: ChatMessageProps) {
  const isUser = message.role === "user"

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div className={cn(
        "w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5",
        isUser
          ? "bg-secondary border border-border"
          : "bg-primary/10 border border-primary/20"
      )}>
        {isUser
          ? <User className="w-3.5 h-3.5 text-muted-foreground" />
          : <Bot className="w-3.5 h-3.5 text-primary" />
        }
      </div>

      {/* Contenido */}
      <div className={cn("flex flex-col gap-2 max-w-[80%]", isUser && "items-end")}>
        <div className={cn(
          "rounded-lg px-4 py-3 text-sm",
          isUser
            ? "bg-secondary text-foreground"
            : "bg-card border border-border text-foreground"
        )}>
          {/* Renderizar markdown básico */}
          <div
            className="prose prose-invert prose-sm max-w-none
              prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-code:text-xs
              prose-pre:bg-muted prose-pre:border prose-pre:border-border"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
        </div>

        {/* Acciones propuestas */}
        {message.actions && message.actions.length > 0 && !message.actionsExecuted && (
          <div className="w-full bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-medium text-accent">Acciones propuestas</span>
            </div>
            <div className="divide-y divide-border">
              {message.actions.map((action) => (
                <div key={action.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{action.label}</span>
                    <Badge
                      variant="outline"
                      className={cn("text-[9px] h-4", riskConfig[action.risk].className)}
                    >
                      {riskConfig[action.risk].label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{action.description}</p>
                  <code className="text-[10px] bg-muted px-2 py-1 rounded block text-muted-foreground font-mono">
                    {action.command}
                  </code>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-border flex gap-2">
              <Button
                size="sm"
                className="h-7 text-xs bg-primary hover:bg-primary/90"
                onClick={() => onConfirmActions?.(message.id, message.actions!)}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Confirmar y ejecutar
              </Button>
             <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => onConfirmActions?.(message.id, [])}
            >
                Cancelar
                </Button>
            </div>
          </div>
        )}

        {/* Acciones ejecutadas */}
        {message.actionsExecuted && (
          <div className="flex items-center gap-1.5 text-xs text-primary">
            <CheckCircle2 className="w-3 h-3" />
            Ejecutado — revisa el resultado abajo
          </div>
        )}

        <span className="text-[10px] text-muted-foreground">
          {new Date(message.timestamp).toLocaleTimeString("es-MX", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  )
}
