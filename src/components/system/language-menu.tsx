"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Languages, Check } from "lucide-react"

// Idiomas soportados. Por ahora sólo `es` está completo: el panel está
// hardcodeado en español. Los demás aparecen como "Próximamente" para
// que el usuario sepa que vienen sin que rompan la UI cuando los pique.
// Cuando metamos i18n real (next-intl), basta poner available=true.
const LANGS: { code: string; label: string; native: string; flag: string; available: boolean }[] = [
  { code: "es", label: "Spanish",    native: "Español",    flag: "🇲🇽", available: true },
  { code: "en", label: "English",    native: "English",    flag: "🇺🇸", available: false },
  { code: "pt", label: "Portuguese", native: "Português",  flag: "🇧🇷", available: false },
  { code: "fr", label: "French",     native: "Français",   flag: "🇫🇷", available: false },
]

const STORAGE_KEY = "tezcapanel.lang"

export function LanguageMenu() {
  const [current, setCurrent] = useState("es")

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && LANGS.some((l) => l.code === saved && l.available)) setCurrent(saved)
    } catch {}
  }, [])

  function handleSelect(code: string) {
    const lang = LANGS.find((l) => l.code === code)
    if (!lang || !lang.available) return
    setCurrent(code)
    try { localStorage.setItem(STORAGE_KEY, code) } catch {}
  }

  const active = LANGS.find((l) => l.code === current) ?? LANGS[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title={`Idioma: ${active.native}`}
        >
          <Languages className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs">Idioma</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGS.map((l) => (
          <DropdownMenuItem
            key={l.code}
            disabled={!l.available}
            onClick={() => handleSelect(l.code)}
            className="text-xs flex items-center gap-2"
          >
            <span className="w-4 text-center">{l.flag}</span>
            <span className="flex-1">{l.native}</span>
            {l.code === current && <Check className="w-3 h-3 text-primary" />}
            {!l.available && <span className="text-[9px] text-muted-foreground">Próximamente</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
