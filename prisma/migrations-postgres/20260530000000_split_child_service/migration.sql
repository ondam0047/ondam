-- 한 아동이 여러 서비스를 동시에 받을 수 있도록
-- Child(사람) → ChildService(서비스 단위) 로 분리.
-- 멱등(idempotent) 하게 작성: 부분 적용된 상태에서도 다시 실행 가능.

-- 1) Center.serviceTypes 추가
ALTER TABLE "Center" ADD COLUMN IF NOT EXISTS "serviceTypes" TEXT NOT NULL DEFAULT '언어재활,놀이치료,감각통합치료';

-- 2) ChildService 테이블 생성
CREATE TABLE IF NOT EXISTS "ChildService" (
    "id" SERIAL PRIMARY KEY,
    "childId" INTEGER NOT NULL,
    "therapistId" INTEGER,
    "serviceType" TEXT NOT NULL,
    "defaultSlot" TEXT,
    "defaultDays" TEXT,
    "defaultUnit" INTEGER NOT NULL DEFAULT 65000,
    "defaultTarget" INTEGER NOT NULL DEFAULT 5,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ChildService_childId_idx" ON "ChildService"("childId");
CREATE INDEX IF NOT EXISTS "ChildService_therapistId_idx" ON "ChildService"("therapistId");

DO $$ BEGIN
  ALTER TABLE "ChildService" ADD CONSTRAINT "ChildService_childId_fkey"
    FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ChildService" ADD CONSTRAINT "ChildService_therapistId_fkey"
    FOREIGN KEY ("therapistId") REFERENCES "Therapist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Child 데이터 → ChildService 복사 (이미 옮긴 적 있으면 건너뜀)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "ChildService" LIMIT 1) THEN
    INSERT INTO "ChildService" (
      "childId", "therapistId", "serviceType",
      "defaultSlot", "defaultDays", "defaultUnit", "defaultTarget",
      "active", "createdAt", "updatedAt"
    )
    SELECT
      "id", "therapistId", "serviceType",
      "defaultSlot", "defaultDays", "defaultUnit", "defaultTarget",
      "active", "createdAt", "updatedAt"
    FROM "Child";
  END IF;
END $$;

-- 4) Schedule 에 childServiceId 추가 + 백필
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "childServiceId" INTEGER;

UPDATE "Schedule" s
SET "childServiceId" = cs."id"
FROM "ChildService" cs
WHERE cs."childId" = s."childId" AND s."childServiceId" IS NULL;

-- 5) Record 에 childServiceId 추가 + 백필
ALTER TABLE "Record" ADD COLUMN IF NOT EXISTS "childServiceId" INTEGER;

UPDATE "Record" r
SET "childServiceId" = cs."id"
FROM "ChildService" cs
WHERE cs."childId" = r."childId" AND r."childServiceId" IS NULL;

-- 6) NOT NULL 강제 (이미 NOT NULL 이면 무시됨)
ALTER TABLE "Schedule" ALTER COLUMN "childServiceId" SET NOT NULL;
ALTER TABLE "Record"   ALTER COLUMN "childServiceId" SET NOT NULL;

-- 7) Schedule 의 옛 인덱스·FK·컬럼 제거 (UNIQUE 는 INDEX 로 만들어졌음 — DROP INDEX 사용)
DROP INDEX IF EXISTS "Schedule_childId_year_month_key";
ALTER TABLE "Schedule" DROP CONSTRAINT IF EXISTS "Schedule_childId_year_month_key";
ALTER TABLE "Schedule" DROP CONSTRAINT IF EXISTS "Schedule_childId_fkey";
ALTER TABLE "Schedule" DROP COLUMN IF EXISTS "childId";

DROP INDEX IF EXISTS "Record_childId_year_month_key";
ALTER TABLE "Record" DROP CONSTRAINT IF EXISTS "Record_childId_year_month_key";
ALTER TABLE "Record" DROP CONSTRAINT IF EXISTS "Record_childId_fkey";
ALTER TABLE "Record" DROP COLUMN IF EXISTS "childId";

-- 8) 새 FK + UNIQUE
DO $$ BEGIN
  ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_childServiceId_fkey"
    FOREIGN KEY ("childServiceId") REFERENCES "ChildService"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Schedule_childServiceId_year_month_key" ON "Schedule"("childServiceId", "year", "month");

DO $$ BEGIN
  ALTER TABLE "Record" ADD CONSTRAINT "Record_childServiceId_fkey"
    FOREIGN KEY ("childServiceId") REFERENCES "ChildService"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Record_childServiceId_year_month_key" ON "Record"("childServiceId", "year", "month");

-- 9) Child 에서 서비스 관련 컬럼 제거 (이관 완료)
ALTER TABLE "Child" DROP CONSTRAINT IF EXISTS "Child_therapistId_fkey";
ALTER TABLE "Child" DROP COLUMN IF EXISTS "therapistId";
ALTER TABLE "Child" DROP COLUMN IF EXISTS "serviceType";
ALTER TABLE "Child" DROP COLUMN IF EXISTS "defaultSlot";
ALTER TABLE "Child" DROP COLUMN IF EXISTS "defaultDays";
ALTER TABLE "Child" DROP COLUMN IF EXISTS "defaultUnit";
ALTER TABLE "Child" DROP COLUMN IF EXISTS "defaultTarget";
