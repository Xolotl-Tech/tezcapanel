// Wrappers tipados para los endpoints de conversaciones de Byte.
// Mantienen el componente del chat libre de detalles HTTP y centralizan
// el manejo de errores. Si el panel pierde conectividad, los métodos
// regresan null y el componente decide si reintenta o degrada UI.

import type { ChatMessage } from "@/types/ai"

export interface ConversationSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  _count: { messages: number }
}

export interface ConversationDetail {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}

export async function listConversations(): Promise<ConversationSummary[]> {
  try {
    const r = await fetch("/api/byte/conversations", { cache: "no-store" })
    if (!r.ok) return []
    const data = await r.json()
    return Array.isArray(data?.conversations) ? data.conversations : []
  } catch {
    return []
  }
}

export async function createConversation(): Promise<{ id: string } | null> {
  try {
    const r = await fetch("/api/byte/conversations", { method: "POST" })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

export async function getConversation(id: string): Promise<ConversationDetail | null> {
  try {
    const r = await fetch(`/api/byte/conversations/${id}`, { cache: "no-store" })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

export async function deleteConversation(id: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/byte/conversations/${id}`, { method: "DELETE" })
    return r.ok
  } catch {
    return false
  }
}

export async function renameConversation(id: string, title: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/byte/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    return r.ok
  } catch {
    return false
  }
}

interface AddMessagePayload {
  role: "user" | "assistant"
  content: string
  metadata?: Record<string, unknown>
}

export async function addMessage(conversationId: string, payload: AddMessagePayload): Promise<{ id: string } | null> {
  try {
    const r = await fetch(`/api/byte/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

interface PatchMessagePayload {
  messageId: string
  content?: string
  metadata?: Record<string, unknown> | null
}

export async function patchMessage(conversationId: string, payload: PatchMessagePayload): Promise<boolean> {
  try {
    const r = await fetch(`/api/byte/conversations/${conversationId}/messages`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    return r.ok
  } catch {
    return false
  }
}

// Extrae los campos UI-only de un ChatMessage para guardar como metadata
// JSON. Sólo guardamos lo que enriquece el render — no role/content/timestamp
// (ya viven en columnas).
export function extractMetadata(m: Partial<ChatMessage>): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = {}
  if (m.actions) meta.actions = m.actions
  if (m.actionsExecuted !== undefined) meta.actionsExecuted = m.actionsExecuted
  if (m.stackProposal) meta.stackProposal = m.stackProposal
  if (m.installLog) meta.installLog = m.installLog
  return Object.keys(meta).length > 0 ? meta : undefined
}
