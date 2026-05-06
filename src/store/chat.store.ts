import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { ChatMessage } from "@/types/ai"

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  addMessage: (message: ChatMessage) => void
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void
  setLoading: (loading: boolean) => void
  clearMessages: () => void
}

// Persistencia en localStorage. Sobrevive a refresh y reinicios del navegador
// per-perfil. No multi-dispositivo — eso queda para 1.0.4 con BD-backed
// conversation history. `isLoading` no se persiste a propósito: si el panel
// se reinicia mientras Byte respondía, no queremos quedar trabados en
// "Pensando…" para siempre.
export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      isLoading: false,
      addMessage: (message) =>
        set((state) => ({ messages: [...state.messages, message] })),
      updateMessage: (id, updates) =>
        set((state) => ({
          messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
        })),
      setLoading: (isLoading) => set({ isLoading }),
      clearMessages: () => set({ messages: [] }),
    }),
    {
      name: "tezcapanel.byte.chat",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ messages: state.messages }),
      version: 1,
      // Si el navegador se cerró mientras una instalación estaba en stream,
      // al rehidratar el `installLog.status` queda en "running" pero ya no
      // hay reader vivo. Lo marcamos como interrumpido para que la UI no
      // muestre un spinner eterno.
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.messages = state.messages.map((m) =>
          m.installLog?.status === "running"
            ? { ...m, installLog: { ...m.installLog, status: "interrupted" } }
            : m
        )
      },
    }
  )
)
