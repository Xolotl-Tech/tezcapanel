import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { ChatMessage } from "@/types/ai"

interface ChatState {
  // ID de la conversación abierta. Null = no hay ninguna seleccionada
  // (el componente abre/crea una al iniciar). Es lo único que persistimos
  // en localStorage para que al recargar el navegador vuelvas a la
  // conversación que tenías abierta. Los mensajes en sí ya viven en BD.
  currentId: string | null
  setCurrentId: (id: string | null) => void

  // Estado transitorio del chat actual — se llena cuando el componente
  // hidrata mensajes desde /api/byte/conversations/[id].
  messages: ChatMessage[]
  isLoading: boolean
  setMessages: (messages: ChatMessage[]) => void
  addMessage: (message: ChatMessage) => void
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void
  setLoading: (loading: boolean) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      currentId: null,
      setCurrentId: (currentId) => set({ currentId }),
      messages: [],
      isLoading: false,
      setMessages: (messages) => set({ messages }),
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
      partialize: (state) => ({ currentId: state.currentId }),
      version: 2,
    }
  )
)
