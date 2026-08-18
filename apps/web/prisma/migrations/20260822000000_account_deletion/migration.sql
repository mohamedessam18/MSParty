-- When erasure was asked for. Null for every existing account.
ALTER TABLE "User" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);

-- The erasure job looks for accounts past their grace period and nothing else.
CREATE INDEX "User_deletionRequestedAt_idx" ON "User"("deletionRequestedAt");

-- A message outlives its author. Making the column nullable is what lets a
-- conversation keep its shape once the person who wrote a line is gone: the row
-- stays, the text is blanked, and nothing in it points at a user any more.
ALTER TABLE "ChatMessage" ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_userId_fkey";
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Chat is always read as "this party, in order", and had no index for it.
CREATE INDEX "ChatMessage_partyId_sentAt_idx" ON "ChatMessage"("partyId", "sentAt");
