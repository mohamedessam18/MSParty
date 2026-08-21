-- Televisions, paired from a phone instead of typed into with a remote.

CREATE TABLE "TvDevice" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "userId" TEXT,
  "partyId" TEXT,
  "label" TEXT,
  "claimedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TvDevice_pkey" PRIMARY KEY ("id")
);

-- The code is what someone reads off a screen and types into a phone, so two
-- sets must never show the same one. The secret is the credential itself.
CREATE UNIQUE INDEX "TvDevice_code_key" ON "TvDevice"("code");
CREATE UNIQUE INDEX "TvDevice_secretHash_key" ON "TvDevice"("secretHash");
CREATE INDEX "TvDevice_userId_idx" ON "TvDevice"("userId");
-- The nightly job sweeps codes nobody claimed.
CREATE INDEX "TvDevice_expiresAt_idx" ON "TvDevice"("expiresAt");

-- Deleting the account takes its televisions with it, which is what makes
-- erasure complete: a paired set is a live credential for that account.
ALTER TABLE "TvDevice" ADD CONSTRAINT "TvDevice_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A deleted party leaves the set paired but idle, waiting to be pointed at
-- another one — rather than unpairing a television because a room ended.
ALTER TABLE "TvDevice" ADD CONSTRAINT "TvDevice_partyId_fkey"
  FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;
