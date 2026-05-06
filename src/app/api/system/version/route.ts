import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import pkg from "../../../../../package.json"

const REPO = process.env.PANEL_REPO || "Xolotl-Tech/tezcapanel"
// Caché de 6h para no quemar el rate limit anónimo de GitHub (60 req/h).
const CHECK_INTERVAL_MS = 6 * 60 * 60_000

const AUTHOR_NAME = "Xolotl Tech"
const AUTHOR_URL = "https://github.com/Xolotl-Tech"

interface ReleaseCategory {
  label: string
  icon: string // emoji
  items: string[]
}

interface ReleaseInfo {
  version: string // "1.0.1" sin la "v"
  name: string
  publishedAt: string
  url: string
  author: { name: string; url: string }
  categories: ReleaseCategory[]
  raw: string // body original por si la UI quiere mostrarlo crudo
}

interface VersionResponse {
  installed: string // siempre disponible (de package.json)
  latest: string | null // null si nunca se pudo consultar
  updateAvailable: boolean
  lastCheckedAt: string | null
  release: ReleaseInfo | null
}

// Convierte "v1.0.1" -> "1.0.1"
function normalizeTag(tag: string): string {
  return tag.replace(/^v/i, "")
}

// Compara versiones semver simples (x.y.z). Devuelve true si latest > installed.
function isNewer(installed: string, latest: string): boolean {
  const [ia, ib, ic] = installed.split(".").map((n) => parseInt(n, 10) || 0)
  const [la, lb, lc] = latest.split(".").map((n) => parseInt(n, 10) || 0)
  if (la !== ia) return la > ia
  if (lb !== ib) return lb > ib
  return lc > ic
}

// Parsea el body markdown de un release en categorías.
// Formato esperado en releases:
//   ## 🛡️ Seguridad
//   - item 1
//   - item 2
//   ## ✨ Nuevas funciones
//   - ...
// Si el body no tiene `## ` headings, todo va a una categoría "Cambios".
function parseReleaseBody(body: string): ReleaseCategory[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n")
  const categories: ReleaseCategory[] = []
  let current: ReleaseCategory | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    const heading = line.match(/^##\s+(.+)$/)
    if (heading) {
      // Separar emoji del texto: "🛡️ Seguridad" o "Seguridad"
      const text = heading[1].trim()
      const emojiMatch = text.match(/^(\p{Emoji}+️?\s*)?(.+)$/u)
      const icon = (emojiMatch?.[1] ?? "").trim()
      const label = (emojiMatch?.[2] ?? text).trim()
      current = { label, icon, items: [] }
      categories.push(current)
      continue
    }
    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet && current) {
      current.items.push(bullet[1].trim())
    } else if (bullet && !current) {
      current = { label: "Cambios", icon: "📝", items: [bullet[1].trim()] }
      categories.push(current)
    }
  }

  // Filtra categorías sin items.
  return categories.filter((c) => c.items.length > 0)
}

async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const r = await res.json()
    if (!r.tag_name) return null
    const version = normalizeTag(r.tag_name)
    const body: string = typeof r.body === "string" ? r.body : ""
    return {
      version,
      name: r.name || `Tezcapanel ${version}`,
      publishedAt: r.published_at || new Date().toISOString(),
      url: r.html_url || `https://github.com/${REPO}/releases/tag/${r.tag_name}`,
      author: { name: AUTHOR_NAME, url: AUTHOR_URL },
      categories: parseReleaseBody(body),
      raw: body,
    }
  } catch {
    return null
  }
}

export async function GET(): Promise<NextResponse<VersionResponse>> {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({
      installed: "0.0.0", latest: null, updateAvailable: false,
      lastCheckedAt: null, release: null,
    }, { status: 401 })
  }

  const installed = pkg.version
  const meta = await prisma.systemMeta.findUnique({ where: { id: "singleton" } })

  const now = Date.now()
  const lastChecked = meta?.latestCheckedAt?.getTime() ?? 0
  // Si la caché trae datos del esquema viejo (commit SHA en `latestSha` o un
  // `release` JSON sin `categories`), forzamos refetch ignorando el TTL.
  const isSemver = (v: string | null | undefined) =>
    typeof v === "string" && /^\d+\.\d+\.\d+/.test(v)
  const cachedRelease: ReleaseInfo | null = (() => {
    try {
      const parsed = meta?.changelog ? JSON.parse(meta.changelog) : null
      // Discriminador del esquema nuevo: tiene `version` y `categories`.
      if (parsed && typeof parsed === "object" && "version" in parsed && "categories" in parsed) {
        return parsed as ReleaseInfo
      }
      return null
    } catch { return null }
  })()
  const cacheCorrupt = (meta?.latestSha && !isSemver(meta.latestSha)) ||
                       (meta?.changelog && !cachedRelease)
  const stale = cacheCorrupt || now - lastChecked > CHECK_INTERVAL_MS

  let latest = isSemver(meta?.latestSha) ? meta!.latestSha! : null
  let release: ReleaseInfo | null = cachedRelease
  let lastCheckedAt = meta?.latestCheckedAt?.toISOString() ?? null

  if (stale) {
    const fresh = await fetchLatestRelease()
    if (fresh) {
      latest = fresh.version
      release = fresh
      lastCheckedAt = new Date().toISOString()
      await prisma.systemMeta.upsert({
        where: { id: "singleton" },
        update: {
          installedSha: installed,
          latestSha: fresh.version,
          latestCheckedAt: new Date(),
          changelog: JSON.stringify(fresh),
        },
        create: {
          id: "singleton",
          installedSha: installed,
          latestSha: fresh.version,
          latestCheckedAt: new Date(),
          changelog: JSON.stringify(fresh),
        },
      })
    }
  }

  return NextResponse.json({
    installed,
    latest,
    updateAvailable: !!(latest && isNewer(installed, latest)),
    lastCheckedAt,
    release,
  })
}
