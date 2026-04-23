-- CreateTable
CREATE TABLE "DnsZone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "primaryNs" TEXT NOT NULL DEFAULT 'ns1.localhost.',
    "adminEmail" TEXT NOT NULL DEFAULT 'admin.localhost.',
    "serial" INTEGER NOT NULL DEFAULT 1,
    "refresh" INTEGER NOT NULL DEFAULT 3600,
    "retry" INTEGER NOT NULL DEFAULT 1800,
    "expire" INTEGER NOT NULL DEFAULT 1209600,
    "minimum" INTEGER NOT NULL DEFAULT 86400,
    "defaultTtl" INTEGER NOT NULL DEFAULT 3600,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DnsRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "zoneId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "ttl" INTEGER NOT NULL DEFAULT 3600,
    "priority" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DnsRecord_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DnsZone" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DnsZone_domain_key" ON "DnsZone"("domain");

-- CreateIndex
CREATE INDEX "DnsRecord_zoneId_idx" ON "DnsRecord"("zoneId");
