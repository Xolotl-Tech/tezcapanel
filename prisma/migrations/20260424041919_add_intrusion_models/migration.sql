-- CreateTable
CREATE TABLE "IntrusionScan" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "lastScanAt" DATETIME,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "error" TEXT,
    "totalFindings" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IntrusionBaseline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "path" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "mtime" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IntrusionFinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "path" TEXT,
    "extra" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "IntrusionBaseline_path_key" ON "IntrusionBaseline"("path");

-- CreateIndex
CREATE INDEX "IntrusionFinding_type_idx" ON "IntrusionFinding"("type");

-- CreateIndex
CREATE INDEX "IntrusionFinding_resolved_idx" ON "IntrusionFinding"("resolved");
