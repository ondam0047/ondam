-- 지투(지역사회서비스투자사업) 지원 — ChildService 에 사업 유형 분기 컬럼 추가.
-- 기존 데이터는 모두 발달바우처(DEVREHAB) 로 디폴트. 지자체별 별칭은 선택.
ALTER TABLE "ChildService" ADD COLUMN IF NOT EXISTS "programType"  TEXT NOT NULL DEFAULT 'DEVREHAB';
ALTER TABLE "ChildService" ADD COLUMN IF NOT EXISTS "programAlias" TEXT;
