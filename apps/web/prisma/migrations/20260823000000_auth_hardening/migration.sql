-- Google sign-in, a real grace period, and counters that survive a cold start.

-- Proof that an address belongs to whoever is using it. Existing accounts stay
-- null: they were never asked, and nothing is gated on it.
ALTER TABLE "User" ADD COLUMN "emailVerified" TIMESTAMP(3);

-- What "invisible" was before the deletion forced it on, so cancelling can put
-- back the choice they made themselves instead of guessing "visible".
ALTER TABLE "User" ADD COLUMN "invisibleBeforeDeletion" BOOLEAN;

-- Stops the "erased in three days" mail going out again every night.
ALTER TABLE "User" ADD COLUMN "deletionReminderSentAt" TIMESTAMP(3);

-- A sign-in method that is not a password. One row per provider identity, so a
-- Google account can gain a password later without either one displacing the
-- other.
CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- One identity at the provider maps to exactly one account here. This is the
-- constraint that makes two simultaneous first-time Google sign-ins resolve to
-- one row instead of two accounts for the same person.
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One-time links mailed to an address. Hashed, so a leaked database does not
-- hand out working links.
CREATE TABLE "VerificationToken" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'verify_email',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VerificationToken_tokenHash_key" ON "VerificationToken"("tokenHash");
CREATE INDEX "VerificationToken_identifier_purpose_idx" ON "VerificationToken"("identifier", "purpose");
CREATE INDEX "VerificationToken_expiresAt_idx" ON "VerificationToken"("expiresAt");

-- Attempt counters. In the database rather than in memory because the web app
-- is serverless: a per-instance counter resets often enough to be no limit.
CREATE TABLE "RateLimit" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");
