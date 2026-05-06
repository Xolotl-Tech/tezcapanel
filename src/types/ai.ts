export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  actions?: ProposedAction[]
  actionsExecuted?: boolean
  stackProposal?: StackProposal
  installLog?: InstallLog
}

export interface StackProposal {
  recommended: "lamp" | "lemp"
  // Cuando el usuario clickea uno de los botones se llena para que el card
  // se reemplace por la consola de instalación y no se pueda re-disparar.
  chosen?: "lamp" | "lemp" | "later"
}

export interface InstallLog {
  stack: "lamp" | "lemp"
  status: "running" | "success" | "failed" | "interrupted"
  lines: string[]
  currentStep?: string
  totalSteps?: number
  stepIndex?: number
}

export interface ProposedAction {
  id: string
  label: string
  description: string
  command: string
  risk: "low" | "medium" | "high"
  confirmed?: boolean
}

export interface ServerContext {
  hostname: string
  os: string
  cpu: { usage: number; cores: number; model: string }
  memory: { total: number; used: number; free: number }
  disk: { total: number; used: number; free: number }
  uptime: number
  services: { name: string; status: string }[]
}
