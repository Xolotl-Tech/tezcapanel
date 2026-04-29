"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Shield, Loader2, CheckCircle2 } from "lucide-react"
import { validatePanelPassword } from "@/lib/password-policy"

export default function SetupPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
  })

  async function handleSubmit() {
    setError("")

    if (!form.name || !form.email || !form.password) {
      setError("Todos los campos son requeridos")
      return
    }

    if (form.password !== form.confirm) {
      setError("Las contraseñas no coinciden")
      return
    }

    const pw = validatePanelPassword(form.password)
    if (!pw.ok) {
      setError(pw.error || "Contraseña inválida")
      return
    }

    setLoading(true)

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error al crear el admin")

      setDone(true)
      setTimeout(() => router.push("/login"), 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:48px_48px]" />

      <div className="relative w-full max-w-sm">
        <div className="absolute -inset-px bg-gradient-to-b from-primary/20 to-transparent rounded-xl blur-sm" />

        <div className="relative bg-card border border-border rounded-xl p-8 shadow-2xl">
          {done ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <CheckCircle2 className="w-12 h-12 text-primary" />
              <p className="text-sm font-medium">Admin creado exitosamente</p>
              <p className="text-xs text-muted-foreground">Redirigiendo al login...</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center mb-8">
                <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <h1 className="text-xl font-semibold tracking-tight">Configuración inicial</h1>
                <p className="text-sm text-muted-foreground mt-1 text-center">
                  Crea tu cuenta de administrador
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre</Label>
                  <Input
                    id="name"
                    placeholder="Tu nombre"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="bg-input border-border"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@servidor.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="bg-input border-border"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Mínimo 12 caracteres, con letras y dígitos"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="bg-input border-border"
                  />
                  <p className="text-xs text-muted-foreground">
                    12+ caracteres, al menos una letra y un dígito.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirmar contraseña</Label>
                  <Input
                    id="confirm"
                    type="password"
                    placeholder="Repite la contraseña"
                    value={form.confirm}
                    onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                    className="bg-input border-border"
                  />
                </div>

                {error && <p className="text-xs text-destructive">{error}</p>}

                <Button
                  className="w-full bg-primary hover:bg-primary/90 mt-2"
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creando...</>
                  ) : (
                    "Crear administrador"
                  )}
                </Button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Tezcapanel — Configuración inicial
        </p>
      </div>
    </div>
  )
}