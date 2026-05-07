"use client"
import { useState } from "react"
import { NotificationsPanel } from "@/components/layout/notifications-panel"
import { UpdateBanner } from "@/components/system/update-banner"
import { FeedbackDialog } from "@/components/system/feedback-dialog"
import { RepairDialog } from "@/components/system/repair-dialog"
import { LanguageMenu } from "@/components/system/language-menu"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MessageCircle, Wrench } from "lucide-react"

interface TopbarProps {
  user?: { name?: string | null; email?: string | null }
}

export function Topbar({ user }: TopbarProps) {
  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0].toUpperCase() ?? "U"

  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [repairOpen, setRepairOpen] = useState(false)

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Panel de control</span>
      </div>

      <div className="flex items-center gap-1">
        <UpdateBanner />

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Reparar panel"
          onClick={() => setRepairOpen(true)}
        >
          <Wrench className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Enviar feedback"
          onClick={() => setFeedbackOpen(true)}
        >
          <MessageCircle className="w-4 h-4" />
        </Button>

        <LanguageMenu />

        <NotificationsPanel />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 rounded-full p-0 ml-1">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold border border-primary/20">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.name ?? "Administrador"}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <RepairDialog open={repairOpen} onClose={() => setRepairOpen(false)} />
    </header>
  )
}
