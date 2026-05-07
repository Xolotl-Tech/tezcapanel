-- CreateTable
CREATE TABLE "ByteConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Nueva conversación',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ByteConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ByteMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ByteMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ByteConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ByteConversation_userId_idx" ON "ByteConversation"("userId");

-- CreateIndex
CREATE INDEX "ByteConversation_updatedAt_idx" ON "ByteConversation"("updatedAt");

-- CreateIndex
CREATE INDEX "ByteMessage_conversationId_idx" ON "ByteMessage"("conversationId");

-- CreateIndex
CREATE INDEX "ByteMessage_createdAt_idx" ON "ByteMessage"("createdAt");
