-- CreateTable
CREATE TABLE "NotificationPreferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "telegram" BOOLEAN NOT NULL DEFAULT false,
    "slack" BOOLEAN NOT NULL DEFAULT false,
    "whatsappPhone" TEXT,
    "telegramChatId" TEXT,
    "slackWebhook" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreferences_userId_key" ON "NotificationPreferences"("userId");
