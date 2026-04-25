-- CreateTable
CREATE TABLE "WebsiteSecurityScan" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "score" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "xssCount" INTEGER NOT NULL DEFAULT 0,
    "sqlCount" INTEGER NOT NULL DEFAULT 0,
    "maliciousCount" INTEGER NOT NULL DEFAULT 0,
    "phpAttackCount" INTEGER NOT NULL DEFAULT 0,
    "topIps" TEXT NOT NULL DEFAULT '[]',
    "lastScanAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "error" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WebsiteSecurityRisk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "affectedPath" TEXT,
    "domain" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "WebsiteSecurityRisk_category_idx" ON "WebsiteSecurityRisk"("category");
