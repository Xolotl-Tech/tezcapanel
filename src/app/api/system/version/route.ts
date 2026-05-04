import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const REPO = process.env.PANEL_REPO || "Xolotl-Tech/tezcapanel"
const BRANCH = process.env.PANEL_BRANCH || "main"
// Cache de la consulta a GitHub. 6h es buen balance: suficientemente
// frecuente para enterarse de updates, lejos del límite de 60 req/h sin
// auth (4 req/día por panel).
const CHECK_INTERVAL_MS = 6 * 60 * 60_000

interface ChangelogEntry {
  sha: string
  message: string
  date: string
  author: string | null
}

interface VersionResponse {
  installed: string | null
  latest: string | null
  updateAvailable: boolean
  lastCheckedAt: string | null
  changelog: ChangelogEntry[]
  unknown?: boolean // panel sin git ni VERSION file
}

async function fetchLatestFromGitHub(installed: string | null): Promise<{
  sha: string
  changelog: ChangelogEntry[]
} | null> {
  try {
    const headRes = await fetch(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(8000),
    })
    if (!headRes.ok) return null
    const head = await headRes.json()
    const latestSha: string = head.sha

    let changelog: ChangelogEntry[] = []
    if (installed && installed !== latestSha) {
      // GitHub /compare devuelve los commits entre installed..latest.
      const cmpRes = await fetch(
        `https://api.github.com/repos/${REPO}/compare/${installed}...${latestSha}`,
        { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(8000) }
      )
      if (cmpRes.ok) {
        const cmp = await cmpRes.json()
        const commits = Array.isArray(cmp.commits) ? cmp.commits : []
        changelog = commits.slice(-30).reverse().map((c: {
          sha: string
          commit: { message: string; author: { date: string; name: string } }
        }) => ({
          sha: c.sha.slice(0, 7),
          message: c.commit.message.split("\n")[0].slice(0, 200),
          date: c.commit.author.date,
          author: c.commit.author.name,
        }))
      }
    }
    return { sha: latestSha, changelog }
  } catch {
    return null
  }
}

export async function GET(): Promise<NextResponse<VersionResponse>> {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({
      installed: null, latest: null, updateAvailable: false,
      lastCheckedAt: null, changelog: [],
    }, { status: 401 })
  }

  const installed = process.env.PANEL_COMMIT || null
  const meta = await prisma.systemMeta.findUnique({ where: { id: "singleton" } })

  const now = Date.now()
  const lastChecked = meta?.latestCheckedAt?.getTime() ?? 0
  const stale = now - lastChecked > CHECK_INTERVAL_MS

  let latest = meta?.latestSha ?? null
  let changelog: ChangelogEntry[] = []
  try {
    if (meta?.changelog) changelog = JSON.parse(meta.changelog)
  } catch { changelog = [] }
  let lastCheckedAt = meta?.latestCheckedAt?.toISOString() ?? null

  if (stale) {
    const fresh = await fetchLatestFromGitHub(installed)
    if (fresh) {
      latest = fresh.sha
      changelog = fresh.changelog
      lastCheckedAt = new Date().toISOString()
      await prisma.systemMeta.upsert({
        where: { id: "singleton" },
        update: {
          installedSha: installed,
          latestSha: fresh.sha,
          latestCheckedAt: new Date(),
          changelog: JSON.stringify(fresh.changelog),
        },
        create: {
          id: "singleton",
          installedSha: installed,
          latestSha: fresh.sha,
          latestCheckedAt: new Date(),
          changelog: JSON.stringify(fresh.changelog),
        },
      })
    }
  }

  return NextResponse.json({
    installed,
    latest,
    updateAvailable: !!(installed && latest && installed !== latest),
    lastCheckedAt,
    changelog,
    unknown: !installed,
  })
}
