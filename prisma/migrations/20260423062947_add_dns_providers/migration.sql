-- CreateTable
CREATE TABLE "DnsProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "account" TEXT,
    "config" TEXT NOT NULL DEFAULT '{}',
    "status" BOOLEAN NOT NULL DEFAULT true,
    "permission" TEXT NOT NULL DEFAULT 'global',
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DnsZone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "providerId" TEXT,
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DnsZone_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "DnsProvider" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DnsZone" ("active", "adminEmail", "createdAt", "defaultTtl", "domain", "expire", "id", "minimum", "primaryNs", "refresh", "retry", "serial", "updatedAt") SELECT "active", "adminEmail", "createdAt", "defaultTtl", "domain", "expire", "id", "minimum", "primaryNs", "refresh", "retry", "serial", "updatedAt" FROM "DnsZone";
DROP TABLE "DnsZone";
ALTER TABLE "new_DnsZone" RENAME TO "DnsZone";
CREATE UNIQUE INDEX "DnsZone_domain_key" ON "DnsZone"("domain");
CREATE INDEX "DnsZone_providerId_idx" ON "DnsZone"("providerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
