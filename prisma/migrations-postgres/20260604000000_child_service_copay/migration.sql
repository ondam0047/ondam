-- 월 본인부담금 (부모님이 매월 내는 금액)
-- 일정표 자동 채움용. null 이면 사용자가 수동 입력.
ALTER TABLE "ChildService" ADD COLUMN IF NOT EXISTS "monthlyCopay" INTEGER;
