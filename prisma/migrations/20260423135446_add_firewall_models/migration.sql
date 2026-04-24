-- CreateTable
CREATE TABLE "FirewallRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL DEFAULT 'port',
    "protocol" TEXT NOT NULL DEFAULT 'tcp',
    "port" TEXT,
    "sourceIp" TEXT,
    "destIp" TEXT,
    "destPort" TEXT,
    "country" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'inbound',
    "strategy" TEXT NOT NULL DEFAULT 'allow',
    "remark" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FirewallSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "blockIcmp" BOOLEAN NOT NULL DEFAULT false,
    "sshPort" INTEGER NOT NULL DEFAULT 22,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "FirewallRule_kind_idx" ON "FirewallRule"("kind");
