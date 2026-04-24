import { Lock } from "lucide-react"

export function ComingSoonTab({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 rounded-lg border border-border bg-card/40 p-8">
      <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
        <Lock className="w-5 h-5 text-accent" />
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-md text-center">{description}</p>
      <span className="text-xs text-accent">Próximamente</span>
    </div>
  )
}
