"use client"

import { cn } from "@/lib/utils"
import type { ChatMessage, ProposedAction } from "@/types/ai"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bot, User, CheckCircle2, Terminal, Server, Package, AlertTriangle, Loader2 } from "lucide-react"

interface ChatMessageProps {
  message: ChatMessage
  onConfirmActions?: (messageId: string, actions: ProposedAction[]) => void
  onChooseStack?: (messageId: string, choice: "lamp" | "lemp" | "later") => void
}

const riskConfig = {
  low:    { label: "Bajo riesgo",  className: "border-primary/50 text-primary" },
  medium: { label: "Riesgo medio", className: "border-accent/50 text-accent" },
  high:   { label: "Alto riesgo",  className: "border-destructive/50 text-destructive" },
}

function renderMarkdown(raw: string | undefined | null): string {
  if (!raw) return ""
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

const STACK_INFO = {
  lemp: {
    title: "LEMP",
    subtitle: "Linux + nginx + MariaDB + PHP",
    blurb: "Recomendado. Mejor rendimiento en VPS chicos y configuración estándar para WordPress moderno.",
    icon: Server,
  },
  lamp: {
    title: "LAMP",
    subtitle: "Linux + Apache + MariaDB + PHP",
    blurb: "Compatible con la mayoría de tutoriales clásicos y .htaccess. Más cómodo si vienes de hosting compartido.",
    icon: Package,
  },
} as const

export function ChatMessageItem({ message, onConfirmActions, onChooseStack }: ChatMessageProps) {
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

        {/* Wizard: propuesta de stack (LEMP/LAMP) */}
        {message.stackProposal && !message.stackProposal.chosen && (
          <div className="w-full bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-medium text-accent">Configurar servidor web</span>
            </div>
            <div className="divide-y divide-border">
              {(["lemp", "lamp"] as const).map((opt) => {
                const info = STACK_INFO[opt]
                const Icon = info.icon
                const isRec = message.stackProposal!.recommended === opt
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onChooseStack?.(message.id, opt)}
                    className="w-full px-4 py-3 text-left hover:bg-muted/50 transition flex items-start gap-3"
                  >
                    <Icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold">{info.title}</span>
                        <span className="text-[10px] text-muted-foreground">{info.subtitle}</span>
                        {isRec && (
                          <Badge variant="outline" className="border-primary/50 text-primary text-[9px] h-4">
                            Recomendado
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">{info.blurb}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="px-4 py-2 border-t border-border">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => onChooseStack?.(message.id, "later")}
              >
                Después
              </Button>
            </div>
          </div>
        )}

        {/* Wizard: log de instalación en streaming */}
        {message.installLog && (
          <div className="w-full bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
              {message.installLog.status === "running" && <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />}
              {message.installLog.status === "success" && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
              {(message.installLog.status === "failed" || message.installLog.status === "interrupted") && (
                <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
              )}
              <span className="text-xs font-medium">
                {message.installLog.status === "running" && `Instalando ${message.installLog.stack.toUpperCase()}…`}
                {message.installLog.status === "success" && `${message.installLog.stack.toUpperCase()} instalado`}
                {message.installLog.status === "failed" && `Falló la instalación`}
                {message.installLog.status === "interrupted" && `Instalación interrumpida`}
              </span>
              {message.installLog.totalSteps != null && message.installLog.stepIndex != null && (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  Paso {Math.min(message.installLog.stepIndex + 1, message.installLog.totalSteps)} de {message.installLog.totalSteps}
                </span>
              )}
            </div>
            {message.installLog.currentStep && message.installLog.status === "running" && (
              <div className="px-4 py-1.5 bg-muted/30 text-[11px] text-muted-foreground border-b border-border">
                {message.installLog.currentStep}
              </div>
            )}
            <pre className="bg-black/40 px-3 py-2 text-[10px] font-mono text-muted-foreground/90 max-h-48 overflow-y-auto whitespace-pre-wrap break-words leading-snug">
              {message.installLog.lines.slice(-200).join("\n") || "(sin salida aún)"}
            </pre>
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
