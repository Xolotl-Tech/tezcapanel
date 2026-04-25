"use client"

import { useState } from "react"
import { FirewallTab } from "@/components/security/firewall-tab"
import { SshTab } from "@/components/security/ssh-tab"
import { ServerSecurityTab } from "@/components/security/server-security-tab"
import { WebsiteSecurityTab } from "@/components/security/website-security-tab"
import { BruteForceTab } from "@/components/security/brute-force-tab"
import { CompilerAccessTab } from "@/components/security/compiler-access-tab"
import { AntiIntrusionTab } from "@/components/security/anti-intrusion-tab"
import { SystemHardeningTab } from "@/components/security/system-hardening-tab"
import { ComingSoonTab } from "@/components/security/coming-soon-tab"

const TABS = [
  { id: "firewall", label: "Firewall" },
  { id: "ssh", label: "SSH" },
  { id: "server", label: "Server security" },
  { id: "website", label: "Website Security" },
  { id: "brute", label: "Brute force protection" },
  { id: "compiler", label: "Compiler Access" },
  { id: "intrusion", label: "Anti Intrusion" },
  { id: "hardening", label: "System Hardening" },
] as const

type TabId = (typeof TABS)[number]["id"]

export default function SecurityPage() {
  const [tab, setTab] = useState<TabId>("firewall")

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm whitespace-nowrap transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? "border-accent text-accent bg-accent/5"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "firewall" && <FirewallTab />}
      {tab === "ssh" && <SshTab />}
      {tab === "server" && <ServerSecurityTab />}
      {tab === "website" && <WebsiteSecurityTab />}
      {tab === "brute" && <BruteForceTab />}
      {tab === "compiler" && <CompilerAccessTab />}
      {tab === "intrusion" && <AntiIntrusionTab />}
      {tab === "hardening" && <SystemHardeningTab />}
    </div>
  )
}
