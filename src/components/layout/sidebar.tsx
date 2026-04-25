"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { navItems } from "./nav-items"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  LayoutDashboard, Globe, Database, Mail, Server,
  Shield, Archive, Terminal, Users, Settings, ChevronRight, Bot, Briefcase,
} from "lucide-react"

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard, Globe, Database, Mail, Server,
  Shield, Archive, Terminal, Users, Settings, Bot, Briefcase,
}

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-[var(--sidebar-width)] h-screen bg-card border-r border-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="h-14 flex items-center gap-3 px-5 border-b border-border">
        <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center">
          <Shield className="w-3.5 h-3.5 text-primary" />
        </div>
        <span className="font-semibold text-sm tracking-wide">Tezcapanel</span>
        <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 h-4">
          Community
        </Badge>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const Icon = iconMap[item.icon] ?? ChevronRight
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors group",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                  item.proOnly && "opacity-60"
                )}
              >
                <Icon className={cn(
                  "w-4 h-4 shrink-0 transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-foreground"
                )} />
                <span className="flex-1">{item.label}</span>
                {item.proOnly && (
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 h-3.5 border-accent/50 text-accent"
                  >
                    PRO
                  </Badge>
                )}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary/50">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-xs text-muted-foreground">Servidor activo</span>
        </div>
      </div>
    </aside>
  )
}
