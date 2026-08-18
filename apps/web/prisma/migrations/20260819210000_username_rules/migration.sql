-- The impersonation-proof form of a username, and when it was last changed.
ALTER TABLE "User" ADD COLUMN "usernameCanonical" TEXT;
ALTER TABLE "User" ADD COLUMN "usernameChangedAt" TIMESTAMP(3);

-- Backfill for anyone who already picked one. The old rules allowed only
-- [a-z0-9_], so stripping underscores and folding look-alikes is enough.
UPDATE "User"
SET "usernameCanonical" = translate(replace("username", '_', ''), '01345789', 'oieastbg')
WHERE "username" IS NOT NULL;

CREATE UNIQUE INDEX "User_usernameCanonical_key" ON "User"("usernameCanonical");

-- A released name is parked, not freed, so an identity cannot be picked up the
-- moment its owner steps away from it.
CREATE TABLE "UsernameHold" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "heldUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsernameHold_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UsernameHold_username_key" ON "UsernameHold"("username");
CREATE UNIQUE INDEX "UsernameHold_canonical_key" ON "UsernameHold"("canonical");
CREATE INDEX "UsernameHold_heldUntil_idx" ON "UsernameHold"("heldUntil");

ALTER TABLE "UsernameHold" ADD CONSTRAINT "UsernameHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
