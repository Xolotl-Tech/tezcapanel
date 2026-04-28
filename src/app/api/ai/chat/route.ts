import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import type { ServerContext } from "@/types/ai"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:7070"
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ""

async function getServerContext(): Promise<ServerContext | null> {
  try {
    const [metricsRes, servicesRes] = await Promise.all([
      fetch(`${AGENT_URL}/metrics`, {
        headers: { Authorization: `Bearer ${AGENT_TOKEN}` },
        signal: AbortSignal.timeout(3000),
      }),
      fetch(`${AGENT_URL}/services`, {
        headers: { Authorization: `Bearer ${AGENT_TOKEN}` },
        signal: AbortSignal.timeout(3000),
      }),
    ])
    const metrics = await metricsRes.json()
    const services = await servicesRes.json()
    return { ...metrics, services }
  } catch {
    return null
  }
}

function buildSystemPrompt(context: ServerContext | null): string {
  const contextStr = context
    ? `
## Estado actual del servidor

- **Hostname:** ${context.hostname}
- **OS:** ${context.os}
- **CPU:** ${context.cpu.usage.toFixed(1)}% uso, ${context.cpu.cores} núcleos (${context.cpu.model})
- **RAM:** ${(context.memory.used / 1024 / 1024 / 1024).toFixed(1)} GB usados de ${(context.memory.total / 1024 / 1024 / 1024).toFixed(1)} GB
- **Disco:** ${(context.disk.used / 1024 / 1024 / 1024).toFixed(1)} GB usados de ${(context.disk.total / 1024 / 1024 / 1024).toFixed(1)} GB
- **Uptime:** ${Math.floor(context.uptime / 86400)}d ${Math.floor((context.uptime % 86400) / 3600)}h
- **Servicios:**
${context.services.map((s) => `  - ${s.name}: ${s.status}`).join("\n")}
`
    : "\n## Estado del servidor: No disponible (agente desconectado)\n"

  return `Eres el asistente de IA integrado en Tezcapanel, un panel de administración de servidores Linux.
Tu nombre es Tezca. Eres experto en administración de servidores Linux, Nginx, Apache, MySQL, DNS, correo electrónico y seguridad.

Tienes acceso al estado en tiempo real del servidor donde está instalado Tezcapanel.
${contextStr}

## Tu comportamiento

1. **Responde en español** siempre, de forma clara y concisa.
2. **Usa el contexto del servidor** para dar respuestas específicas y relevantes.
3. **Cuando el usuario pida ejecutar algo**, propón las acciones en formato JSON estructurado
   al final de tu respuesta usando este formato exacto:

\`\`\`json
{
  "actions": [
    {
      "id": "action_1",
      "label": "Instalar Nginx",
      "description": "Instala nginx via apt y lo habilita como servicio",
      "command": "apt install -y nginx && systemctl enable nginx && systemctl start nginx",
      "risk": "low"
    }
  ]
}
\`\`\`

4. **Niveles de riesgo:**
   - \`low\`: operaciones de lectura, instalaciones estándar
   - \`medium\`: cambios de configuración, reinicios de servicios
   - \`high\`: eliminación de datos, cambios en firewall, modificaciones críticas

5. **NUNCA ejecutes nada sin proponer las acciones primero** — el usuario debe aprobar.
6. **Si detectas problemas** en el estado del servidor (RAM alta, disco lleno, servicios caídos),
   mencionalo proactivamente.
7. **Sé conciso** — respuestas cortas y al punto. Usa markdown para formatear código.

## Restricciones
- No propongas acciones que puedan dañar irreversiblemente el servidor sin advertencia clara.
- No compartas el AGENT_TOKEN ni el AUTH_SECRET bajo ninguna circunstancia.
- Si no sabes algo, dilo — no inventes comandos.`
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { messages } = await req.json()

  const context = await getServerContext()
  const systemPrompt = buildSystemPrompt(context)

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  })

  const content = response.content[0]
  if (content.type !== "text") {
    return NextResponse.json({ error: "Unexpected response type" }, { status: 500 })
  }

  // Extraer acciones propuestas del JSON en la respuesta
  let actions = null
  let text = content.text

  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1])
      if (parsed.actions) {
        actions = parsed.actions
        // Remover el bloque JSON del texto visible
        text = text.replace(/```json\n[\s\S]*?\n```/, "").trim()
      }
    } catch {
      // Si no parsea, dejamos el texto como está
    }
  }

  return NextResponse.json({ text, actions })
}
