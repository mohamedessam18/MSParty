-- Getting back in, changing the address you get back in with, and ending every
-- session that already exists.

-- A JWT cannot be recalled once issued, so a session can only be ended by
-- recording a number it has to still match. Every existing token counts as
-- version 0, which is what they already implicitly are.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- A reset or an address change belongs to a person, unlike the sign-up
-- confirmation, which is only ever about an address nobody owns yet.
ALTER TABLE "VerificationToken" ADD COLUMN "userId" TEXT;

CREATE INDEX "VerificationToken_userId_idx" ON "VerificationToken"("userId");

-- Erasing the account takes its outstanding links with it, so a reset mailed
-- yesterday cannot be spent against an account that no longer exists.
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
