-- 서비스 제공자명(제공기관명) 아동별 저장 — 프리랜서 다센터 대응
ALTER TABLE "ChildService" ADD COLUMN IF NOT EXISTS "org" TEXT;
