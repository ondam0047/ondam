-- 수기 기록지 모드 — 한글파일 출력 시 결과·총평을 비우고 사용자가 인쇄 후 손으로 채움.
-- 3개 보조 칸(제공일자/승인일자/승인번호)은 별도 토글로 출력 여부 결정.
ALTER TABLE "Center" ADD COLUMN IF NOT EXISTS "manualMode"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Center" ADD COLUMN IF NOT EXISTS "printUseDay" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Center" ADD COLUMN IF NOT EXISTS "printPayDay" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Center" ADD COLUMN IF NOT EXISTS "printApprNo" BOOLEAN NOT NULL DEFAULT true;
