-- CreateTable
CREATE TABLE "SystemMeta" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "installedSha" TEXT,
    "latestSha" TEXT,
    "latestCheckedAt" DATETIME,
    "changelog" TEXT,
    "updatedAt" DATETIME NOT NULL
);
