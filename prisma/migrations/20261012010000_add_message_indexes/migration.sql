-- CreateIndex
CREATE INDEX IF NOT EXISTS "Message_senderId_receiverId_createdAt_idx" ON "Message"("senderId", "receiverId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Message_receiverId_isRead_idx" ON "Message"("receiverId", "isRead");
