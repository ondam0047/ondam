-- 한 아동이 여러 서비스(언어재활/놀이치료 등)를 동시에 받을 수 있도록
-- Child(사람) → ChildService(서비스 단위)로 분리.
-- 기존 데이터를 보존하며 단계적으로 이전.

-- 1) Center 에 serviceTypes 컬럼 추가
ALTER TABLE "Center" ADD COLUMN "serviceTypes" TEXT NOT NULL DEFAULT '언어재활,놀이치료,감각통합치료';

-- 2) ChildService 테이블 생성
CREATE TABLE "ChildService" (
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

CREATE INDEX "ChildService_childId_idx" ON "ChildService"("childId");
CREATE INDEX "ChildService_therapistId_idx" ON "ChildService"("therapistId");

ALTER TABLE "ChildService" ADD CONSTRAINT "ChildService_childId_fkey"
    FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChildService" ADD CONSTRAINT "ChildService_therapistId_fkey"
    FOREIGN KEY ("therapistId") REFERENCES "Therapist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3) 기존 Child 데이터를 ChildService 로 복사 (1:1 매핑)
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

-- 4) Schedule 에 childServiceId 컬럼 추가 + 백필
ALTER TABLE "Schedule" ADD COLUMN "childServiceId" INTEGER;
UPDATE "Schedule" s
SET "childServiceId" = cs."id"
FROM "ChildService" cs
WHERE cs."childId" = s."childId";

-- 5) Record 에 childServiceId 컬럼 추가 + 백필
ALTER TABLE "Record" ADD COLUMN "childServiceId" INTEGER;
UPDATE "Record" r
SET "childServiceId" = cs."id"
FROM "ChildService" cs
WHERE cs."childId" = r."childId";

-- 6) 백필 끝났으므로 NOT NULL 강제
ALTER TABLE "Schedule" ALTER COLUMN "childServiceId" SET NOT NULL;
ALTER TABLE "Record"   ALTER COLUMN "childServiceId" SET NOT NULL;

-- 7) Schedule, Record 의 옛 childId 관련 제약·인덱스·컬럼 제거
ALTER TABLE "Schedule" DROP CONSTRAINT "Schedule_childId_year_month_key";
ALTER TABLE "Schedule" DROP CONSTRAINT "Schedule_childId_fkey";
ALTER TABLE "Schedule" DROP COLUMN "childId";

ALTER TABLE "Record" DROP CONSTRAINT "Record_childId_year_month_key";
ALTER TABLE "Record" DROP CONSTRAINT "Record_childId_fkey";
ALTER TABLE "Record" DROP COLUMN "childId";

-- 8) Schedule, Record 에 새 FK + 유니크 인덱스
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_childServiceId_fkey"
    FOREIGN KEY ("childServiceId") REFERENCES "ChildService"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Schedule_childServiceId_year_month_key" ON "Schedule"("childServiceId", "year", "month");

ALTER TABLE "Record" ADD CONSTRAINT "Record_childServiceId_fkey"
    FOREIGN KEY ("childServiceId") REFERENCES "ChildService"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Record_childServiceId_year_month_key" ON "Record"("childServiceId", "year", "month");

-- 9) Child 에서 서비스 관련 컬럼 제거 (ChildService 로 이관 완료)
ALTER TABLE "Child" DROP CONSTRAINT IF EXISTS "Child_therapistId_fkey";
ALTER TABLE "Child" DROP COLUMN "therapistId";
ALTER TABLE "Child" DROP COLUMN "serviceType";
ALTER TABLE "Child" DROP COLUMN "defaultSlot";
ALTER TABLE "Child" DROP COLUMN "defaultDays";
ALTER TABLE "Child" DROP COLUMN "defaultUnit";
ALTER TABLE "Child" DROP COLUMN "defaultTarget";
