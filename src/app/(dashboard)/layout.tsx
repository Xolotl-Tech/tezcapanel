import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { MetricsProvider } from "@/components/dashboard/metrics-provider"
import { ConfirmProvider } from "@/components/ui/confirm-dialog"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar user={session.user} />
        <main className="flex-1 overflow-y-auto p-6">
          <MetricsProvider>
            <ConfirmProvider>
              {children}
            </ConfirmProvider>
          </MetricsProvider>
        </main>
      </div>
    </div>
  )
}
