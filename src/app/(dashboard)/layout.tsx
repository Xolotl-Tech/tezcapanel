import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { MetricsProvider } from "@/components/dashboard/metrics-provider"
import { ConfirmProvider } from "@/components/ui/confirm-dialog"
import { FloatingByte } from "@/components/ai/floating-byte"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect("/login")

  // ConfirmProvider envuelve TODO el dashboard (incluido el Topbar) porque
  // el banner de actualización vive ahí y usa useConfirm. Antes vivía sólo
  // alrededor de <main>, lo que tronaba el banner con "must be used within
  // ConfirmProvider" al confirmar el update.
  return (
    <ConfirmProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <Topbar user={session.user} />
          <main className="flex-1 overflow-y-auto p-6">
            <MetricsProvider>
              {children}
            </MetricsProvider>
          </main>
        </div>
        <FloatingByte />
      </div>
    </ConfirmProvider>
  )
}
