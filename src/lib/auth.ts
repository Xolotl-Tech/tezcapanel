import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import type { JWT } from "next-auth/jwt"
import type { Session } from "next-auth"
import { prisma } from "./prisma"
import bcrypt from "bcryptjs"

declare module "next-auth" {
  interface User {
    id: string
    role: string
    name?: string | null
  }
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      role: string
    }
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })

        if (!user) return null

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password
        )

        if (!valid) return null

        try {
          const headers = (req as unknown as { headers?: Record<string, string | string[] | undefined> })?.headers ?? {}
          const ipRaw = (headers["x-forwarded-for"] || headers["x-real-ip"] || "") as string
          const ip = Array.isArray(ipRaw) ? ipRaw[0] : ipRaw.split(",")[0]?.trim()
          const ua = (headers["user-agent"] as string) || ""
          await prisma.auditLog.create({
            data: {
              userId: user.id,
              action: "panel_login",
              metadata: JSON.stringify({ ip: ip || null, userAgent: ua || null }),
            },
          })
        } catch {}

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        }
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }): Promise<JWT & { id?: string; role?: string }> {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token as JWT & { id?: string; role?: string }
    },
    async session({ session, token }): Promise<Session> {
      if (session.user) {
        session.user.id = (token as JWT & { id?: string }).id as string
        session.user.role = (token as JWT & { role?: string }).role as string
      }
      return session
    },
  },
})
