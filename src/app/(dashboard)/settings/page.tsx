import { AuditLogSection } from "@/components/dashboard/audit-log"
import { NotificationChannels } from "@/components/settings/notification-channels"
import { auth } from "@/lib/auth"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

export default async function SettingsPage() {
  const session = await auth()

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-1">Ajustes del panel y del servidor</p>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-medium">Perfil</h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Nombre</span>
            <span className="text-sm">{session?.user?.name ?? "—"}</span>
          </div>
          <Separator />
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-sm">{session?.user?.email ?? "—"}</span>
          </div>
          <Separator />
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Rol</span>
            <Badge variant="outline" className="text-[10px]">ADMIN</Badge>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-medium">Plan actual</h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Versión</span>
            <Badge variant="secondary">Community</Badge>
          </div>
          <Separator />
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Módulos Pro</span>
            <span className="text-sm text-muted-foreground">No incluidos</span>
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            Actualiza a Pro para desbloquear Correo, DNS, Firewall, Backups y el Asistente IA.
          </p>
        </div>
      </div>

      <NotificationChannels />
      <AuditLogSection />
    </div>
  )
}