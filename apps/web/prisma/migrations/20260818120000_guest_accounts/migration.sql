-- Guests join with a name only, so email can no longer be required. The unique
-- index stays: Postgres treats NULLs as distinct, so any number of guests can
-- coexist without an email while real addresses remain unique.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false;
