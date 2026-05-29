-- 일회용 초대 + 대기 명단 추가
ALTER TABLE "Child" ADD COLUMN IF NOT EXISTS "waiting" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "Invitation" (
    "id" SERIAL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "centerId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS "Invitation_token_key" ON "Invitation"("token");
CREATE INDEX IF NOT EXISTS "Invitation_centerId_idx" ON "Invitation"("centerId");

DO $$ BEGIN
  ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_centerId_fkey"
    FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
