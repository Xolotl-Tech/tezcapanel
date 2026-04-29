import type { NextConfig } from "next"

// CSP se inyecta dinámicamente desde el middleware con nonce por request
// (ver src/middleware.ts). Aquí sólo headers estáticos no relacionados.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
]

const nextConfig: NextConfig = {
  serverExternalPackages: ["ssh2", "node-pty"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ]
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), "ssh2", "node-pty"]
    }
    return config
  },
}

export default nextConfig
