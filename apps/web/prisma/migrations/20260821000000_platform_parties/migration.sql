-- Which streaming service a party is held on, when contentType is "platform".
-- Nullable: every existing party is a YouTube or upload party and has none.
ALTER TABLE "Party" ADD COLUMN "platform" TEXT;

-- Platform parties are the only reason to query by service, and there will
-- never be many of them per user, so a plain index on the column is enough.
CREATE INDEX "Party_platform_idx" ON "Party"("platform");
