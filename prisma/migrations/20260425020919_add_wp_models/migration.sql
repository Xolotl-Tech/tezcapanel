-- CreateTable
CREATE TABLE "WpCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#10b981',
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WpSite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "websiteId" TEXT NOT NULL,
    "categoryId" TEXT,
    "template" TEXT NOT NULL DEFAULT 'blog',
    "version" TEXT,
    "adminUser" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "dbName" TEXT NOT NULL,
    "dbUser" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'es_MX',
    "pluginsCount" INTEGER NOT NULL DEFAULT 0,
    "themesCount" INTEGER NOT NULL DEFAULT 0,
    "diskUsageMB" INTEGER NOT NULL DEFAULT 0,
    "lastSyncAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WpSite_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WpSite_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "WpCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WpCategory_name_key" ON "WpCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "WpSite_websiteId_key" ON "WpSite"("websiteId");

-- CreateIndex
CREATE INDEX "WpSite_categoryId_idx" ON "WpSite"("categoryId");
