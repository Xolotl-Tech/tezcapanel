import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  serverExternalPackages: ["ssh2", "node-pty"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), "ssh2", "node-pty"]
    }
    return config
  },
}

export default nextConfig
