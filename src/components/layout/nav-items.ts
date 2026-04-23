import type { NavItem } from "@/types"

export const navItems: NavItem[] = [
  { label: "Dashboard",      href: "/",          icon: "LayoutDashboard" },  { label: "Byte AI",       href: "/ai",        icon: "Bot",     proOnly: true },  { label: "Web",            href: "/web",        icon: "Globe" },
  { label: "Bases de datos", href: "/databases",  icon: "Database" },
  { label: "Correo",         href: "/mail",       icon: "Mail" },
  { label: "DNS",            href: "/dns",        icon: "Server" },
  { label: "Firewall",       href: "/firewall",   icon: "Shield",  proOnly: true },
  { label: "Backups",        href: "/backups",    icon: "Archive", proOnly: true },
  { label: "Terminal",       href: "/terminal",   icon: "Terminal" },
  { label: "Usuarios",       href: "/users",      icon: "Users" },
  { label: "Configuración",  href: "/settings",   icon: "Settings" },
]
