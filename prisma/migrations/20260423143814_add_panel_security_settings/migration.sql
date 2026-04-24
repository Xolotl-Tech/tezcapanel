-- CreateTable
CREATE TABLE "PanelSecuritySettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "alertOnSshLogin" BOOLEAN NOT NULL DEFAULT false,
    "alertOnPanelLogin" BOOLEAN NOT NULL DEFAULT false,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "unauthStatusCode" INTEGER NOT NULL DEFAULT 404,
    "sslEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);
