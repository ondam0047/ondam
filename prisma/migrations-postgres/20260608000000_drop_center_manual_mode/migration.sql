-- 수기 기록지 모드 제거 — 일반 기록지에서 결과칸만 비우면 되므로 별도 모드 불필요.
ALTER TABLE "Center" DROP COLUMN IF EXISTS "manualMode";
ALTER TABLE "Center" DROP COLUMN IF EXISTS "printUseDay";
ALTER TABLE "Center" DROP COLUMN IF EXISTS "printPayDay";
ALTER TABLE "Center" DROP COLUMN IF EXISTS "printApprNo";
