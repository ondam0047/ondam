-- 요일별 시간대 오버라이드. "1=09:00~09:50,3=10:00~10:50" 형식.
-- null/빈 값이면 모든 반복 요일에 defaultSlot 을 적용.
ALTER TABLE "ChildService" ADD COLUMN IF NOT EXISTS "daySlots" TEXT;
